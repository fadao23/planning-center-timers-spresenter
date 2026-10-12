# Contributing

This project follows a small but strict software development life cycle (SDLC):
**Git flow** for branches, **Conventional Commits** for history, **pull requests
with green CI** for every change, and **tagged releases** built by the pipeline —
never by hand. The full life cycle is described in [docs/sdlc.md](docs/sdlc.md).

## Branches (Git flow)

| Branch              | Purpose                                   | Branches from | Merges into              |
| ------------------- | ----------------------------------------- | ------------- | ------------------------ |
| `main`              | Released code only. Every commit = a tag. | —             | —                        |
| `develop`           | Integration of finished work. Default.    | `main`        | `release/*`              |
| `feature/*`         | New behaviour (`feature/plan-import`)     | `develop`     | `develop`                |
| `fix/*`             | Non-urgent bug fixes                      | `develop`     | `develop`                |
| `chore/*`, `docs/*` | Tooling, docs                             | `develop`     | `develop`                |
| `release/*`         | Stabilise a version (`release/0.2.0`)     | `develop`     | `main` **and** `develop` |
| `hotfix/*`          | Urgent fix of a released version          | `main`        | `main` **and** `develop` |

The **PR governance** workflow rejects pull requests that break these rules
(for example `feature/*` → `main`).

`main` and `develop` are protected: no direct pushes, no force pushes, and a
pull request can only merge when CI is green.

## Commits and PR titles

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <summary>

feat(live): take control automatically on the first advance
fix(timer): keep the countdown when PCO returns no length
docs: explain how to create a Personal Access Token
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`, `revert`. Add `!` for breaking changes (`feat!: …`).
PRs into `develop` are **squash-merged**, so the PR title becomes the commit —
the PR governance check validates it.

## Day-to-day workflow

```bash
git switch develop && git pull
git switch -c feature/short-description
npm ci
npm run dev            # rebuild on save; load the folder in Spresenter (dev)
npm test               # unit tests
npm run ci             # everything CI runs, before you push
git push -u origin feature/short-description
gh pr create --base develop
```

## Definition of Done

A change is done when:

- [ ] CI is green (lint, format, typecheck, tests with coverage thresholds, build, package).
- [ ] New logic in `src/core/` has unit tests; coverage stays above the thresholds.
- [ ] Behaviour that depends on Spresenter or Planning Center was checked with the
      [manual test plan](docs/manual-test-plan.md) and noted in the PR.
- [ ] `CHANGELOG.md` has an entry under **Unreleased**.
- [ ] Docs/README updated if the user-facing behaviour changed.

## Releasing

See [docs/sdlc.md → Release](docs/sdlc.md#5-release). In short:

1. `git switch -c release/X.Y.Z develop`
2. Bump `version` in **both** `package.json` and `manifest.json`; move
   **Unreleased** to `## [X.Y.Z] - YYYY-MM-DD` in `CHANGELOG.md`.
3. PR `release/X.Y.Z` → `main`. Run the manual test plan on the packaged zip from
   the PR's CI artifacts.
4. Merge (merge commit), then tag `vX.Y.Z` on `main` and push the tag. The
   **Release** workflow builds, verifies and publishes the GitHub release.
5. PR `main` → `develop` (or merge the release branch back) so `develop` has the
   version bump.
