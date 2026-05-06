import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  seed: number;
  onSeedChange: (seed: number) => void;
  onRandomize: () => void;
  onPrevSeed: () => void;
  hasPrevSeed: boolean;
  onExport: (resolution: 1500 | 2000 | 3000) => void;
  onEnvMapExport: () => void;
  onPresetsToggle: () => void;
  onCopyLink: () => void;
  isExporting: boolean;
  isExportingEnvMap: boolean;
}

export function BottomBar({
  seed,
  onSeedChange,
  onRandomize,
  onPrevSeed,
  onCopyLink,
  hasPrevSeed,
  onExport,
  onEnvMapExport,
  onPresetsToggle,
  isExporting,
  isExportingEnvMap,
}: Props) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const exportWrapRef = useRef<HTMLDivElement>(null);
  const seedInputRef = useRef<HTMLInputElement>(null);

  // Close export menu on click outside
  useEffect(() => {
    if (!showExportMenu) return;
    function onClickOutside(e: MouseEvent) {
      if (
        exportWrapRef.current &&
        !exportWrapRef.current.contains(e.target as Node)
      ) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showExportMenu]);

  // Close export menu on Escape
  useEffect(() => {
    if (!showExportMenu) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowExportMenu(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showExportMenu]);

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

  const handleExport = (res: 1500 | 2000 | 3000) => {
    setShowExportMenu(false);
    onExport(res);
  };

  const handleEnvMapExport = () => {
    setShowExportMenu(false);
    onEnvMapExport();
  };

  return (
    <div className="bottom-bar">
      {/* Row 1: Prev + Rand (settings toggle removed — sidebar always visible) */}
      <div className="bottom-rand-group">
        {hasPrevSeed && (
          <button
            className="btn"
            onClick={onPrevSeed}
            aria-label="Go to previous seed"
          >
            ← PREV
          </button>
        )}
        <button className="btn btn-primary rand-btn" onClick={onRandomize}>
          RAND
        </button>
      </div>

      {/* Row 2 (mobile): Seed controls + Export/Presets */}
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
        <div className="export-wrap" ref={exportWrapRef}>
          <button
            className="btn btn-primary"
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={isExporting}
            aria-expanded={showExportMenu}
            aria-haspopup="true"
          >
            {isExporting || isExportingEnvMap ? "..." : "EXPORT ▾"}
          </button>
          <AnimatePresence>
            {showExportMenu && (
              <motion.div
                className="export-menu"
                role="menu"
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              >
                {([1500, 2000, 3000] as const).map((res) => (
                  <button
                    key={res}
                    className="export-option"
                    role="menuitem"
                    onClick={() => handleExport(res)}
                  >
                    {res}×{res}
                  </button>
                ))}
                <div className="export-menu-divider" />
                <button
                  className="export-option export-option--env"
                  role="menuitem"
                  onClick={handleEnvMapExport}
                  disabled={isExportingEnvMap}
                >
                  ENV MAP <span className="export-option-sub">4096×2048</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button className="btn" onClick={onPresetsToggle}>PRESETS</button>
      </div>
    </div>
  );
}
