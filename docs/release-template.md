# Artifact Release Template

Use this template for every public Artifact release. Do not publish a tag or
GitHub release until every required section is filled in the versioned release
notes file.

Copy this file to `docs/releases/vX.Y.Z.md`, then replace every bracketed
placeholder.

```markdown
# vX.Y.Z Release Notes

Artifact vX.Y.Z is the [release name] release. [One or two sentences explaining
what changed for users or the product.]

This release [state the main boundary: what it changes and what it deliberately
does not change].

Document schema, graph traversal, renderer/export behavior, thumbnail
scheduling, AI scope, package export, and font policy [remain unchanged / changed
as described below].

## Highlights

- [User-visible or architecture-visible highlight.]
- [User-visible or architecture-visible highlight.]
- [User-visible or architecture-visible highlight.]

## Scope Boundaries

- Included: [scope item].
- Included: [scope item].
- Deferred: [explicitly deferred item].
- Deferred: [explicitly deferred item].

## Validation

Local validation passed during release prep on [YYYY-MM-DD]:

- `npm run check`
- `npm run build`
- `npm run test:browser`
- [targeted command or manual verification, if relevant]

The full browser gate passed with `[N] passed, [N] skipped` across Chromium,
Firefox, WebKit, mobile Chromium, and mobile WebKit.

Performance notes:

- `npm run perf:node-editor` [passed / was not required because ...].

## Manual QA

- [Manual check or user verification.]
- [Manual check or user verification.]

## Accepted Risks

- [Known risk or deferred follow-up.]
- [Known risk or deferred follow-up.]

## Release Checklist

- [ ] Version plan status updated.
- [ ] Roadmap updated.
- [ ] `docs/production-readiness.md` updated with release prep status.
- [ ] Package metadata bumped in `package.json`, `apps/web/package.json`, and
  `package-lock.json` when this is a public version release.
- [ ] Release notes saved at `docs/releases/vX.Y.Z.md`.
- [ ] Worktree clean after commit.
- [ ] Tag created as `vX.Y.Z`.
- [ ] Tag pushed to GitHub.
- [ ] GitHub Release published from these release notes.

## Release Notes

- Package metadata is bumped to `X.Y.Z` in `package.json`,
  `apps/web/package.json`, and `package-lock.json`.
- Tag the release as `vX.Y.Z`.
- Start the next planning pass from [next likely planning area], but do not
  treat deferred work as hidden release scope.
```

## Agent Rules

- A release notes file that does not follow this template is incomplete.
- If any validation result is missing, do not tag or publish the release.
- If any accepted risk is known but not listed, do not tag or publish the
  release.
- If the release changes editor state, render/export behavior, graph traversal,
  persistence, packages, fonts, AI, or performance-sensitive node-editor paths,
  include the relevant targeted validation and docs updates before tagging.
