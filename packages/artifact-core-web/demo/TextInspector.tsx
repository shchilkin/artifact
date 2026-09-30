import { useState } from 'react';
import type { TextProperties } from '../src';

export function TextInspector({
  value,
  disabled,
  onApply,
}: {
  value: TextProperties;
  disabled: boolean;
  onApply: (patch: Partial<TextProperties>) => void;
}) {
  const original = {
    content: value.content,
    size: String(value.size),
    color: value.color,
    x: String(value.x * 100),
    y: String(value.y * 100),
  };
  const [draft, setDraft] = useState(original);
  const patch: Partial<TextProperties> = {};
  if (draft.content !== original.content) patch.content = draft.content;
  if (draft.color !== original.color) patch.color = draft.color;
  for (const key of ['size', 'x', 'y'] as const) {
    if (draft[key] !== original[key]) patch[key] = Number(draft[key]) / (key === 'size' ? 1 : 100);
  }
  const valid =
    [draft.size, draft.x, draft.y].every((v) => v.trim() && Number.isFinite(Number(v))) &&
    /^#[0-9a-f]{6}$/i.test(draft.color);
  return (
    <form
      className="text-inspector"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(patch);
      }}
    >
      <label>
        Text
        <textarea
          aria-label="Text content"
          rows={2}
          value={draft.content}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
        />
      </label>
      <div className="text-fields">
        <label>
          Size
          <input
            aria-label="Text size"
            type="number"
            min="1"
            max="540"
            step="any"
            required
            value={draft.size}
            onChange={(e) => setDraft({ ...draft, size: e.target.value })}
          />
        </label>
        <label>
          Color
          <input
            aria-label="Text color"
            type="text"
            pattern="#[0-9a-fA-F]{6}"
            required
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          />
        </label>
        {(['x', 'y'] as const).map((key) => (
          <label key={key}>
            {key.toUpperCase()} (%)
            <input
              aria-label={`Text ${key.toUpperCase()} (%)`}
              type="number"
              min="-200"
              max="300"
              step="any"
              required
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <button type="submit" disabled={disabled || !valid || Object.keys(patch).length === 0}>
        Apply text
      </button>
    </form>
  );
}
