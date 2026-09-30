import { useState } from 'react';
import type { EditorState } from '../src';

export function EditorTools({
  state,
  selectedId,
  disabled,
  command,
}: {
  state: EditorState;
  selectedId: string;
  disabled: boolean;
  command: (value: Record<string, unknown>, select?: string) => void;
}) {
  const [source, setSource] = useState('');
  const layer = state.layers.find((l) => l.id === selectedId);
  function add(kind: string) {
    const id = `layer-${crypto.randomUUID()}`;
    command({ type: 'add_layer', kind, newId: id, ...(selectedId ? { afterId: selectedId } : {}) }, id);
  }
  return (
    <div className="editor-tools">
      <div className="editor-actions" aria-label="Add layers">
        {['text', 'fill', 'emoji', 'effect'].map((kind) => (
          <button key={kind} type="button" disabled={disabled || !state.graphEditable} onClick={() => add(kind)}>
            Add {kind}
          </button>
        ))}
      </div>
      {layer && (
        <div className="editor-actions" aria-label="Layer actions">
          <button
            type="button"
            disabled={disabled}
            onClick={() => command({ type: 'edit_layer', id: selectedId, patch: { visible: layer.visible === false } })}
          >
            {layer.visible === false ? 'Show layer' : 'Hide layer'}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => command({ type: 'edit_layer', id: selectedId, patch: { locked: !layer.locked } })}
          >
            {layer.locked ? 'Unlock' : 'Lock'}
          </button>
          <button
            type="button"
            disabled={disabled || !state.graphEditable}
            onClick={() => {
              const id = `layer-${crypto.randomUUID()}`;
              command({ type: 'duplicate_layer', id: selectedId, newId: id }, id);
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            disabled={disabled || Boolean(layer.locked) || !state.graphEditable}
            onClick={() => command({ type: 'delete_layer', id: selectedId })}
          >
            Delete
          </button>
          {([1, -1] as const).map((delta) => (
            <button
              key={delta}
              type="button"
              disabled={disabled || Boolean(layer.locked) || !state.canReorder}
              onClick={() => command({ type: 'move_layer', id: selectedId, delta })}
            >
              {delta === 1 ? 'Move up' : 'Move down'}
            </button>
          ))}
        </div>
      )}
      <details>
        <summary>Connections</summary>
        <p>Connect a source to the selected layer or output.</p>
        <label>
          Source{' '}
          <select aria-label="Connection source" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Choose a layer</option>
            {state.layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled || !source || !selectedId || !state.graphEditable}
          onClick={() => command({ type: 'connect', from: source, to: selectedId })}
        >
          Connect to selected
        </button>
        <button
          type="button"
          disabled={disabled || !source || !state.graphEditable}
          onClick={() => command({ type: 'connect', from: source, to: '__export__' })}
        >
          Connect to output
        </button>
        <button
          type="button"
          disabled={disabled || !selectedId || !state.graphEditable}
          onClick={() => command({ type: 'disconnect', to: selectedId })}
        >
          Disconnect selected input
        </button>
      </details>
    </div>
  );
}
