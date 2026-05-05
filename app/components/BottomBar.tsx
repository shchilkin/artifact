import { useCallback, useEffect, useState } from "react";

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
  const [seedInput, setSeedInput] = useState(String(seed));
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync display when seed changes externally (randomize / prev)
  useEffect(() => {
    setSeedInput(String(seed));
  }, [seed]);

  const handleSeedSet = () => {
    const parsed = parseInt(seedInput, 10);
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
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value)}
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
          {copied ? "✓" : "LINK"}
        </button>
      </div>

      <div className="bottom-right-group">
        <div className="export-wrap">
          <button
            className="btn btn-primary"
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={isExporting}
            aria-expanded={showExportMenu}
          >
            {isExporting || isExportingEnvMap ? "..." : "EXPORT ▾"}
          </button>
          {showExportMenu && (
            <div className="export-menu" role="menu">
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
            </div>
          )}
        </div>
        <button className="btn" onClick={onPresetsToggle}>PRESETS</button>
      </div>
    </div>
  );
}
