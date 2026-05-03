import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { CanvasPreview } from './components/CanvasPreview';
import { PresetsPanel } from './components/PresetsPanel';
import { BottomBar } from './components/BottomBar';
import { usePresets } from './hooks/usePresets';
import { type GeneratorConfig, DEFAULT_CONFIG } from './types/config';
import { exportCanvas } from './utils/exportCanvas';

const CFG_KEY = 'emoji-art-cfg';
const SEED_KEY = 'emoji-art-seed';

function loadSaved(): { cfg: GeneratorConfig; seed: number } | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    const s = localStorage.getItem(SEED_KEY);
    if (!raw) return null;
    return { cfg: { ...DEFAULT_CONFIG, ...JSON.parse(raw) }, seed: s ? parseInt(s) : 4242 };
  } catch {
    return null;
  }
}

export default function App() {
  const saved = loadSaved();
  const [cfg, setCfg] = useState<GeneratorConfig>(saved?.cfg ?? DEFAULT_CONFIG);
  const [seed, setSeed] = useState(saved?.seed ?? 4242);
  const [showPresets, setShowPresets] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { presets, savePreset, deletePreset, loadPreset } = usePresets();

  // Persist cfg + seed
  useEffect(() => {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }, [cfg]);
  useEffect(() => {
    localStorage.setItem(SEED_KEY, String(seed));
  }, [seed]);

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
      <Sidebar cfg={cfg} onChange={setCfg} isOpen={showSidebar} onClose={() => setShowSidebar(false)} />

      <main className="main">
        <CanvasPreview cfg={cfg} seed={seed} />
        <BottomBar
          seed={seed}
          onSeedChange={setSeed}
          onRandomize={handleRandomize}
          onExport={handleExport}
          onPresetsToggle={() => setShowPresets(!showPresets)}
          onSidebarToggle={() => setShowSidebar(!showSidebar)}
          isExporting={isExporting}
        />
      </main>

      {showPresets && (
        <PresetsPanel
          presets={presets}
          onSave={(name) => savePreset(name, seed, cfg)}
          onLoad={handleLoadPreset}
          onDelete={deletePreset}
          onClose={() => setShowPresets(false)}
          currentCfg={cfg}
          currentSeed={seed}
        />
      )}
    </div>
  );
}
