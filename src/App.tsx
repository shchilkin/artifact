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
  const [isExporting, setIsExporting] = useState(false);
  const [seedHistory, setSeedHistory] = useState<number[]>([]);

  const { presets, savePreset, deletePreset, loadPreset } = usePresets();

  // Persist cfg + seed
  useEffect(() => {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }, [cfg]);
  useEffect(() => {
    localStorage.setItem(SEED_KEY, String(seed));
  }, [seed]);

  const handleRandomize = useCallback(() => {
    setSeedHistory(h => [...h.slice(-9), seed]);
    setSeed(Math.floor(Math.random() * 999999));
  }, [seed]);

  const handlePrevSeed = useCallback(() => {
    if (seedHistory.length === 0) return;
    const prev = seedHistory[seedHistory.length - 1];
    setSeedHistory(h => h.slice(0, -1));
    setSeed(prev);
  }, [seedHistory]);

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

  const bottomBarProps = {
    seed,
    onSeedChange: setSeed,
    onRandomize: handleRandomize,
    onPrevSeed: handlePrevSeed,
    hasPrevSeed: seedHistory.length > 0,
    onExport: handleExport,
    onPresetsToggle: () => setShowPresets(!showPresets),
    isExporting,
  };

  return (
    <div className="app">
      {/* Canvas area: 40% on mobile (order:1), right column on desktop (order:2) */}
      <main className="main">
        <CanvasPreview cfg={cfg} seed={seed} />
        {/* Desktop: action bar below canvas */}
        <BottomBar {...bottomBarProps} />
      </main>

      {/* Controls: 60% panel on mobile (order:2), left sidebar on desktop (order:1) */}
      <Sidebar
        cfg={cfg}
        onChange={setCfg}
        mobileActionBar={<BottomBar {...bottomBarProps} />}
      />

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
