# OpsTrack

OpsTrack is the platform. It has two modules:

- **PettyTrack** - petty cash, advances, expenses and submissions to Accounts.
- **AttendTrack** - staff attendance (check in / out, breaks) at `/attendance`.

## AttendTrack

- Roles: Sr. Ops Manager (`om`) = everything. Sr. SO (`sso`) = add entries for LHR + ISB, see all times and reports.
  Support Officer (`so`) and Security Guard (`guard`) = data entry only for their own office, no times shown.
- Tables (created automatically on first request): `pc2_staff`, `pc2_attendance`; `pc2_users` gains `phone`, `shift` and the `guard` role.
- Times are entered and shown in Pakistan time (Asia/Karachi). Break allowance: `BREAK_LIMIT_MIN` in `src/lib/att.js`.
- Guards sign in with an email + password created on the Team page and only ever see /attendance.
