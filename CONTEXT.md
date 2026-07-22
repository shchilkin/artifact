# Artifact Domain Language

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

## UI Systems

These terms distinguish the shared interaction foundation from the visual and
product-specific systems used by Artifact and Backoffice.

**UI Foundation**:
The cross-application contract for accessible interaction mechanics, control
states, and semantic theming shared by Artifact and Backoffice.
_Avoid_: Universal design system, shared visual theme

**Theme Contract**:
The semantic visual roles that every product theme must provide to UI
Foundation primitives without prescribing their concrete appearance.
_Avoid_: Shared theme, token palette

**Product Theme**:
An application's concrete visual interpretation of the Theme Contract,
including typography, density, color values, geometry, and elevation.
_Avoid_: Skin, CSS overrides

**Brand Signature**:
The small set of identity marks shared by Artifact products, including the
brand mark, related warm-dark color DNA, and the flare accent.
_Avoid_: Shared visual theme, identical styling

**Artifact Design System**:
The visual language and product patterns for Artifact's creative workspace,
including Chat, Layers, Nodes, and public creative surfaces.
_Avoid_: Main UI, frontend styles

**Backoffice UI System**:
The visual language and operational patterns for account, usage, and
administrative workflows in Backoffice.
_Avoid_: Admin skin, Artifact theme

**Operational Pattern**:
A Backoffice-owned composition of UI Foundation primitives for recurring admin
work such as route states, period and search filters, metrics, status labels,
dense tables, pagination, audited mutations, and recovery. Operational Patterns
may be shared by Backoffice routes and its style guide, but do not belong in UI
Foundation or the Artifact Design System.
_Avoid_: Shared primitive, generic admin component, Artifact workspace pattern

**Source-Owned Primitive**:
A UI Foundation React component whose source, API, accessibility contract,
structural CSS, state styling, and maintenance lifecycle belong to this
repository. Product Themes supply its concrete semantic token values, even when
external scaffolding such as shadcn helped bootstrap the component.
_Avoid_: shadcn component, vendor component

**Foundation Matrix**:
The shared live specimen set that renders every UI Foundation primitive and its
required interaction states in both the Artifact and Backoffice Product Themes.
_Avoid_: Component gallery, one-theme style guide
