# Planning Center Timers for Spresenter

[![CI](https://github.com/fadao23/planning-center-timers-spresenter/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/fadao23/planning-center-timers-spresenter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Spresenter](https://github.com/sonext-software/spresenter-plugin) plugin that
drives **Planning Center Services LIVE** from Spresenter and keeps the
**Spresenter timer** on the current plan item — the way ProPresenter does it.

- Press **Next / Previous** in Spresenter (panel, Stream Deck or automation) and
  Planning Center LIVE moves with you.
- The Spresenter timer counts down the item's planned length from the moment
  Planning Center started it, and goes negative on overrun — same clock as LIVE.
- The countdown runs locally in real time: **one API call per item change**, plus
  a light once-a-minute check that catches changes made in Planning Center itself.

> **Status: 0.1.0 (pre-release).** Runtime assumptions about Spresenter are being
> verified with the [manual test plan](docs/manual-test-plan.md).

## Install

1. Download `io.github.fadao23.pco-timers-<version>.zip` from
   [Releases](https://github.com/fadao23/planning-center-timers-spresenter/releases).
2. In Spresenter (0.3.0 or later): **Settings → Plugins → Install (.zip/folder)**.
3. Approve the permissions: network (to reach Planning Center), timer read/write.

## Use

1. In Planning Center, create a **Personal Access Token**
   (api.planningcenteronline.com → Personal Access Tokens). The account must be
   allowed to control LIVE for your service type.
2. Open the **Planning Center** panel in Spresenter, paste the Application ID and
   Secret, **Connect**.
3. Pick the service type and today's plan.
4. Press **Next** when the service starts. The plugin takes LIVE control if
   needed, advances Planning Center, and sets the Spresenter timer.

### Stream Deck / automations

The plugin exposes named actions on Spresenter's API:

```
POST /api/v1/plugins/io.github.fadao23.pco-timers/requests/next
POST /api/v1/plugins/io.github.fadao23.pco-timers/requests/previous
POST /api/v1/plugins/io.github.fadao23.pco-timers/requests/resync
POST /api/v1/plugins/io.github.fadao23.pco-timers/requests/take-control
POST /api/v1/plugins/io.github.fadao23.pco-timers/requests/release-control
POST /api/v1/plugins/io.github.fadao23.pco-timers/requests/status
```

Each returns `{ inControl, status, current, next, endTime }`. Inside Spresenter,
the **Send message to plugin** automation node can call the same actions.

## How it works

```
Operator presses Next
  → POST …/live/go_to_next_item            (1 Planning Center call)
  → item started at live_start_at, planned length L
  → spresenter.timer.set({ mode: 'target', endTime: live_start_at + L − clock offset })
  → Spresenter counts down locally — no more calls until the next item
```

Details, including clock-offset correction: [docs/architecture.md](docs/architecture.md).

## Develop

Requirements: Node.js 20+, Spresenter ≥ 0.3.0.

```bash
npm ci
npm run dev        # rebuild dist/ on save
```

In Spresenter: **Settings → Plugins → Load folder (dev)** → this folder. Saving a
file hot-reloads the plugin.

| Command           | What it does                                                                  |
| ----------------- | ----------------------------------------------------------------------------- |
| `npm test`        | Unit tests (Vitest)                                                           |
| `npm run ci`      | Everything CI runs: version check, lint, format, typecheck, coverage, package |
| `npm run package` | Build and write `release/<id>-<version>.zip`                                  |

Contributing, Git flow and the release process: [CONTRIBUTING.md](CONTRIBUTING.md)
and [docs/sdlc.md](docs/sdlc.md).

## Security

Your Planning Center secret is stored only in Spresenter's per-plugin storage on
this computer and is never sent back to the panel. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Not affiliated with Planning Center or Sonext.
