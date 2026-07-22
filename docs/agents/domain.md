# Domain Docs

This is a single-context repository. Engineering skills should read the root
`CONTEXT.md` for canonical domain language and the relevant records under
`docs/adr/` before planning or changing architecture.

## Consumer Rules

- Use the glossary's canonical terms in issue titles, plans, tests, and code.
- Avoid synonyms that `CONTEXT.md` explicitly rejects.
- Read only the ADRs relevant to the surface or boundary being changed.
- Surface a conflict with an accepted ADR instead of silently overriding it.
- Use `domain-modeling` when a project-specific term is genuinely unresolved.
- Add an ADR only for a hard-to-reverse, surprising decision that resolves a
  real tradeoff.

If a future architecture gains genuinely separate bounded contexts, introduce
`CONTEXT-MAP.md` and per-context glossaries deliberately rather than inferring
multiple contexts from the current monorepo package layout.
