import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Sidebar } from "../components/Sidebar";
import { CanvasPreview } from "../components/CanvasPreview";
import { PresetsPanel } from "../components/PresetsPanel";
import { BottomBar } from "../components/BottomBar";
import { SiteNav } from "../components/SiteNav";
import { usePresets } from "../hooks/usePresets";
import { DEFAULT_CONFIG, type GeneratorConfig } from "../types/config";
import { exportCanvas } from "../utils/exportCanvas";
import { exportEnvMap } from "../utils/exportEnvMap";
import { randomConfig, randomSection, zeroSection } from "../utils/randomConfig";

const CFG_KEY = "emoji-art-cfg";
const SEED_KEY = "emoji-art-seed";
const HISTORY_MAX = 50;

function loadSaved(): { cfg: GeneratorConfig; seed: number } | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    const s = localStorage.getItem(SEED_KEY);
    if (!raw) return null;
    return {
      cfg: { ...DEFAULT_CONFIG, ...JSON.parse(raw) },
      seed: s ? parseInt(s) : 4242,
    };
  } catch {
    return null;
  }
}

function getInitialState(): { cfg: GeneratorConfig; seed: number } {
  // URL params take priority (e.g. opened from examples gallery)
  const params = new URLSearchParams(window.location.search);
  const paramSeed = params.get("seed");
  const paramCfg = params.get("cfg");
  if (paramSeed && paramCfg) {
    try {
      const decoded = JSON.parse(decodeURIComponent(paramCfg));
      const seed = parseInt(paramSeed, 10);
      if (!isNaN(seed)) {
        return { cfg: { ...DEFAULT_CONFIG, ...decoded }, seed };
      }
    } catch { /* ignore */ }
  }
  return loadSaved() ?? { cfg: DEFAULT_CONFIG, seed: 4242 };
}

type HistoryEntry = { cfg: GeneratorConfig; seed: number };

