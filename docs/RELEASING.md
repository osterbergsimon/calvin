# Releasing Calvin

Calvin is released from **`main`**, published as a version tag (`vX.Y.Z`), and
installed by pinning that tag. `develop` is the integration branch where work
lands first; testers can run it, but it is not a release.

This page is the whole process. Nothing here is manual except merging two pull
requests — the changelog, the tag and the container images are automated.

## Branches at a glance

| Branch | What it is | Who should install it |
|---|---|---|
| `develop` | Integration branch. Every push publishes `:develop` and `:sha-<commit>`. | Testers, contributors, the next release |
| `main` | Release branch. Only receives merges from `develop` and release-please commits. | Nobody directly — releases are installed by tag |
| `vX.Y.Z` (tag) | An immutable release on `main`. Publishes `:X.Y.Z`, `:X.Y`, `:latest` and `:sha-<commit>`. | Everyone else |

## The flow

```text
feature PR ──▶ develop ──(CI passes)──▶ promote PR ──▶ main ──▶ release PR ──▶ vX.Y.Z tag
                  │                      (automatic)            (automatic)      │
                  └─ :develop image                              CHANGELOG.md     └─ :X.Y.Z, :X.Y, :latest images
                                                                  GitHub Release
```

1. **Work lands on `develop`.** PRs target `develop`. Use
   [conventional commit](https://www.conventionalcommits.org/) messages
   (`feat:`, `fix:`, `docs:`, `chore:`, …) — release-please reads them to build
   the changelog and pick the version.
2. **CI succeeds on `develop`.**
   [`promote-develop-to-main.yml`](https://github.com/osterbergsimon/calvin/blob/develop/.github/workflows/promote-develop-to-main.yml)
   opens (or updates) the **Promote develop to main** PR. Merging it is a
   release-candidate step: `main` now builds exactly what passed CI on
   `develop`. Merge it as a **merge commit**, not a squash — `main` must stay a
   descendant of `develop` or the next promotion conflicts.
3. **release-please opens the release PR.** Every push to `main` runs
   [`release-please.yml`](https://github.com/osterbergsimon/calvin/blob/develop/.github/workflows/release-please.yml)
   (`googleapis/release-please-action`). It maintains a single PR titled
   `chore(main): release X.Y.Z` containing:
   - the new `CHANGELOG.md` section, grouped by commit type,
   - the bumped version in `.release-please-manifest.json`.

   Review it. If a commit should not appear, fix the wording on `develop` and
   promote again rather than editing the generated changelog by hand.
4. **Merge the release PR.** Keep the generated title. Merging it makes
   release-please create:
   - the tag `vX.Y.Z` on the merge commit (the PR already carries the
     `CHANGELOG.md` and `.release-please-manifest.json` update),
   - the GitHub Release with the changelog as its body.
5. **Images publish.** A tag created with `GITHUB_TOKEN` does not trigger
   another workflow's `push: tags` event, so the release workflow dispatches
   [`docker-build.yml`](https://github.com/osterbergsimon/calvin/blob/develop/.github/workflows/docker-build.yml) at the new tag.
   That build publishes the release images (below). Watch it under **Actions →
   Build and Push Docker Image**.

**Never create or push a `v*` tag by hand.** release-please is the only tag
source; a hand-made tag has no release PR, no changelog, and the next release
cannot find it as its predecessor.

## Versioning

- Pre-1.0: `feat` bumps the minor (`0.1.x` → `0.2.0`), `fix`/`perf` bump the
  patch, a breaking change bumps the minor (never to `1.0.0` on its own —
  `bump-minor-pre-major` is on).
- `0.1.0` is the starting version in
  [`.release-please-manifest.json`](https://github.com/osterbergsimon/calvin/blob/develop/.release-please-manifest.json). The
  first release PR proposes the next 0.x version from the commits since the
  repository began, so its changelog covers the project history up to that
  point.
- After `1.0.0`, normal semver applies: breaking → major, `feat` → minor.

## Images a release publishes

`ghcr.io/osterbergsimon/calvin` (public, multi-arch: `linux/amd64`,
`linux/arm64`, `linux/arm/v7`) gets, for tag `vX.Y.Z`:

| Tag | Use |
|---|---|
| `:X.Y.Z` | Reproducible pin for a release. Use this in production. |
| `:X.Y` | Latest patch of a minor line; moves within `X.Y`. |
| `:latest` | Most recent release. Convenient, not reproducible. |
| `:sha-<commit>` | That exact build; useful for rollback/debugging. |

`develop` continues to publish `:develop` (and `:sha-<commit>`) on every
push, unchanged.

## One-time repository setup

These are repository settings, not code. Check them once:

- **Settings → Actions → General → Workflow permissions**: *Read and write
  permissions*. The release workflow needs `contents: write` (tag + changelog
  commit) and `pull-requests: write` (release PR).
- **Allow GitHub Actions to create and approve pull requests**: on. Both the
  promotion PR and the release PR are opened with `GITHUB_TOKEN`; with this
  off, the release workflow fails at "create pull request".
- **`main` protection**: allow PRs from `develop` (the promotion PR) and the
  `autorelease: pending` release PR to be merged by a maintainer. Do not let
  anyone push tags directly.

## Installing a release

See [SETUP_SCRIPTS.md](setup/SETUP_SCRIPTS.md#installing-a-release-versus-develop)
for the exact commands. In short:

```bash
# Stable release: pin the tag in both the script URL and the checkout.
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/v0.1.0/scripts/setup.sh \
  | sudo GIT_BRANCH=v0.1.0 bash
```

`setup.sh` derives the image tag from the ref, so a tag install runs
`:v0.1.0` (no separate `CALVIN_IMAGE_TAG` needed). Re-running setup with a
newer tag moves both the checkout and the image. `update-calvin.sh` on such a
host refreshes host files from the pinned tag and keeps that image — to
upgrade, re-run setup with the new tag.

Before the first release exists, use the `develop` one-liner; it is also the
right choice for testing the next release.

## Hotfixes

Calvin has no separate hotfix branch. Fix on `develop`, let CI pass, merge the
promotion PR, then merge the release PR release-please opens (it will be a
patch bump). Emergency changes that cannot wait for `develop` can be merged
into `main` through a PR, but the same commit must also land on `develop` —
otherwise the next promotion conflicts.

## If a release goes wrong

| Symptom | What to do |
|---|---|
| Release PR has the wrong version | Close it, fix the commit messages on `develop`, promote again, re-run the workflow (Actions → Release Please → Run workflow). |
| No release PR after merging the promotion | Check the workflow run. A commit that is not conventional (e.g. a reworded merge) is ignored; `chore(main): release …` hidden commits do not bump. |
| Tag exists, images missing | Run **Actions → Build and Push Docker Image → Run workflow** with `push_image` ticked on the tag ref, or re-run the failed job. |
| Bad release already tagged | Do not delete/reuse the tag. Fix forward: land the fix on `develop`, promote, and cut the next patch release. |
