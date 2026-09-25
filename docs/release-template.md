# Artifact Component Release Template

Use for every new core, Web or macOS release. Copy the fenced template to
`docs/releases/<component>/vX.Y.Z.md`, replace all bracketed placeholders and
choose the component's approved version. Historical `docs/releases/vX.Y.Z.md`
files and tags remain unchanged. See [component-releases.md](./component-releases.md)
for version sources, gate selection and the separate verify/draft/publish actions.

```markdown
# <component>/vX.Y.Z Release Notes

Artifact [release name] delivers [describe the component's release thesis].

## Highlights

- [describe the user-visible or core capability change]

## Scope Boundaries

- Included: [describe delivered scope]
- Deferred: [describe remaining scope]
- [describe rendering/export, graph, persistence, assets, fonts, AI and performance effects relevant to this component]

## Compatibility

- Document/package schema: [record supported versions and migration behavior]
- Embedded core: [record version and source/runtime identity for a client; adapter compatibility for core]
- Other components: [describe tested client/adaptor revisions and limits]
- [describe whether a client rebuild/update is required; a core release alone does not update clients]

## Validation

Validated on [YYYY-MM-DD] at [record full source commit or linked immutable build evidence].

- Shared compatibility: [record canonical WASM freshness, Rust tests/clippy, WASM and Swift/UniFFI document roundtrip/command checks]
- Component gate: [record the applicable Web or Mac commands and results; core uses shared gate]
- Build identity: [record retained identity artifact and core source/runtime hashes]
- Performance: [record results or why performance checks were not required]

## Manual QA

- [record actual component QA or justified non-applicability for a core-only change]

## Accepted Risks

- [record known limitations or explicitly state none]
```

The public release body contains concrete results and boundaries, not agent
checklists, tag instructions or promises of untested parity. The verifier
requires every heading to have content and rejects unfinished template fields.
Keep the release checklist in production readiness:

- Component version and all dependent metadata/lockfiles agree.
- Component plan is release-ready with completed acceptance criteria.
- Roadmap/readiness status includes the full namespaced tag.
- Shared compatibility and the selected application gate passed at the candidate.
- Relevant manual QA, performance evidence and accepted risks are recorded.
- Mac build number exceeds the last distributed build.
- Release commit is clean; an existing tag resolves to that exact commit.
- Tag/draft, deployment (Web only) and publication have separate authorization.
