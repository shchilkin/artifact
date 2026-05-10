import { NoPan } from '../../nodes/NoPan';
import { InspectorSlider } from './InspectorSlider';

export function ScaleLockRow({
  scaleX,
  scaleY,
  locked,
  onLockChange,
  onChange,
}: {
  scaleX: number;
  scaleY: number;
  locked: boolean;
  onLockChange: (locked: boolean) => void;
  onChange: (patch: { scaleX?: number; scaleY?: number }) => void;
}) {
  return (
    <div className="node-scale-row">
      <div className="node-scale-controls">
        {locked ? (
          <InspectorSlider
            label="Scale"
            value={Math.round(scaleX * 100)}
            min={5}
            max={500}
            onChange={(v) => onChange({ scaleX: v / 100, scaleY: v / 100 })}
          />
        ) : (
          <>
            <InspectorSlider label="Scale X" value={Math.round(scaleX * 100)} min={5} max={500} onChange={(v) => onChange({ scaleX: v / 100 })} />
            <InspectorSlider label="Scale Y" value={Math.round(scaleY * 100)} min={5} max={500} onChange={(v) => onChange({ scaleY: v / 100 })} />
          </>
        )}
      </div>
      <NoPan
        as="button"
        type="button"
        className={`node-scale-lock${locked ? ' node-scale-lock-active' : ''}`}
        onClick={() => onLockChange(!locked)}
        title={locked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
        aria-label={locked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
      >
        {locked ? '⛓' : '⛓‍💥'}
      </NoPan>
    </div>
  );
}
