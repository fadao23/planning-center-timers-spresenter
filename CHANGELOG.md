# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Planning Center connection with a Personal Access Token (stored locally, never sent to the panel).
- Service type and plan selection (latest past plan + upcoming plans).
- Planning Center LIVE control from Spresenter: take/release control, Next, Previous.
- Spresenter timer synced to the current item: `live_start_at + planned length`,
  corrected for clock offset, allowed to go negative on overrun; cleared at end of service.
- Once-a-minute resync to follow changes made in Planning Center, with 429 back-off.
- Named actions for Stream Deck / automations: `next`, `previous`, `resync`,
  `take-control`, `release-control`, `status`.
- Permissions: `net:connect`, `timer:read`, `timer:write`.

[Unreleased]: https://github.com/fadao23/planning-center-timers-spresenter/compare/main...develop
