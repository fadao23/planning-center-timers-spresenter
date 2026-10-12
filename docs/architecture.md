# Architecture

## The idea: Spresenter leads, Planning Center follows

Like ProPresenter's Planning Center LIVE integration, the operator drives the
service from Spresenter. Each **Next / Previous** makes one call to Planning
Center LIVE, and the Spresenter timer is set to end exactly where Planning
Center's item ends:

```
endTime (local) = live_start_at (PCO clock) + planned length − clock offset
```

Between advances the Spresenter timer counts down **locally**, in real time, with
no API traffic. A heartbeat re-reads LIVE at most once a minute, only to catch
changes made elsewhere (someone clicking Next in Planning Center itself).

A 90-minute service with 20 items costs roughly 20 advance calls + 90 heartbeat
reads — far below Planning Center's limit of about 100 requests per 20 seconds.

### Clock offset

The booth computer's clock and Planning Center's servers can disagree by a few
seconds. When we advance LIVE ourselves, Planning Center stamps `live_start_at`
while handling our request, so the midpoint of our request's round trip is our
best local estimate of that instant:

```
offset = live_start_at − (sentAt + receivedAt) / 2
```

Estimates from slow round trips (> 3 s) or absurd values (> 10 min) are ignored.
The offset is stored and reused after a restart.

## Code layout

```
src/
├── code.ts              logic thread entry: wires ports to Spresenter
├── env.d.ts             ambient `spresenter` types (+ `requests`, missing from SDK 0.4.0)
├── core/                pure, unit-tested logic — no Spresenter globals
│   ├── controller.ts    TimerSyncController: state machine, queue, timer decisions
│   ├── pco-client.ts    Planning Center Services v2 REST client (transport injected)
│   ├── live-state.ts    LIVE JSON:API document → flat LiveState
│   ├── timer-sync.ts    end-time / offset math, timer patch
│   ├── messages.ts      panel ⇄ logic protocol + validation
│   ├── format.ts        countdown formatting for the panel
│   ├── base64.ts        Basic-auth encoding without btoa/TextEncoder
│   └── pco-types.ts     JSON:API shapes
└── ui/                  React panel (sandboxed iframe), talks only to code.ts
```

`TimerSyncController` depends on **ports**, not on Spresenter:

| Port          | In the plugin                                 | In tests                   |
| ------------- | --------------------------------------------- | -------------------------- |
| `PcoApi`      | `PcoClient` over `spresenter.net.httpRequest` | `FakePco` (in-memory LIVE) |
| `TimerPort`   | `spresenter.timer.set / clear`                | `FakeTimer`                |
| `StoragePort` | `spresenter.storage`                          | `MemoryStorage`            |
| `now()`       | `Date.now`                                    | manual clock               |

Operations are **serialized** through a promise queue, so two quick presses of
Next are two advances, in order.

## Planning Center endpoints

Base: `https://api.planningcenteronline.com/services/v2`, HTTP Basic with a
Personal Access Token (Application ID : Secret).

| Purpose              | Call                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Validate token       | `GET /`                                                                                                    |
| Service types        | `GET /service_types?per_page=100&order=sequence`                                                           |
| Plans                | `GET /service_types/:st/plans?filter=past&order=-sort_date&per_page=1` and `filter=future&order=sort_date` |
| Read LIVE            | `GET /service_types/:st/plans/:plan/live?include=items,current_item_time`                                  |
| Take/release control | `POST …/live/toggle_control` (flips between nobody and the caller)                                         |
| Advance              | `POST …/live/go_to_next_item` / `go_to_previous_item` (`?include=items,current_item_time`)                 |

The same endpoints are used by the Bitfocus Companion
[Planning Center Services LIVE module](https://github.com/bitfocus/companion-module-planningcenter-serviceslive).

## Spresenter surface

| What                           | API                                                                                                | Permission                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------- |
| Planning Center HTTP calls     | `net.httpRequest`                                                                                  | `net:connect`                     |
| Drive the app timer            | `timer.set({ mode: 'target', endTime, … })`, `timer.clear()`                                       | `timer:write` (+ `timer:read`)    |
| Credentials, selection, offset | `storage.*`                                                                                        | —                                 |
| Panel                          | `ui.postMessage` / `ui.onmessage`                                                                  | —                                 |
| Stream Deck / automation       | `requests.on('next' \| 'previous' \| 'resync' \| 'take-control' \| 'release-control' \| 'status')` | — (caller needs `plugins:invoke`) |

`"background": true` keeps the logic running (and the actions registered)
without the panel open.

## Assumptions verified manually

These depend on the Spresenter runtime and are covered by the
[manual test plan](manual-test-plan.md), not unit tests:

1. `timer.set` with `mode: 'target'` and an epoch-milliseconds `endTime` counts
   down to that instant and goes negative with `allowNegative`.
2. `setInterval` exists in the logic vm (otherwise the open panel provides the
   heartbeat via `tick` messages).
3. `requests.on` is available in the installed Spresenter version.
