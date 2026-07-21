# Artifact Domain Language

## Artifact Runtime

A framework-independent library that renders a serialized Artifact Composition
outside the editor as Mixed Media Artwork. The Runtime evaluates the Artwork's
motion while host applications control presentation policy without owning
Artifact's rendering semantics or choreography.

The first validation may receive an Artwork-owned Motion Recipe sidecar without
changing CanvasDocument or adding motion-authoring UI to the editor. If motion
proves useful, durable authoring remains a separate product decision.

The `0.1.0-alpha.3` prototype implements one explicitly bounded
`raster-base-effects` mode. It uses a host-owned raster plate for visual and
font parity, reads effect-layer identity and seed from a portable project, and
applies canonical Grain, Scanlines, Glitch, and Chromatic Aberration primitives. It is evidence for the
runtime boundary, not complete CanvasDocument playback.

The accepted follow-up direction is full document playback: a host such as the
portfolio should be able to pass a portable `.artifact` file to the runtime and
receive a rendered composition without supplying a flattened raster plate.
That work is a new renderer milestone, not an expansion of the accepted alpha
experiment.

_Avoid_: React player, portfolio renderer, complete document player (for the
alpha prototype)

## Artifact Composition

A visual document authored in Artifact. A Composition may represent a cover,
poster, scene, visual, or another kind of artwork without changing its core
identity when presented in a different context.

## Mixed Media Artwork

A live presentation of an Artifact Composition in which static and procedural
layers remain active instead of being reduced to one flat image. A Mixed Media
Artwork may change over time without requiring viewer input.

## Mixed Media Artwork Session

The active Runtime lifecycle for one presented Mixed Media Artwork. A Session
may start, pause, seek, resize, and end without redefining the Artwork as a
player or media file.

_Avoid_: Artifact Runtime Player, treating the Artwork itself as a Session

## Interactive Artwork

A Mixed Media Artwork whose presentation responds to viewer input or host
state. Interactivity is optional and may be added after time-based motion has
already made the artwork dynamic.

## Interactive Cover

An Interactive Artwork in a cover-specific context such as the portfolio.
Interactive Cover is a use of Artifact Runtime, not a document type inside
Artifact.

_Avoid_: interactive document type, cover runtime, requiring viewer input for
all Mixed Media Artwork

## Motion Recipe

An Artwork-owned description of time-based overrides for stable layer IDs in
one Artifact Composition. A Motion Recipe travels with the Artwork even when it
is authored or stored outside the Artifact editor during an experiment.

Recipe compatibility is semantic: stable layer identity, expected layer kind,
Runtime Profile, and Motion Control support must agree. A Composition checksum
may record provenance but does not make every visual edit incompatible.

_Avoid_: Artifact timeline, automatic effect animation, document migration,
using an exact package checksum as the only compatibility contract

## Motion Control

A typed, versioned control exposed by a Runtime Profile for animating one kind
of layer. A Motion Control may correspond to a persisted Composition property
or to deterministic procedural behavior, such as the phase of an emoji field.
Using a Motion Control does not mutate the Artifact Composition.

Motion Control names are semantic and namespaced by behavior, such as
`transform.*`, `emoji.*`, and `effect.*`. They do not expose abbreviated or
internal CanvasDocument property names as the Runtime interface.

The first Runtime Profile defines Motion Controls as relative modulation of the
authored Composition baseline. Recipes describe offsets, rotations, multipliers,
or procedural phase instead of repeating absolute layer values.

_Avoid_: arbitrary runtime callbacks, undocumented virtual layer properties,
duplicating authored baseline values in a Motion Recipe

## Motion Source

A deterministic time-based value generator connected to a Motion Control by a
Motion Recipe. The first Runtime Profile recognizes authored keyframes, periodic
oscillation, and seeded noise. Equal Composition, Recipe, and time inputs must
produce equal Motion Source values.

_Avoid_: arbitrary expressions, unseeded randomness, host callbacks as motion

## Temporal Mode

Artwork-owned choreography timing. A Motion Recipe declares a duration and
either loops or plays once and holds its final state. Hosts decide whether and
when playback runs, but do not redefine the Artwork's Temporal Mode.

## Neutral Frame

The authored Artifact Composition with no relative motion applied. Every Motion
Recipe begins at its Neutral Frame; a looping Recipe also returns to it at the
loop boundary. Static and reduced-motion presentation use this state.

## Presentation Policy

Host-owned decisions about when and how Mixed Media Artwork runs, including
autoplay, pause, reduced motion, visibility, and quality. Presentation Policy
does not redefine the Artwork's choreography.

Render cadence is Presentation Policy. Choreography time remains continuous;
the host may cap rendered frames without changing motion meaning. An Artwork may
deliberately quantize an individual Motion Source for a stepped visual rhythm.

_Avoid_: treating accidental low frame rate as authored motion

## Artwork Parameter

A named, meaningful value through which Mixed Media Artwork may respond to its
environment, such as energy, focus, or intensity. Artwork Parameters belong to
the Artwork's interface and do not expose raw device or browser events.

## Interaction Binding

A host-owned mapping from application input, such as pointer movement, scroll,
audio, or a camera signal, to one or more Artwork Parameters. Different hosts
may bind different inputs without changing the Artwork's choreography.

