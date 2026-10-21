import { getUser } from '@/lib/auth';
import { publicKey } from '@/lib/push';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await getUser();
  if (!u) return Response.json({}, { status: 401 });
  return Response.json({ key: await publicKey() });
}