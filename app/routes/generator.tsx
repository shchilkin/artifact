import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { CanvasPreview } from '../components/CanvasPreview';
import { PresetsPanel } from '../components/PresetsPanel';
import { BottomBar } from '../components/BottomBar';
import { usePresets } from '../hooks/usePresets';
import { type GeneratorConfig, DEFAULT_CONFIG } from '../types/config';
import { exportCanvas } from '../utils/exportCanvas';
import { exportEnvMap } from '../utils/exportEnvMap';
import { randomConfig } from '../utils/randomConfig';

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

function getInitialState(): { cfg: GeneratorConfig; seed: number } {
  // URL params take priority (e.g. opened from examples gallery)
  const params = new URLSearchParams(window.location.search);
  const paramSeed = params.get('seed');
  const paramCfg = params.get('cfg');
  if (paramSeed && paramCfg) {
    try {
      const decoded = JSON.parse(atob(paramCfg));
      return { cfg: { ...DEFAULT_CONFIG, ...decoded }, seed: Number(paramSeed) };
    } catch { /* ignore */ }
  }
  return loadSaved() ?? { cfg: DEFAULT_CONFIG, seed: 4242 };
}

export default function Generator() {
  const initial = getInitialState();
  const [cfg, setCfg] = useState<GeneratorConfig>(initial.cfg);
  const [seed, setSeed] = useState(initial.seed);
  const [showPresets, setShowPresets] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingEnvMap, setIsExportingEnvMap] = useState(false);
  const [seedHistory, setSeedHistory] = useState<number[]>([]);

  const { presets, savePreset, deletePreset, loadPreset } = usePresets();

  useEffect(() => { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }, [cfg]);
  useEffect(() => { localStorage.setItem(SEED_KEY, String(seed)); }, [seed]);

  const handleRandomize = useCallback(() => {
    setSeedHistory(h => [...h.slice(-9), seed]);
    setSeed(Math.floor(Math.random() * 999999));
    setCfg(randomConfig());
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

  const handleEnvMapExport = useCallback(async () => {
    setIsExportingEnvMap(true);
    try {
      await exportEnvMap(cfg, seed);
    } finally {
      setIsExportingEnvMap(false);
    }
  }, [cfg, seed]);

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
    onEnvMapExport: handleEnvMapExport,
    onPresetsToggle: () => setShowPresets(!showPresets),
    isExporting,
    isExportingEnvMap,
  };

  return (
    <div className="app">
      <main className="main">
        <CanvasPreview cfg={cfg} seed={seed} />
        <BottomBar {...bottomBarProps} />
      </main>

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
        />
      )}
    </div>
  );
}
