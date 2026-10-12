# Software development life cycle

How a change travels from an idea to a church's booth computer.

```
 1 Plan ──► 2 Build ──► 3 Verify ──► 4 Integrate ──► 5 Release ──► 6 Operate
 issue      feature/*    CI + manual   PR → develop    release/* → main   feedback → issue
                                                     tag vX.Y.Z → GitHub release
```

## 1. Plan

- Every piece of work starts as a **GitHub issue** (bug or feature template).
- Issues are grouped in a **milestone** per version (`v0.1.0`, `v0.2.0`, …).
- Anything that needs a design decision gets it written in the issue before code.

## 2. Build

- Branch from `develop` following [Git flow](../CONTRIBUTING.md#branches-git-flow).
- Keep Spresenter/PCO specifics at the edges: business logic lives in
  `src/core/` behind small ports so it can be unit tested (see
  [architecture](architecture.md)).
- Develop against a real Spresenter with **Settings → Plugins → Load folder
  (dev)** and `npm run dev`.

## 3. Verify

Automated — the **CI** workflow on every push and pull request:

| Step            | Command                  | Fails when                                                                 |
| --------------- | ------------------------ | -------------------------------------------------------------------------- |
| Version check   | `npm run verify:version` | `manifest.json` and `package.json` disagree                                |
| Lint            | `npm run lint`           | ESLint errors                                                              |
| Format          | `npm run format:check`   | Code not formatted with Prettier                                           |
| Typecheck       | `npm run typecheck`      | TypeScript errors                                                          |
| Unit tests      | `npm run test:coverage`  | A test fails or `src/core` coverage drops below 85 % lines / 80 % branches |
| Build + package | `npm run package`        | The plugin can't be built or zipped                                        |

It runs on Node 20 and 22, and uploads the installable `.zip` as a build
artifact so reviewers can install exactly what CI built.

Governance — the **PR governance** workflow checks the branch flow and the
Conventional Commit PR title.

Manual — the [manual test plan](manual-test-plan.md) covers what unit tests
can't: the Spresenter runtime and a real Planning Center account. Required for
every release and for PRs that touch `src/code.ts` or the UI.

## 4. Integrate

- Pull request into `develop`, using the PR template.
- Merge only when CI and PR governance are green. Squash-merge so `develop`
  reads as one Conventional Commit per change.
- Update `CHANGELOG.md` under **Unreleased** in the same PR.

## 5. Release

1. Cut `release/X.Y.Z` from `develop`. Only fixes and version/changelog edits
   land here from now on.
2. Bump `version` in `package.json` **and** `manifest.json` (CI enforces they
   match) and date the changelog section.
3. Open a PR into `main`. Download the zip from the PR's CI artifacts and run the
   [manual test plan](manual-test-plan.md), ideally during a rehearsal.
4. Merge into `main`, then tag and push:
   ```bash
   git switch main && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
5. The **Release** workflow re-runs the whole pipeline, checks that the tag is
   on `main` and equals the manifest version, then publishes a GitHub release
   with `io.github.fadao23.pco-timers-X.Y.Z.zip` and the changelog section as
   notes.
6. Merge `main` back into `develop`.

**Versioning** — [SemVer](https://semver.org/). While `0.x`, a minor bump may
change behaviour; from `1.0.0` breaking changes need a major bump. Adding a
permission to `manifest.json` is always called out in the changelog, because
users must re-approve it on update.

**Hotfixes** — branch `hotfix/X.Y.Z+1` from `main`, fix, bump the patch version,
PR into `main`, tag, then merge back into `develop`.

## 6. Operate

- Users install the zip from the
  [Releases page](https://github.com/fadao23/planning-center-timers-spresenter/releases)
  via **Settings → Plugins → Install (.zip/folder)**. Reinstalling updates in place.
- Problems come back as issues (bug template asks for Spresenter version, plugin
  version and the panel's error message).
- Dependabot opens weekly dependency PRs against `develop`; they follow the same
  CI gate.
