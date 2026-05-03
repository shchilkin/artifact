import { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { CanvasPreview } from './components/CanvasPreview';
import { PresetsPanel } from './components/PresetsPanel';
import { BottomBar } from './components/BottomBar';
import { usePresets } from './hooks/usePresets';
import { type GeneratorConfig, DEFAULT_CONFIG } from './types/config';
import { exportCanvas } from './utils/exportCanvas';

export default function App() {
  const [cfg, setCfg] = useState<GeneratorConfig>(DEFAULT_CONFIG);
  const [seed, setSeed] = useState(4242);
  const [showPresets, setShowPresets] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { presets, savePreset, deletePreset, loadPreset } = usePresets();

  const handleRandomize = useCallback(() => {
    setSeed(Math.floor(Math.random() * 999999));
  }, []);

  const handleExport = useCallback(
    async (resolution: 1500 | 2000 | 3000) => {
      setIsExporting(true);
      try {
        await exportCanvas(cfg, seed, resolution);
      } finally {
        setIsExporting(false);
      }
    },
    [cfg, seed]
  );

  const handleLoadPreset = useCallback(
    (preset: Parameters<typeof loadPreset>[0]) => {
      const { seed: s, cfg: c } = loadPreset(preset);
      setSeed(s);
      setCfg(c);
      setShowPresets(false);
    },
    [loadPreset]
  );

  return (
    <div className="app">
      <Sidebar cfg={cfg} onChange={setCfg} />

      <main className="main">
        <CanvasPreview cfg={cfg} seed={seed} />
        <BottomBar
          seed={seed}
          onSeedChange={setSeed}
          onRandomize={handleRandomize}
          onExport={handleExport}
          onPresetsToggle={() => setShowPresets(!showPresets)}
          isExporting={isExporting}
        />
      </main>

      {showPresets && (
        <PresetsPanel
          presets={presets}
          onSave={(name) => savePreset(name, seed, cfg)}
          onLoad={handleLoadPreset}
          onDelete={deletePreset}
          currentCfg={cfg}
          currentSeed={seed}
        />
      )}
    </div>
  );
}
