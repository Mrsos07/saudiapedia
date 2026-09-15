# Editorial dashboard sign-in

The stable sign-in route is `/admin/login`. Its branding is registered through
Payload 3.88 `beforeLogin`, `afterLogin`, and `graphics.Logo`, using the explicit
map in `src/app/(payload)/admin/importMap.ts`.

- Payload still owns the email/password form, sessions, errors, safe redirects,
  login limits, and first-user bootstrap. No replacement authentication API exists.
- The language button uses Payload's translation provider. Arabic is RTL and
  English is LTR on the same route. Copy lives in `src/components/admin/login-copy.ts`.
- Styling is scoped to login and setup. Zain uses the existing single Google Fonts
  import; requests go to `fonts.googleapis.com` and `fonts.gstatic.com`.
- With no CMS configuration, the route shows equivalent Arabic/English setup
  guidance, not a credentials form. Partial configuration still fails closed.
- A configured empty users collection leads to Payload's first-administrator
  setup. Complete migrations and keep bootstrap private before using it.
- Email recovery is not configured; the page explicitly directs users to their
  administrator. Do not assume the built-in recovery link can deliver email.

## Verification and limits

For this UI change, `npm run typecheck` passed, all 36 unit tests passed, and
`npm run lint` returned zero errors and four existing unused-argument warnings in
the generated initial migration. A browser check of the unconfigured route at
390px width found no horizontal overflow, both locale directions, Zain, and no
password fields.

Configured form rendering, language switching, successful login, and database
bootstrap have not been integration-tested. Database migrations were not resumed
as part of this UI task. No production build or deployment is claimed.