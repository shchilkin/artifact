import { useState } from 'react';

interface Props {
  seed: number;
  onSeedChange: (seed: number) => void;
  onRandomize: () => void;
  onExport: (resolution: 1500 | 2000 | 3000) => void;
  onPresetsToggle: () => void;
  onSidebarToggle: () => void;
  isExporting: boolean;
}

export function BottomBar({
  seed,
  onSeedChange,
  onRandomize,
  onExport,
  onPresetsToggle,
  onSidebarToggle,
  isExporting,
}: Props) {
  const [seedInput, setSeedInput] = useState(String(seed));
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleSeedSet = () => {
    const parsed = parseInt(seedInput, 10);
    if (!isNaN(parsed)) onSeedChange(parsed);
  };

  const handleExport = (res: 1500 | 2000 | 3000) => {
    setShowExportMenu(false);
    onExport(res);
  };

  return (
    <div className="bottom-bar">
      <div className="bottom-left">
        <button className="btn btn-icon sidebar-toggle" onClick={onSidebarToggle} title="Settings">
          ⚙
        </button>
        <span className="bottom-label">SEED</span>
        <input
          type="number"
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSeedSet()}
          className="seed-input"
        />
        <button className="btn" onClick={handleSeedSet}>SET</button>
        <button className="btn btn-primary" onClick={onRandomize}>RAND</button>
      </div>

      <div className="bottom-right">
        <div className="export-wrap">
          <button
            className="btn btn-primary"
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={isExporting}
          >
            {isExporting ? '...' : 'EXPORT ▾'}
          </button>
          {showExportMenu && (
            <div className="export-menu">
              {([1500, 2000, 3000] as const).map((res) => (
                <button key={res} className="export-option" onClick={() => handleExport(res)}>
                  {res}×{res}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn" onClick={onPresetsToggle}>PRESETS</button>
      </div>
    </div>
  );
}
