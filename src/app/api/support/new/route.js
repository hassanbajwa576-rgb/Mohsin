import { getUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { logEvent } from '@/lib/audit';
import { SUPPORT_ROLES, allOffices, validDate } from '@/lib/att';
import { notifyRoles } from '@/lib/notify';
import { CLABEL, PLABEL, WLABEL, DUE_DAYS, refOf } from '@/lib/support';

export const dynamic = 'force-dynamic';

const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_FILE = 2 * 1024 * 1024;
const MAX_TOTAL = 4 * 1024 * 1024;
const MAX_FILES = 4;
const t = (fd, k) => String(fd.get(k) ?? '').trim();

// Record a complaint, with up to four pictures or PDFs. The form resizes pictures before sending.
export async function POST(req) {
  const u = await getUser();
  if (!u) return Response.json({ ok: false, error: 'Please sign in again.' }, { status: 401 });
  if (!SUPPORT_ROLES.includes(u.role) || (u.totp_required && !u.totp_enabled)) return Response.json({ ok: false, error: 'Not allowed.' }, { status: 403 });
  let fd;
  try {
    fd = await req.formData();
  } catch {
    return Response.json({ ok: false, error: 'The files were too large to send. Try fewer or smaller pictures.' }, { status: 413 });
  }
  const title = t(fd, 'title').slice(0, 120);
  const description = t(fd, 'description').slice(0, 2000);
  const category = t(fd, 'category');
  const priority = t(fd, 'priority');
  const ctype = WLABEL[t(fd, 'ctype')] ? t(fd, 'ctype') : 'staff';
  if (title.length < 3) return Response.json({ ok: false, error: 'Write a short title for the complaint.' }, { status: 400 });
  if (!description) return Response.json({ ok: false, error: 'Describe what happened.' }, { status: 400 });
  if (!CLABEL[category]) return Response.json({ ok: false, error: 'Choose a category.' }, { status: 400 });
  if (!PLABEL[priority]) return Response.json({ ok: false, error: 'Choose a priority.' }, { status: 400 });
  const code = allOffices(u) ? t(fd, 'office') : u.office_code;
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [code]))[0];
  if (!off) return Response.json({ ok: false, error: 'Choose the office.' }, { status: 400 });
  const due = t(fd, 'due_on');
  if (due && !validDate(due)) return Response.json({ ok: false, error: 'Choose a valid due date.' }, { status: 400 });

  const files = fd.getAll('files').filter((f) => f && typeof f === 'object' && f.size > 0).slice(0, MAX_FILES);
  let total = 0;
  const parsed = [];
  for (const f of files) {
    if (!OK_TYPES.includes(f.type)) return Response.json({ ok: false, error: f.name + ' is not a picture or PDF.' }, { status: 400 });
    if (f.size > MAX_FILE) return Response.json({ ok: false, error: f.name + ' is larger than 2 MB.' }, { status: 400 });
    total += f.size;
    if (total > MAX_TOTAL) return Response.json({ ok: false, error: 'The files are larger than 4 MB together.' }, { status: 400 });
    parsed.push({ name: String(f.name || 'file').slice(0, 80), mime: f.type, size: f.size, b64: Buffer.from(await f.arrayBuffer()).toString('base64') });
  }

  const r = await q(
    `INSERT INTO pc2_complaints (office_id, title, description, category, priority, location, complainant_type, complainant_name, complainant_phone, due_on, raised_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE(NULLIF($10, '')::date, (now() AT TIME ZONE 'Asia/Karachi')::date + $11::int), $12) RETURNING id`,
    [off.id, title, description, category, priority, t(fd, 'location').slice(0, 120), ctype, t(fd, 'cname').slice(0, 80), t(fd, 'cphone').slice(0, 30), due, DUE_DAYS[priority], u.id]
  );
  const id = r[0].id;
  for (const f of parsed) {
    await q("INSERT INTO pc2_complaint_files (complaint_id, name, mime, size, data, uploaded_by) VALUES ($1, $2, $3, $4, decode($5, 'base64'), $6)", [id, f.name, f.mime, f.size, f.b64, u.id]);
  }
  await logEvent(u, 'create', 'complaint', id, refOf(id) + ' raised: ' + title + ' (' + CLABEL[category] + ', ' + PLABEL[priority] + ', ' + off.code + ')', null, { category, priority });
  await notifyRoles(['om', 'sso'], u.name + ' raised ' + refOf(id) + ' (' + PLABEL[priority] + '): ' + title, '/support/view?id=' + id, u.id);
  return Response.json({ ok: true, id });
}