_Avoid_: raw DOM events in Artifact Runtime, device-specific Artwork Parameters

## Faithful Rendering

Rendering an Artifact Composition without silently omitting, flattening, or
replacing authored layers and behavior. If Artifact Runtime cannot preserve the
Composition's meaning, it reports that limitation so the host can use an
explicit fallback.

_Avoid_: best-effort rendering presented as parity, hidden runtime variants

## Runtime Profile

A named and versioned set of Artifact Composition capabilities that Artifact
Runtime can render faithfully. A Composition outside the selected profile
remains valid Artifact work but requires another profile or an explicit host
fallback.

The first profile covers mixed-media 2D compositions. It does not include 3D
models, environments, or other 3D scene behavior.

_Avoid_: implying that one Runtime build supports every Artifact capability

## Shader Authoring

### Shader Definition

A reusable description of one shader program and the editable properties it
exposes. A definition is independent from any particular node, role, or
document position.

### Shader Instance

One use of a Shader Definition with its own property values and explicit fill or
effect role. A shader node is a Shader Instance; changing its values or role must
not change other instances of the same definition.

### Shader Fill

A shader that creates its own pixels. It has no image input and can feed artwork,
an effect, a material map, or output.

### Shader Effect

A shader that transforms an incoming image. It requires one image input and is
transparent when that input is absent.

### Shader Preset

A built-in Shader Definition maintained by Artifact. A preset is selected by
name instead of authored as code.

### AI Shader

A Shader Definition authored from a prompt. AI describes how a shader is
created; it does not introduce a third runtime role beside Shader Fill and
Shader Effect.

### Code Shader

A Shader Definition authored directly as shader code. Code describes how a
shader is created; it does not introduce a third runtime role beside Shader Fill
and Shader Effect.

## Accounts

These terms define product access, administrative authority, and usage
accounting for people who use or operate Artifact.

**Account Tier**:
The product access level assigned to an account. It determines available
capabilities and usage allowances, independently of administrative authority.
_Avoid_: Plan role, user role, permission level

**Tier Policy**:
The versioned rules that map an Account Tier to product capabilities and usage
allowances. It is distinct from a Tier Assignment for one account.
_Avoid_: User override, subscription status

**Free Tier**:
The default Account Tier with no access to provider-backed AI capabilities.
_Avoid_: Disabled account, anonymous user

**Creator Tier**:
An Account Tier with an allowance of 20 successful Generations per calendar
month measured in UTC.
_Avoid_: Plus, AI-enabled user

**User Role**:
The operational authority assigned to a user. Artifact has ordinary users and
Admins; the role does not determine product capabilities or usage allowances.
_Avoid_: Tier, plan

**Admin**:
A user authorized to open the backoffice, inspect account usage, and create
Tier Assignments. Admin is the only backoffice role.
_Avoid_: Operator, Founder, owner tier

**Founder Tier**:
A hidden Account Tier reserved for the creator of Artifact, with no finite
product Generation allowance. It remains subject to operational rate limits
and the Safety Budget, and does not grant administrative authority.
_Avoid_: Admin tier, owner role

**Generation**:
A user-initiated AI operation that produces a usable result, such as creating
an image, creating a shader, or refining a shader. Provider failures and
automatic repair attempts are not additional Generations.
_Avoid_: API call, provider request, token spend

**Provider Usage**:
The measured provider consumption behind AI operations, including token counts,
estimated cost, and internal provider requests. It is operational accounting,
not the user's Generation allowance.
_Avoid_: Generation quota, credits

**Usage Event**:
An immutable, user-attributed record of Provider Usage for one provider call.
Corrections are represented by additional events so the accounting history
remains auditable.
_Avoid_: Monthly counter, Generation

**Safety Budget**:
The global AI spending boundary that can stop provider-backed operations for
every Account Tier. It protects Artifact from runaway cost and is not a user
allowance.
_Avoid_: Founder quota, Generation limit

**Tier Assignment**:
The auditable decision that sets an account's Account Tier. During the initial
release, Tier Assignments are made manually by an authorized backoffice user;
billing is not a source of assignments.
_Avoid_: Subscription, payment status, AI toggle

**Quota Grant**:
An auditable adjustment that adds a specific number of Generations to one
account's allowance for one UTC calendar month. It does not change the Account
Tier or Tier Policy, does not roll over, and requires a reason plus the
responsible Admin and timestamp. Used and remaining values are derived rather
than edited; mistakes are corrected with a Quota Grant Reversal instead of
deleting history.
_Avoid_: Tier change, usage reset, manual remaining balance

**Quota Grant Reversal**:
An auditable negative adjustment linked to one Quota Grant that corrects all or
part of that grant without editing or deleting it. A reversal cannot exceed the
original grant. If the account already used the reversed allowance, existing
results remain available and new Generations stop until allowance is available.
_Avoid_: Negative grant, usage deletion, result revocation

**Creative Content**:
The prompts, shader code, generated assets, and project documents created or
supplied by an Artifact user. Creative Content is not Provider Usage and is not
part of the backoffice account-management view.
_Avoid_: Usage detail, admin metadata
