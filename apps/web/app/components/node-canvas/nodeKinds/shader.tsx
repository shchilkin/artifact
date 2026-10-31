import { memo } from 'react';
import { validateCustomShaderCode } from '../../../utils/customShaderCode';
import type { GraphShaderNode } from '../../../utils/nodeKinds';
import { useGraphNodeHide, useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { NodeFrame } from '../nodes/NodeFrame';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import type { ShaderNodeGenerationStatus } from '../types';
import type { GraphNodeComponentProps, GraphNodeKindUi } from './types';

const ShaderNodeComponent = memo(function ShaderNodeComponent({
  data,
}: GraphNodeComponentProps<
  GraphShaderNode,
  { backdropPreviewTargetId: string | null; generationStatus: ShaderNodeGenerationStatus | null }
>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const {
    node: shaderNode,
    previewTargetId,
    backdropPreviewTargetId,
    generationStatus,
    selected,
    outputPath,
    editing,
    connected,
  } = data;
  const rendersBackdrop = Boolean(backdropPreviewTargetId);
  const effectRole = shaderNode.role === 'effect';
  const aiPass = shaderNode.shaderKind === 'aiShader';
  const shaderDefinition = shaderNode.shaderInstance?.definition;
  const aiPrompt = shaderNode.aiPrompt ?? shaderDefinition?.provenance?.prompt ?? '';
  const aiHasResult = Boolean(shaderDefinition?.code.trim() && shaderDefinition.provenance);
  const aiEmptyOverlay =
    shaderNode.shaderKind === 'aiShader' && !aiHasResult ? (
      <ShaderNodeAiEmptyOverlay hasPrompt={aiPrompt.trim().length >= 3} hasInput={rendersBackdrop} />
    ) : null;
  const code = shaderDefinition?.code ?? '';
  const codeIssue =
    shaderNode.shaderKind === 'customCode' || shaderNode.shaderKind === 'aiShader'
      ? (validateCustomShaderCode(code).find((issue) => issue.severity === 'error') ?? null)
      : null;
  const codeOverlay = codeIssue ? <ShaderNodeCodeOverlay empty={code.trim().length === 0} /> : null;

  const hideProps = useGraphNodeHide(shaderNode);
  return (
    <NodeFrame
      id={shaderNode.id}
      kind="shader"
      label={aiPass ? 'ai shader effect' : effectRole ? 'shader effect' : 'shader fill'}
      name={shaderNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
      targetHandles={effectRole ? [{ id: 'bg' }] : []}
      onSelect={(event) => selectNode(shaderNode.id, event)}
      {...hideProps}
      onDelete={() => deleteNode(shaderNode.id)}
    >
      <NodeThumbnail
        previewTargetId={previewTargetId}
        priority={selected}
        statusOverlay={
          generationStatus ? <ShaderNodeCreationOverlay status={generationStatus} /> : (aiEmptyOverlay ?? codeOverlay)
        }
      />
      <PortRow
        inputs={
          effectRole
            ? [{ label: rendersBackdrop ? 'source' : 'source required', portId: 'bg', nodeId: shaderNode.id }]
            : []
        }
        outputs={[{ label: effectRole ? 'effect' : 'fill', portId: 'out', nodeId: shaderNode.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

function ShaderNodeCodeOverlay({ empty }: { empty: boolean }) {
  return (
    <div className="node-thumbnail-ai-overlay node-thumbnail-code-overlay" role="status" aria-live="polite">
      <div className="node-thumbnail-ai-card node-thumbnail-code-card">
        <span className="node-thumbnail-code-mark" aria-hidden="true">
          {'{}'}
        </span>
        <span>
          <strong>{empty ? 'Add code' : 'Code needs fix'}</strong>
          <small>{empty ? 'No shader yet' : 'Check properties'}</small>
        </span>
      </div>
    </div>
  );
}

function ShaderNodeAiEmptyOverlay({ hasPrompt, hasInput }: { hasPrompt: boolean; hasInput: boolean }) {
  const title = !hasInput ? 'Connect source' : hasPrompt ? 'Ready to create' : 'Describe effect';
  const detail = !hasInput ? 'Input required' : hasPrompt ? 'Use properties' : 'No result yet';

  return (
    <div className="node-thumbnail-ai-overlay node-thumbnail-ai-overlay-empty" role="status" aria-live="polite">
      <div className="node-thumbnail-ai-card node-thumbnail-ai-card-empty">
        <span className="node-thumbnail-ai-empty-mark" aria-hidden="true" />
        <span>
          <strong>{title}</strong>
          <small>{detail}</small>
        </span>
      </div>
    </div>
  );
}

function ShaderNodeCreationOverlay({ status }: { status: ShaderNodeGenerationStatus }) {
  const fallback = status === 'creatingFallback';
  const refining = status === 'creatingRefine';
  const validating = status === 'validating';
  const repairing = status === 'repairing';
  const blocked = status === 'blocked';
  const failed = status === 'failed';
  return (
    <div
      className={`node-thumbnail-ai-overlay${failed ? ' node-thumbnail-ai-overlay-error' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className={`node-thumbnail-ai-card${failed ? ' node-thumbnail-ai-card-error' : ''}`}>
        {failed ? (
          <span className="node-thumbnail-ai-error-mark" aria-hidden="true">
            !
          </span>
        ) : (
          <span className="node-thumbnail-ai-spinner" aria-hidden="true" />
        )}
        <span>
          <strong>
            {failed
              ? 'Could not create'
              : blocked
                ? 'Another creation is running'
                : repairing
                  ? 'Repairing shader…'
                  : validating
                    ? 'Checking shader…'
                    : refining
                      ? 'Refining shader…'
                      : fallback
                        ? 'Making local draft…'
                        : 'Creating shader…'}
          </strong>
          <small>
            {failed
              ? 'Nothing was replaced'
              : blocked
                ? 'Try again when it finishes'
                : repairing
                  ? 'One automatic repair'
                  : validating
                    ? 'Testing in this browser'
                    : refining
                      ? 'Keeping the current version'
                      : fallback
                        ? 'Labeled local'
                        : 'Setting it up'}
          </small>
        </span>
      </div>
    </div>
  );
}

export const shaderNodeUi: GraphNodeKindUi<
  'shader',
  { backdropPreviewTargetId: string | null; generationStatus: ShaderNodeGenerationStatus | null }
> = {
  rfType: 'shaderNode',
  rfData: (node, context) => ({
    backdropPreviewTargetId: context.incomingNodeId(node.id, 'bg'),
    generationStatus: context.shaderGenerationStatusById[node.id] ?? null,
  }),
  Component: ShaderNodeComponent,
};
