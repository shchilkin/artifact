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
an image, creating a shader, refining a shader, or completing a Run. One Run is
one Generation regardless of its internal provider calls; provider failures and
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

## AI-Assisted Creation

These terms describe how people create and revise Artifact work through a
conversation without losing the editable document model.

**Project**:
A creative workspace that owns related documents, assets, chats, and their
history. A Project may contain several derived outputs rather than one current
canvas.
_Avoid_: Chat, document, local snapshot

**Chat Mode**:
A full-workspace conversational mode for creating Creative Directions,
Compositions, and revisions without operating the layer or node editors
directly.
_Avoid_: Chat popup, AI panel

**Context Assistant**:
An explicitly opened assistant that proposes changes within a visible scope of
the current document in the Layers or Nodes mode.
_Avoid_: Chat Mode, proactive assistant

**Creative Direction**:
An editable early-stage artifact that captures references, palette, typography,
composition ideas, and generated studies before a final-format design exists.
_Avoid_: Final cover, generated composition

**Composition**:
An editable artifact intended as a concrete output such as an album cover,
poster, single artwork, or adaptation.
_Avoid_: Moodboard, Creative Direction

**Document Intent**:
The declared creative purpose of a document, initially either Creative
Direction or Composition. Intent changes how Artifact presents the document,
not how its pixels are rendered.
_Avoid_: Render mode, file format

**Derived Artifact**:
A new editable document created from another document while preserving the
source as an independent artifact.
_Avoid_: Overwrite, revision

**Editable Artifact**:
A structured Artifact document whose layers, nodes, effects, text, and source
assets can be changed. Generated raster content remains a replaceable image
source rather than becoming independently editable objects.
_Avoid_: Fully editable image, flattened result

**Document Setup**:
An editable arrangement of document settings, layers, nodes, connections,
effects, text, and asset-generation sources proposed for a creative request.
_Avoid_: Generated image, preset

**Change Set**:
A proposed group of document changes anchored to a specific document revision.
It remains separate from the current document until the user applies it.
_Avoid_: Prompt result, direct mutation

**Change Preview**:
An interactive visualization of a Change Set that shows the resulting artwork
and the affected document structure before application.
_Avoid_: Change log, JSON diff

**Run**:
The durable execution of one user request, from interpretation through setup,
asset generation, and preview. One successful Run consumes one Generation even
when it uses several internal provider calls.
_Avoid_: Provider request, chat message, job

**Context Thread**:
A durable assistant conversation attached to one document and an explicit
selection, area, or whole-document scope.
_Avoid_: Project chat, global conversation
