# Manual test plan

Run before every release (on the zip from CI) and for PRs that touch
`src/code.ts` or the panel. Copy the checklist into the PR and tick it.

**Setup:** Spresenter ≥ 0.3.0, a Planning Center account allowed to control LIVE
for a test service type, a test plan with at least: one header, two timed items,
one song. Open that plan's LIVE view in a browser or the Services app next to
Spresenter.

## A. Install & runtime (first time on a Spresenter version)

- [ ] A1 Install the zip via **Settings → Plugins → Install (.zip/folder)**; the
      permission prompt lists network, timer read and timer write only.
- [ ] A2 The **Planning Center** panel tab appears and shows the connect form.
- [ ] A3 Leave the panel closed for 2 minutes after the first advance, then
      change the item in Planning Center: Spresenter follows within ~1 minute.
      If it only follows while the panel is open, `setInterval` is missing in the
      vm — note it in the PR (the panel heartbeat is the fallback).
- [ ] A4 `curl -X POST http://<spresenter-host>/api/v1/plugins/io.github.fadao23.pco-timers/requests/status`
      (with your API token) returns JSON. If it answers `404 unknown_action`,
      `requests` is not supported by this Spresenter version — note it.

## B. Connection

- [ ] B1 Wrong secret → error "rejected the credentials (401)"; nothing stored.
- [ ] B2 Correct token → organization name in the header, service types listed.
- [ ] B3 Restart Spresenter → still connected, same service type and plan selected.
- [ ] B4 **Disconnect Planning Center** → back to the connect form.

## C. Control & timer

- [ ] C1 Pick the plan → "Service not started", no timer change.
- [ ] C2 **Take LIVE control** → Planning Center shows this account controlling.
- [ ] C3 **Next** → Planning Center moves to the first timed item; the Spresenter
      timer shows the item's planned length and counts down.
- [ ] C4 Compare the Spresenter timer with Planning Center LIVE for 2 minutes:
      difference ≤ 1 s.
- [ ] C5 Let an item overrun: the timer goes negative, like Planning Center.
- [ ] C6 **Next** twice quickly → two advances, headers skipped, timer follows.
- [ ] C7 **Previous** → back one item, timer realigned.
- [ ] C8 Advance past the last item → "End of service", timer cleared.
- [ ] C9 Take control in Planning Center from another device, then press **Next**
      in Spresenter → the plugin takes control back and advances.
- [ ] C10 **Release LIVE control** → Planning Center shows nobody controlling.

## D. Resilience

- [ ] D1 Disconnect the network, press **Next** → clear network error, no crash;
      reconnect, **Resync** → recovers.
- [ ] D2 Change the item in Planning Center (not Spresenter) → Spresenter follows
      within ~1 minute (or immediately with **Resync**).
- [ ] D3 Stream Deck / automation: `POST …/requests/next` advances exactly like
      the panel button.

## Result

Record in the PR: Spresenter version, OS, plugin version, pass/fail per line,
and any notes on A3/A4.
