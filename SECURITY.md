# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's
[private vulnerability reporting](https://github.com/fadao23/planning-center-timers-spresenter/security/advisories/new)
instead. You should get an answer within a week.

## How credentials are handled

- The Planning Center Personal Access Token (Application ID + Secret) is stored
  in Spresenter's per-plugin storage on the local computer. Anyone with access to
  that computer's Spresenter data can read it — use an account whose permissions
  are limited to what LIVE control needs.
- The secret is only sent to `https://api.planningcenteronline.com`, as an HTTP
  Basic `Authorization` header. It is never sent to the panel UI or logged.
- **Disconnect Planning Center** in the panel deletes the stored token. Revoke the
  token in Planning Center if the computer is lost or shared.
- Messages coming from the panel are validated in the logic thread; plan and
  service-type ids must be numeric.
