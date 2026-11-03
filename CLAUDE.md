# OpsTrack (AlphaBOLD) - notes for working on this app

OpsTrack is the operations app for AlphaBOLD Pakistan: petty cash (expenses, advances, accounts), attendance, visitors, fuel cards, support, ExpRev, guard duty, roles. The owner is Mohsin Ghazanfar (Sr. Ops Manager). He writes short messages, sometimes in Roman Urdu; answer in English, keep replies short, and show a screenshot of UI work before pushing.

## Where things are
- Repo: `github.com/hassanbajwa576-rgb/Mohsin`, branch `main`. The Next.js 16 app (App Router, JavaScript, React 19) is in the **`src` folder** (its `package.json` is there).
- Database: Neon Postgres, tables `pc2_*`, reached through `q()` in `src/lib/db.js`. Schema is the `DDL` array in that file; it re-runs only when `SCHEMA_VERSION` changes, so **every DDL change needs a brand-new, never-used `SCHEMA_VERSION` string** (last used `2026-11-04-3`).
- Hosting: Vercel project `petty-cash-app` (live at opstrack-alphabold.vercel.app). A push to `main` deploys in about a minute. Free plan: 100 deploys a day, so batch changes into one commit per feature.
- Do not create or change anything on the Vercel/Neon accounts without asking the owner.

## Start of a session
1. If you do not have the code: `git clone https://github.com/hassanbajwa576-rgb/Mohsin.git`, then `cd Mohsin/src && npm install`.
2. `git log --oneline -15` to see the latest work. The code is the authority; do not trust old notes over it.
3. Local branch `ui-changes-oct16` is pushed with `git push origin ui-changes-oct16:main` (or work on `main` directly).

## Build, preview, test
- Build check from `src`: `npx next build`. The first attempt can print a SecurityFatalError notice and exit 1; run it again and it passes. Never run `next upgrade --agent=security`. No database is reachable locally, so real pages cannot run locally.
- UI screenshots: create a temporary route `src/app/preview-ui-tmpNNNN/page.js` (folders starting with `_` are ignored by Next) that renders the REAL components with mock data, start the dev server, screenshot at phone and desktop widths, then delete the temp route. The owner cannot see your browser, so send him the screenshots as files.
- Live checks: after a deploy is READY, load the live pages as the owner (he signs in himself; never type passwords). Check other roles with Team > "Sign in as" (it is logged) and always click "Return to my account" afterwards. Check Vercel runtime logs for errors (`since` 45 minutes; Hobby keeps about 1 hour).

## Push rules
- Stage explicit files; **never `git add -A`** (long filenames in `.next` and `node_modules`).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- UI changes: build, show a screenshot, push when the owner says "push". A regression that is live right now can be fixed and pushed first.

## How the app is organised (map only)
- Roles: `om` (Sr. Ops Manager, full access), `sso` (Sr. Support Officer, Imran), `so` (Support Officer), `guard`. They are rows in `pc2_roles` (built-in ones have `sys_key`); custom roles add a permission checklist. Permission keys are in `src/lib/perms.js` (attendance/fuel/visitor perms plus action perms `exp_approve`, `exp_delete`, `adv_issue`, `adv_return`, `adv_manage`, `acct_submit`, and `guard_duty`). Server actions check them with `need(null, perm)` in `src/lib/actions.js`; `getUser` in `src/lib/auth.js` merges role perms and pages. Pages a person may open are in `src/lib/pages.js`.
- Money: `fundSummary` in `src/lib/queries.js` is the cash model (pool, Sr. SO cash, SO cash, advance-only "BD-I" cash). Advance-only team members are `pc2_payees`; their advances have `issued_to` NULL and a `payee_id`.
- Phone layout for tables: the `tx` table classes (`c-title`, `c-amt`, `c-meta`, `hide-m`, `show-m`) in `src/app/globals.css`.
- Guard Duty (`/visitors/guards`): temporary guards with CNIC, duty dates, "in place of" and up to 10 pictures (kept 90 days after the last duty).

## Mistakes that broke the app before
- After moving code between files, search the old file for every constant/helper the moved block defined (a missing constant took the Support Officer home page down; `next build` did not catch it).
- Scripted multi-file text replacement can wreck a file: run `git diff --stat` afterwards.
- Reusing a `SCHEMA_VERSION` means the new column is never created.
- After any permission change, check what Imran (sso), Zubair (so) and a guard can open.
