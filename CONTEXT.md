# Artifact Domain Language

## Shader Definition

A reusable description of one shader program and the editable properties it
exposes. A definition is independent from any particular node, role, or
document position.

## Shader Instance

One use of a Shader Definition with its own property values and explicit fill or
effect role. A shader node is a Shader Instance; changing its values or role must
not change other instances of the same definition.

## Shader Fill

A shader that creates its own pixels. It has no image input and can feed artwork,
an effect, a material map, or output.

## Shader Effect

A shader that transforms an incoming image. It requires one image input and is
transparent when that input is absent.

## Shader Preset

A built-in Shader Definition maintained by Artifact. A preset is selected by
name instead of authored as code.

## AI Shader

A Shader Definition authored from a prompt. AI describes how a shader is
created; it does not introduce a third runtime role beside Shader Fill and
Shader Effect.

## Code Shader

A Shader Definition authored directly as shader code. Code describes how a
shader is created; it does not introduce a third runtime role beside Shader Fill
and Shader Effect.
