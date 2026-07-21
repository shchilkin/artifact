import type { MixedMediaMotionTrack } from '@shchilkin/artifact-runtime';
import { useState } from 'react';

function NumericField({
  label,
  value,
  onChange,
  step = 0.01,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  step?: number;
}) {
  return (
    <label className="motion-lab-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ''}
        onChange={(event) => onChange(event.currentTarget.value === '' ? undefined : Number(event.currentTarget.value))}
      />
    </label>
  );
}

export function TrackEditor({
  track,
  onChange,
}: {
  track: MixedMediaMotionTrack;
  onChange: (track: MixedMediaMotionTrack) => void;
}) {
  const [keyframesDraft, setKeyframesDraft] = useState(() =>
    track.source.type === 'keyframes' ? JSON.stringify(track.source.keyframes, null, 2) : '',
  );

  return (
    <fieldset className="motion-lab-track">
      <legend>{track.control}</legend>
      <div className="motion-lab-track__meta">
        <code>{track.id}</code>
        <span>{track.source.type}</span>
      </div>
      <div className="motion-lab-field-grid">
        <NumericField
          label="Range min"
          value={track.range.min}
          onChange={(value) => value !== undefined && onChange({ ...track, range: { ...track.range, min: value } })}
        />
        <NumericField
          label="Range max"
          value={track.range.max}
          onChange={(value) => value !== undefined && onChange({ ...track, range: { ...track.range, max: value } })}
        />
        <NumericField
          label="Step fps"
          value={track.stepFps}
          step={1}
          onChange={(value) =>
            onChange({ ...track, ...(value === undefined ? { stepFps: undefined } : { stepFps: value }) })
          }
        />
        {track.source.type === 'oscillator' ? (
          <NumericField
            label="Frequency Hz"
            value={track.source.frequencyHz}
            step={0.125}
            onChange={(value) =>
              value !== undefined && onChange({ ...track, source: { ...track.source, frequencyHz: value } })
            }
          />
        ) : null}
        {track.source.type === 'seeded-noise' ? (
          <>
            <NumericField
              label="Frequency Hz"
              value={track.source.frequencyHz}
              step={0.125}
              onChange={(value) =>
                value !== undefined && onChange({ ...track, source: { ...track.source, frequencyHz: value } })
              }
            />
            <NumericField
              label="Seed"
              value={track.source.seed}
              step={1}
              onChange={(value) =>
                value !== undefined && onChange({ ...track, source: { ...track.source, seed: value } })
              }
            />
          </>
        ) : null}
      </div>
      {track.source.type === 'keyframes' ? (
        <label className="motion-lab-field motion-lab-field--wide">
          <span>Keyframes JSON</span>
          <textarea
            rows={9}
            value={keyframesDraft}
            onChange={(event) => setKeyframesDraft(event.currentTarget.value)}
            onBlur={() => {
              try {
                const keyframes = JSON.parse(keyframesDraft) as typeof track.source.keyframes;
                onChange({ ...track, source: { type: 'keyframes', keyframes } });
              } catch {
                setKeyframesDraft(JSON.stringify(track.source.keyframes, null, 2));
              }
            }}
          />
        </label>
      ) : null}
    </fieldset>
  );
}
