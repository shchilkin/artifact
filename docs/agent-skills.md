# Agent Skills

This project uses global Codex skills, but the repo has a preferred skill
profile. Use this profile when choosing which global skills to invoke for
Artifact work. Do not treat every globally installed skill as project-relevant.

## User-Facing Copy Boundary

Before implementing UI, read `docs/style-guide.md`. It defines project design
principles, tokens, component rules, layout rules, content style, and
implementation rules. Use `/docs/style-guide` as the live specimen catalog and
`apps/web/app/styles/tokens.css` as the token source.

Agent process text belongs in repo docs, not in app UI. When using design,
React, browser, or release skills, keep migration notes, implementation plans,
test strategy, release-plan commentary, and QA language in `docs/` by default.
Do not put copy such as "baseline", "migrate carefully", "before broad
adoption", or "focused Playwright checks" on user-facing routes, public pages,
editor panels, docs pages, or style-guide surfaces unless it directly helps the
person using that surface.

## Preferred Skills

### Must use when relevant

| Skill | Use for |
| --- | --- |
| `impeccable` | UI critique, polish, visual hierarchy, docs/showcase/landing refinement, product clarity, and design quality gates. |
| `react-router-framework-mode` | Route modules, route config, `Link`/`NavLink`, React Router typegen, SPA mode, loaders/actions if they are introduced. |
| `react-flow` | Node editor behavior, graph interaction, custom nodes, handles, edges, layout, and React Flow state patterns. |
| `browser:control-in-app-browser` | Local visual QA, interaction checks, screenshots, and browser-level verification. |
| `vercel:agent-browser-verify` | Quick dev-server verification after frontend changes when the target URL is known. |
| `vercel:shadcn` | shadcn/Radix primitive installation, composition, and source-owned UI primitive guidance. |
| `vercel-composition-patterns` | Shared component extraction, component APIs, slot/composition decisions, and avoiding boolean-mode components. |
| `vercel:react-best-practices` | React quality review after substantial TSX changes, hooks/state structure, and performance-sensitive component edits. |
| `artifact-release` | Project-local skill for release prep, version bumps, tags, and GitHub Releases. Must enforce `docs/release-template.md` before publishing. |

### Should use when relevant

| Skill | Use for |
| --- | --- |
| `web-design-guidelines` | Accessibility, UX, responsive behavior, and UI guideline audits. |
| `vercel-react-view-transitions` | Native-feeling page or surface transitions when motion is part of the request. |
| `github:yeet` | Publishing local work through branch, commit, push, and draft PR flow when requested. |
| `github:gh-fix-ci` | Investigating and fixing failing GitHub Actions or PR checks. |
| `github:gh-address-comments` | Addressing actionable GitHub PR review comments. |
| `codex-security:security-scan` | Repository or scoped security scans before release or after auth/storage/import/export changes. |
| `imagegen` | Generated raster assets, textures, hero experiments, or visual mock inputs when explicitly useful. |

## Excluded From The Project Profile

Do not include `frontend-design` in the default Artifact skill profile. The
installed copy appears Anthropic-origin (`Claude` is referenced in the skill
body) and its creative direction rules overlap with `impeccable`. Prefer
`impeccable` for UI design work unless the user explicitly asks to compare or
use `frontend-design`.

Do not use `react-router-data-mode` or `react-router-declarative-mode` for this
repo by default. Artifact uses React Router v7 Framework Mode.

## Installation Notes

Global installs are fine for personal work. Project-local installs are only
needed when the team wants the skill bundle to travel with the repository. When
using the open skills CLI, install from the repository root:

```bash
npx skills add owner/repo@skill-name -y
```

Use `-g` only for global installs:

```bash
npx skills add owner/repo@skill-name -g -y
```
