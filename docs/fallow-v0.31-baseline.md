# Fallow v0.31 Baseline

Captured on 2026-06-05 with `fallow@2.88.3` and JSON schema version 7.

Canonical local command:

```bash
FALLOW_AGENT_SOURCE=codex npm run --silent fallow -- > /private/tmp/artifact-fallow-baseline.json 2>/dev/null || true
```

For changed-code review:

```bash
FALLOW_AGENT_SOURCE=codex npm run --silent fallow:audit -- --base origin/development > /private/tmp/artifact-fallow-audit.json 2>/dev/null || true
```

If `fallow audit --base ...` returns exit code 2 while the worktree is dirty,
use the local report-only fallback:

```bash
FALLOW_AGENT_SOURCE=codex npm run --silent fallow:audit -- --base origin/development --gate all > /private/tmp/artifact-fallow-audit.json 2>/dev/null || true
```

During v0.31 release prep, that fallback returned `verdict: "fail"` because it
includes inherited package-manifest dependency findings for `@artifact/shared`
and `isbot`. CI keeps the Fallow job report-only while those findings are
triaged.

Do not treat this baseline as a deletion list. Every removal needs a focused
trace command, the lowest useful test, and normal release validation.

## Baseline Summary

| Area | Count |
| --- | ---: |
| Dead-code/dependency issues | 118 |
| Unused files | 4 |
| Unused exports | 71 |
| Unused types | 23 |
| Unused dependencies | 3 |
| Unlisted dependencies | 1 |
| Duplicate exports | 1 |
| Duplicate clone groups | 176 |
| Files with clones | 80 |
| Duplicated lines | 3,863 |
| Duplication percentage | 7.09% |
| Complexity findings | 228 |
| Critical complexity findings | 53 |
| High complexity findings | 59 |
| Circular dependencies | 0 |
| Re-export cycles | 0 |
| Unresolved imports | 0 |
| Boundary violations | 0 |

## First Findings

Fallow reported four unused-file candidates:

- `api/og.tsx`
- `apps/web/app/components/HeroCover.tsx`
- `apps/web/app/components/ParentalAdvisoryBadge.tsx`
- `apps/web/app/components/node-canvas/nodes/NodeEditorPanel.tsx`

Dependency findings need trace validation before any package metadata change:

- `@artifact/shared` appears unused from both `apps/api/package.json` and
  `apps/web/package.json`, but workspace build scripts rely on the shared
  package.
- `isbot` appears unused at the root and needs a route/runtime trace before
  removal.
- `@clerk/react` is imported by `apps/web/app/utils/clerkAuth.ts` without a
  direct dependency entry. Decide whether to add it directly or change the
  import boundary.

The duplicate export finding is `PostgresQueryClient` across API database
modules. This looks like an intentional local type alias pattern, so it should
not be removed without API repository review.

## Cleanup Backlog

Actionable now, after trace validation:

- Trace the four unused-file candidates with
  `npm exec fallow -- dead-code --trace-file <path> --format json --quiet`.
- Trace `@clerk/react`, `isbot`, and `@artifact/shared` with
  `npm exec fallow -- dead-code --trace-dependency <package> --format json --quiet`.
- Review API script/env duplication around
  `apps/api/scripts/export-job-image.mjs`,
  `apps/api/scripts/grant-ai-access.mjs`, `apps/api/scripts/migrate.mjs`,
  `apps/api/src/cleanupCli.ts`, and `apps/api/src/env.ts`.
- Add focused tests before refactoring `apps/web/app/utils/aiGenerationStatus.ts`,
  `apps/web/app/components/node-canvas/reducer.ts`, and
  `apps/web/app/components/node-canvas/inspector/effectSectionModel.ts`.
- Review `apps/web/app/utils/gpuRender.ts` exported measurement constants
  before removing or suppressing them.

Needs trace or product context:

- API contract/storage exports may be intentionally public even when only
  indirectly used.
- Node editor drag and area helpers are performance-sensitive; any cleanup
  there also requires the node-editor performance benchmark.
- Browser specs are high-change and duplication-prone by nature. Split only
  when it improves reviewability without hiding regression intent.

Accepted initial suppressions:

- None added in v0.31. The first release keeps findings visible while the team
  decides what should become a suppression policy.

False positives:

- None confirmed yet. Workspace and public API findings are classified as
  needs-trace until verified.

## CI Policy

v0.31 adds Fallow as a report-only CI job. It may warn or fail internally, but
the job is marked `continue-on-error` so the initial baseline cannot block PRs
or releases. A stricter gate should wait until the baseline is reviewed,
intentional public APIs are suppressed, and cleanup candidates have trace-backed
tests.
