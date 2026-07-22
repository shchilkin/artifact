# Issue Tracker: GitHub

Issues and planned work for this repository live in GitHub Issues under
`shchilkin/artifact`. Use the connected GitHub application when it supports the
operation; use `gh` for milestone, dependency, or repository operations that
the connector does not expose.

## Conventions

- Infer the repository from the configured Git remote when working locally.
- Read an issue body, labels, and comments before changing it.
- Publish approved tracer-bullet tickets in dependency order so blocking links
  can reference existing issue numbers.
- Prefer GitHub native issue dependencies. If they are unavailable, place a
  `Blocked by: #...` line in the issue body.
- Apply `ready-for-agent` only when the issue is fully specified, fits one fresh
  implementation context, and can be verified independently.
- Do not close, rewrite, or repurpose an existing issue unless the user has
  explicitly approved that tracker change.

## Pull Requests As A Triage Surface

External pull requests are not a request surface. Pull requests deliver work
that was already accepted through the normal planning and issue workflow; they
do not enter the issue-triage state machine.

## Skill Routing

When a skill says to publish a ticket, create a GitHub issue. When it says to
fetch a ticket, read the issue body, labels, milestone, and comments. Work the
dependency frontier: an issue is ready only when every blocking issue is
closed and it is otherwise marked `ready-for-agent`.
