# Version Planning

Artifact versions are scoped around one product promise or one technical risk.
Do not use a version as a bucket for unrelated improvements that happened during
the same week.

## Version Split Criteria

Every planned version should have one release thesis: a short sentence that
explains what the release makes possible, safer, or clearer.

Examples:

- v0.29: recover the public product surface and terminology.
- v0.30: protect editor UI changes with visual baselines and a design-system
  foundation.
- A future sharing release: make large projects shareable without URL payload
  limits.

Split work into a separate version when it introduces a second thesis, a second
major risk surface, or a second critique/prototype loop.

## Scope Boundaries

Prefer one primary blast radius per version:

- public product surface: home, showcase, docs, navigation, product copy
- editor workflow: layers, nodes, Add Library, selection, inspectors
- render/export: preview parity, renderer internals, thumbnails, export output
- persistence/packages: local projects, `.artifact` files, assets, fonts
- backend/account: share links, catalog sync, auth, server storage
- design system: tokens, shared primitives, style-guide specimens
- testing/release confidence: visual baseline, browser coverage, release gate

Supporting changes are fine when they make the main thesis safer. A supporting
change should not need its own product narrative, broad test matrix, or design
critique to be understood.

## Acceptance Criteria

A version plan must define checkable acceptance criteria before implementation
is treated as release scope. Good criteria prove behavior, not intent:

- route exists and links resolve
- editor state survives undo, save/open, or export
- preview and export use the canonical renderer path
- docs and roadmap reflect the changed product model
- focused unit/render/browser tests cover the risky behavior
- release gate commands are listed and eventually pass

If the criterion is only "make it better", keep the work in discovery until the
expected outcome becomes testable.

## Discovery Versus Release Scope

Exploration is allowed, but it is not automatically release scope.

Discovery work includes broad visual experiments, landing directions, Mobbin
research, critique rounds, and prototypes where the final product direction is
still unclear. Keep discovery in notes, prototypes, or a future version plan
until it has:

- a selected direction
- explicit non-goals
- acceptance criteria
- a validation path

Do not let a failed or abandoned prototype silently reshape the release.

## Pulling Work Forward

Pull deferred work into the active version only when all of these are true:

- it strengthens the active release thesis
- it does not change a protected surface unexpectedly
- it can be validated with the active version's test strategy
- the version plan and roadmap are updated before implementation is called done

If any of those are false, create or update a future version plan instead.

## Release Notes Contract

The release notes should restate the release thesis and boundary:

- what changed
- what deliberately did not change
- which risks were accepted
- which validation passed

Use `docs/release-template.md` for the final release file. The release template
is the publication contract; this document is the planning contract.
