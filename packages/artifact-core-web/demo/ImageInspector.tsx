import { useEffect, useRef, useState } from 'react';
import type { ImageProperties } from '../src';
import { importImage } from '../src/importImage';

const fields = [
  { key: 'x', label: 'X (%)', factor: 100, min: -200, max: 300 },
  { key: 'y', label: 'Y (%)', factor: 100, min: -200, max: 300 },
  { key: 'scaleX', label: 'Scale X (%)', factor: 100, min: 1, max: 1000 },
  { key: 'scaleY', label: 'Scale Y (%)', factor: 100, min: 1, max: 1000 },
  { key: 'rotation', label: 'Rotation (°)', factor: 1, min: -360, max: 360 },
] as const;
type Draft = Record<keyof ImageProperties, string>;
export type ImagePatch = Partial<ImageProperties> & { src?: string };

export function ImageInspector({
  value,
  disabled,
  onApply,
}: {
  value: ImageProperties;
  disabled: boolean;
  onApply: (patch: ImagePatch) => void;
}) {
  const original = Object.fromEntries(fields.map((f) => [f.key, String(value[f.key] * f.factor)])) as Draft;
  const [draft, setDraft] = useState(original);
  const [replacement, setReplacement] = useState<{ src: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const patch: ImagePatch = replacement ? { src: replacement.src } : {};
  for (const f of fields) if (draft[f.key] !== original[f.key]) patch[f.key] = Number(draft[f.key]) / f.factor;
  const valid = fields.every(
    (f) =>
      draft[f.key].trim() &&
      Number.isFinite(Number(draft[f.key])) &&
      Number(draft[f.key]) >= f.min &&
      Number(draft[f.key]) <= f.max,
  );
  async function choose(file: File) {
    const id = ++request.current;
    setBusy(true);
    setError('');
    setReplacement(null);
    try {
      const src = await importImage(file);
      if (request.current === id) setReplacement({ src, name: file.name });
    } catch (cause) {
      if (request.current === id) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request.current === id) setBusy(false);
    }
  }
  return (
    <form
      className="text-inspector"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !busy && !disabled) onApply(patch);
      }}
    >
      <label>
        Replace image (PNG/JPEG)
        <input
          aria-label="Replace image"
          type="file"
          accept="image/png,image/jpeg"
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void choose(file);
          }}
        />
      </label>
      {busy && <p role="status">Reading image…</p>}
      {replacement && (
        <p role="status">
          Ready to apply: {replacement.name}{' '}
          <button type="button" onClick={() => setReplacement(null)}>
            Cancel replacement
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="text-fields">
        {fields.map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              aria-label={`Image ${f.label}`}
              type="number"
              min={f.min}
              max={f.max}
              step="any"
              required
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <button type="submit" disabled={disabled || busy || !valid || Object.keys(patch).length === 0}>
        Apply image
      </button>
    </form>
  );
}
