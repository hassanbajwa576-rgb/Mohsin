# OpsTrack (attendance module for PettyTrack)

Adds staff attendance (check in / out, breaks) to PettyTrack at `/attendance`.

- Roles: Sr. Ops Manager (`om`) = everything. Sr. SO (`sso`) = add entries for LHR + ISB and see all times.
  Support Officer (`so`) and Security Guard (`guard`) = data entry only for their own office, no times shown.
- New tables (created automatically on first request): `pc2_staff`, `pc2_attendance`; `pc2_users` gains `phone`, `shift` and the `guard` role.
- Times are entered and shown in Pakistan time (Asia/Karachi). Break allowance: `BREAK_LIMIT_MIN` in `src/lib/att.js`.
- Guards sign in with an email + password created on the Team page and only ever see /attendance.
