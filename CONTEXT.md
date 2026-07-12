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

**Free Tier**:
The default Account Tier with no access to provider-backed AI capabilities.
_Avoid_: Disabled account, anonymous user

**Creator Tier**:
An Account Tier with an allowance of 20 successful Generations per calendar
month.
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

**Creative Content**:
The prompts, shader code, generated assets, and project documents created or
supplied by an Artifact user. Creative Content is not Provider Usage and is not
part of the backoffice account-management view.
_Avoid_: Usage detail, admin metadata
