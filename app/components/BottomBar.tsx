import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
interface Props {
  seed: number;
  onSeedChange: (seed: number) => void;
  onRandomize: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  onPresetsToggle: () => void;
  onCopyLink: () => void;
}

export function BottomBar({
  seed,
  onSeedChange,
  onRandomize,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoCount,
  onCopyLink,
  onPresetsToggle,
}: Props) {
  const [copied, setCopied] = useState(false);
  const seedInputRef = useRef<HTMLInputElement>(null);

  const handleSeedSet = () => {
    const value = seedInputRef.current?.value ?? String(seed);
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) onSeedChange(parsed);
  };

  const handleCopyLink = useCallback(() => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [onCopyLink]);

  return (
    <div className="bottom-bar">
      {/* Row 1: Undo / Redo / Rand */}
      <div className="bottom-rand-group">
        <button
          className="btn"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Cmd+Z)"
        >
          ↩{canUndo && undoCount > 0 ? ` ${undoCount}` : ''}
        </button>
        <button
          className="btn"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo (Cmd+Shift+Z)"
        >
          ↪
        </button>
        <button className="btn btn-primary rand-btn" onClick={onRandomize}>
          RAND
        </button>
      </div>

      {/* Row 2: Seed controls + Export/Presets */}
      <div className="bottom-seed-group">
        <span className="bottom-label seed-label">SEED</span>
        <input
          key={seed}
          ref={seedInputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={7}
          defaultValue={String(seed)}
          onKeyDown={(e) => e.key === "Enter" && handleSeedSet()}
          onBlur={handleSeedSet}
          className="seed-input"
          aria-label="Seed value"
        />
        <button className="btn" onClick={handleSeedSet}>SET</button>
        <button
          className="btn"
          onClick={handleCopyLink}
          aria-label="Copy link to current state"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? "check" : "link"}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              style={{ display: "inline-block" }}
            >
              {copied ? "✓" : "LINK"}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>

      <div className="bottom-right-group">
        <button className="btn" onClick={onPresetsToggle}>PRESETS</button>
      </div>
    </div>
  );
}
