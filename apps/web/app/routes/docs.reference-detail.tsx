import { Link, type MetaFunction, useParams } from 'react-router';

import { ALL_NODES, NodePoster, nodeTypeLabel } from './docs.nodes';
import { DocsSection, DocsShell } from './docs.shared';

export const meta: MetaFunction = () => [
  { title: 'Node Reference | Artifact Docs' },
  {
    name: 'description',
    content: 'Artifact node reference with controls, ports, workflow notes, and editor links.',
  },
];

function nodeDetailChains(nodeId: string) {
  if (nodeId === 'lineField')
    return ['Line Field -> Mask -> Merge -> Output', 'Line Field -> Repeat -> Text -> Output'];
  if (nodeId === 'noise') return ['Noise -> Mask -> Merge -> Output', 'Noise -> Threshold -> Grain -> Output'];
  if (nodeId === 'array') return ['Array -> Mask -> Repeat -> Output', 'Array -> Riso Shift -> Text -> Output'];
  if (nodeId === 'text') return ['Text -> Mask matte', 'Text -> Color -> Merge -> Output'];
  if (nodeId === 'primitive') return ['Primitive -> Merge over image -> Output'];
  if (nodeId === 'fill') return ['Fill -> Merge base -> Output'];
  return ['Source -> Effect -> Merge -> Output'];
}

function nodeEditorHref(node: (typeof ALL_NODES)[number]) {
  return `/app?doc=${encodeURIComponent(JSON.stringify(node.doc))}`;
}

export default function DocsReferenceDetail() {
  const { nodeId } = useParams();
  const node = ALL_NODES.find((item) => item.id === nodeId);

  if (!node) {
    return (
      <DocsShell
        active="Reference"
        title="Node not found."
        deck="That reference entry does not exist. Return to the node reference and choose another entry."
      >
        <Link to="/docs/reference" className="docs-recipe__link">
          Back to reference
        </Link>
      </DocsShell>
    );
  }

  return (
    <DocsShell active="Reference" eyebrow={nodeTypeLabel(node)} title={`${node.name}.`} deck={node.desc}>
      <div className="docs-node-detail-actions">
        <Link to={nodeEditorHref(node)} className="docs-recipe__link">
          Open in editor
        </Link>
        <Link to="/docs/reference" className="docs-workflow-guide__secondary">
          Back to reference
        </Link>
      </div>

      <NodePoster node={node} />

      <DocsSection id="controls" eyebrow="Controls" title="What you can tune.">
        <div className="docs-param-table">
          {node.params.map((param) => (
            <div key={param.key} className="docs-param-row">
              <span>{param.key}</span>
              <strong>{param.range}</strong>
            </div>
          ))}
        </div>
      </DocsSection>

      <DocsSection id="chains" eyebrow="Common chains" title="Where this node fits.">
        <div className="docs-reference-list">
          {nodeDetailChains(node.id).map((chain) => (
            <div key={chain} className="docs-reference-row docs-reference-row--static">
              <span className="docs-reference-row__symbol" aria-hidden="true">
                {node.symbol}
              </span>
              <div>
                <h3>{chain}</h3>
                <p>Use this when the branch needs to stay editable before final output.</p>
              </div>
            </div>
          ))}
        </div>
      </DocsSection>
    </DocsShell>
  );
}
