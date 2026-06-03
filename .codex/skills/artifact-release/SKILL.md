---
name: artifact-release
description: Use when preparing, validating, tagging, publishing, or documenting an Artifact release. Enforces the repository release template and release gate before any tag or GitHub Release is created.
---

# Artifact Release

Use this skill for every Artifact release task, including release prep, version
bump, release notes, tag creation, GitHub Release publication, or post-release
status updates.

## Required Reads

Before changing release state, read:

- `AGENTS.md`
- `docs/release-template.md`
- `docs/production-readiness.md`
- `docs/roadmap.md`
- the active `docs/version-plans/vX.Y.md`

## Hard Rule

Never tag or publish an Artifact release from free-form notes. Create or update
`docs/releases/vX.Y.Z.md` from `docs/release-template.md` first. If the template
cannot be filled, stop and report the missing release facts.

## Workflow

1. Confirm the intended version and release scope.
2. Instantiate `docs/release-template.md` into `docs/releases/vX.Y.Z.md`.
3. Fill highlights, scope boundaries, validation, manual QA, accepted risks, and
   release checklist.
4. Update package metadata for public version releases:
   - `package.json`
   - `apps/web/package.json`
   - `package-lock.json`
5. Update `docs/roadmap.md`, `docs/production-readiness.md`, and the version
   plan status.
6. Run the release gate:
   - `npm run check`
   - `npm run build`
   - `npm run test:browser`
7. If release scope touched node-editor performance-sensitive paths, run
   `npm run perf:node-editor`; otherwise record why it was not required.
8. Commit only after the template-backed release notes and validation status are
   complete.
9. Create the tag only after the release commit exists and the worktree is
   clean.
10. Publish the GitHub Release using `docs/releases/vX.Y.Z.md` as the body.

## Refusal Conditions

Do not tag or publish when:

- release notes do not use the template;
- validation commands are missing or failed;
- accepted risks are known but not documented;
- package metadata and tag version disagree;
- roadmap/version-plan status still presents the release as active future work;
- worktree is dirty after the intended release commit.