export default function Generator() {
  const initial = getInitialState();

  // ─── Live state ───────────────────────────────────
  const [cfg, _setCfg] = useState<GeneratorConfig>(initial.cfg);
  const [seed, _setSeed] = useState(initial.seed);

  // Always-fresh refs (no stale closure issues in callbacks)
  const cfgRef = useRef(cfg);
  const seedRef = useRef(seed);
  useLayoutEffect(() => {
    cfgRef.current = cfg;
    seedRef.current = seed;
  }, [cfg, seed]);

  // ─── Undo / redo history ──────────────────────────
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);

  const histDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  // Snapshot of state at the START of a debounce window (before sliders settle)
  const preChangeRef = useRef<HistoryEntry | null>(null);

  const setCfg = useCallback((newCfg: GeneratorConfig) => {
    _setCfg(newCfg);
    // Capture pre-change baseline only once per debounce window
    if (!preChangeRef.current) {
      preChangeRef.current = { cfg: cfgRef.current, seed: seedRef.current };
    }
    clearTimeout(histDebounceRef.current);
    histDebounceRef.current = setTimeout(() => {
      if (preChangeRef.current) {
        setPast((p) => [...p.slice(-(HISTORY_MAX - 1)), preChangeRef.current!]);
        setFuture([]);
        preChangeRef.current = null;
      }
    }, 400);
  }, []);

  const setSeed = useCallback((newSeed: number) => {
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
    setPast((p) => [...p.slice(-(HISTORY_MAX - 1)), { cfg: cfgRef.current, seed: seedRef.current }]);
    setFuture([]);
    _setSeed(newSeed);
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [{ cfg: cfgRef.current, seed: seedRef.current }, ...f.slice(0, HISTORY_MAX - 1)]);
    _setCfg(prev.cfg);
    _setSeed(prev.seed);
  }, [past]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p.slice(-(HISTORY_MAX - 1)), { cfg: cfgRef.current, seed: seedRef.current }]);
    _setCfg(next.cfg);
    _setSeed(next.seed);
  }, [future]);

  // ─── Keyboard shortcuts ───────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'z') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ─── Background image ─────────────────────────────
  const [bgImageUrl, _setBgImageUrl] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [bgImageError, setBgImageError] = useState<string | null>(null);
  const [canvasDragOver, setCanvasDragOver] = useState(false);

  const handleBgImageChange = useCallback((url: string | null) => {
    _setBgImageUrl(url);
    if (!url) {
      setBgImage(null);
      return;
    }
  }, []);

  useEffect(() => {
    if (!bgImageUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setBgImage(img); };
    img.onerror = () => { if (!cancelled) setBgImage(null); };
    img.src = bgImageUrl;
    return () => { cancelled = true; };
  }, [bgImageUrl]);

  const handleImageFile = useCallback((file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setBgImageError('JPG, PNG, WEBP only');
      setTimeout(() => setBgImageError(null), 3000);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setBgImageError('Max 5MB');
      setTimeout(() => setBgImageError(null), 3000);
      return;
    }
    setBgImageError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (url) handleBgImageChange(url);
    };
    reader.readAsDataURL(file);
  }, [handleBgImageChange]);

  // Global paste → background image
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { handleImageFile(file); break; }
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handleImageFile]);

  // ─── Other state ──────────────────────────────────
  const [showPresets, setShowPresets] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingEnvMap, setIsExportingEnvMap] = useState(false);

  const { presets, savePreset, deletePreset, loadPreset } = usePresets();

  useEffect(() => {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }, [cfg]);
  useEffect(() => {
    localStorage.setItem(SEED_KEY, String(seed));
  }, [seed]);

  const handleRandomize = useCallback(() => {
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
    setPast((p) => [...p.slice(-(HISTORY_MAX - 1)), { cfg: cfgRef.current, seed: seedRef.current }]);
    setFuture([]);
    const newSeed = Math.floor(Math.random() * 999999);
    const newCfg = randomConfig();
    _setCfg(newCfg);
    _setSeed(newSeed);
  }, []);

  const handleSectionRand = useCallback((section: string) => {
    const patch = randomSection(section);
    setCfg({ ...cfgRef.current, ...patch });
  }, [setCfg]);

  const handleSectionReset = useCallback((section: string) => {
    const patch = zeroSection(section);
    setCfg({ ...cfgRef.current, ...patch });
  }, [setCfg]);

  const handleExport = useCallback(
    async (resolution: 1500 | 2000 | 3000, format: 'png' | 'jpeg') => {
      setIsExporting(true);
      try {
        await exportCanvas(cfg, seed, resolution, bgImage, format);
      } finally {
        setIsExporting(false);
      }
    },
    [cfg, seed, bgImage],
  );

  const handleEnvMapExport = useCallback(async () => {
    setIsExportingEnvMap(true);
    try {
      await exportEnvMap(cfg, seed, bgImage);
    } finally {
      setIsExportingEnvMap(false);
    }
  }, [cfg, seed, bgImage]);

  const handleLoadPreset = useCallback(
    (preset: Parameters<typeof loadPreset>[0]) => {
      clearTimeout(histDebounceRef.current);
      preChangeRef.current = null;
      setPast((p) => [...p.slice(-(HISTORY_MAX - 1)), { cfg: cfgRef.current, seed: seedRef.current }]);
      setFuture([]);
      const { seed: s, cfg: c } = loadPreset(preset);
      _setCfg(c);
      _setSeed(s);
      setShowPresets(false);
    },
    [loadPreset],
  );

  // Close presets on Escape
  useEffect(() => {
    if (!showPresets) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowPresets(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPresets]);

  const handleCopyLink = useCallback(() => {
    const params = new URLSearchParams();
    params.set("seed", String(seed));
    params.set("cfg", encodeURIComponent(JSON.stringify(cfg)));
    const url = `${window.location.origin}/app?${params}`;
    navigator.clipboard.writeText(url).catch(() => {
      prompt("Copy this link:", url);
    });
  }, [seed, cfg]);

  const bottomBarProps = {
    seed,
    onSeedChange: setSeed,
    onRandomize: handleRandomize,
    onUndo: undo,
    onRedo: redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoCount: past.length,
    onExport: handleExport,
    onEnvMapExport: handleEnvMapExport,
    onPresetsToggle: () => setShowPresets(!showPresets),
    onCopyLink: handleCopyLink,
    isExporting,
    isExportingEnvMap,
  };

  return (
    <div className="generator-layout flex flex-col w-full h-full">
      <SiteNav solid />
      <div className="app">
        <main
          className="main"
          onDragEnter={(e) => {
            if (Array.from(e.dataTransfer.types).includes('Files')) setCanvasDragOver(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setCanvasDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setCanvasDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleImageFile(file);
          }}
        >
          <CanvasPreview cfg={cfg} seed={seed} bgImage={bgImage} dragOver={canvasDragOver} onCfgChange={setCfg} />
          <BottomBar {...bottomBarProps} />
        </main>

        <Sidebar
          cfg={cfg}
          onChange={setCfg}
          bgImageUrl={bgImageUrl}
          bgImageError={bgImageError}
          onBgImageChange={handleBgImageChange}
          onImageFile={handleImageFile}
          onSectionRand={handleSectionRand}
          onSectionReset={handleSectionReset}
          mobileActionBar={<BottomBar {...bottomBarProps} />}
        />

        <AnimatePresence>
          {showPresets && (
            <PresetsPanel
              presets={presets}
              onSave={(name) => savePreset(name, seed, cfg)}
              onLoad={handleLoadPreset}
              onDelete={deletePreset}
              onClose={() => setShowPresets(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
