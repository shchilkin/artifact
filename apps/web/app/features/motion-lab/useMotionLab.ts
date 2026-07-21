import {
  type ArtifactRuntimeCapabilityReport,
  ArtifactRuntimeUnsupportedError,
  createMixedMediaArtwork,
  type MixedMediaArtworkFrameDiagnostics,
  type MixedMediaArtworkSession,
  type MixedMediaMotionRecipe,
  type MixedMediaMotionTrack,
  MixedMediaRecipeCompatibilityError,
  type MixedMediaRecipeCompatibilityReport,
  supportedMotionControlsForLayer,
} from '@shchilkin/artifact-runtime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadRecipe, type LoadedComposition, parseComposition, parseRecipe, readDefaultFixture } from './files';

interface RenderMetrics {
  cadenceFps: number;
  firstFrameMs: number;
  frameCount: number;
  p50Ms: number;
  p95Ms: number;
  renderHeight: number;
  renderWidth: number;
}

const EMPTY_METRICS: RenderMetrics = {
  cadenceFps: 0,
  firstFrameMs: 0,
  frameCount: 0,
  p50Ms: 0,
  p95Ms: 0,
  renderHeight: 0,
  renderWidth: 0,
};

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const ordered = values.toSorted((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] ?? 0;
}

export function useMotionLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<MixedMediaArtworkSession | null>(null);
  const loadedFontFaceRef = useRef<FontFace | null>(null);
  const frameDurationsRef = useRef<number[]>([]);
  const frameTimestampsRef = useRef<number[]>([]);
  const [composition, setComposition] = useState<LoadedComposition | null>(null);
  const [recipe, setRecipe] = useState<MixedMediaMotionRecipe | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState('');
  const [capability, setCapability] = useState<ArtifactRuntimeCapabilityReport | null>(null);
  const [compatibility, setCompatibility] = useState<MixedMediaRecipeCompatibilityReport | null>(null);
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [currentTime, setCurrentTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('Loading retained Viber fixture…');
  const [fontFamily, setFontFamily] = useState('ui-monospace, monospace');
  const [fontStatus, setFontStatus] = useState(
    'Explicit fallback mapping — exact type parity requires owner-supplied local font.',
  );
  const [longTasks, setLongTasks] = useState({ count: 0, maxMs: 0 });

  const installFixture = useCallback((fixture: Awaited<ReturnType<typeof readDefaultFixture>>) => {
    setComposition(fixture.composition);
    setRecipe(fixture.recipe);
    setSelectedLayerId(
      fixture.recipe.tracks[0]?.target.layerId ?? fixture.composition.value.document.layers[0]?.id ?? '',
    );
    setStatus('Neutral Frame ready. Motion remains paused until started.');
  }, []);

  const loadDefaultFixture = useCallback(async () => {
    setStatus('Loading retained Viber fixture…');
    try {
      installFixture(await readDefaultFixture());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [installFixture]);

  useEffect(() => {
    let active = true;
    void readDefaultFixture()
      .then((fixture) => {
        if (active) installFixture(fixture);
      })
      .catch((error) => {
        if (active) setStatus(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [installFixture]);

  useEffect(() => {
    if (!('PerformanceObserver' in window) || !PerformanceObserver.supportedEntryTypes.includes('longtask')) return;
    const observer = new PerformanceObserver((list) => {
      const durations = list.getEntries().map((entry) => entry.duration);
      if (durations.length === 0) return;
      setLongTasks((current) => ({
        count: current.count + durations.length,
        maxMs: Math.max(current.maxMs, ...durations),
      }));
    });
    observer.observe({ entryTypes: ['longtask'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !composition || !recipe) return;
    let active = true;
    const timeout = window.setTimeout(async () => {
      sessionRef.current?.destroy();
      sessionRef.current = null;
      setIsRunning(false);
      frameDurationsRef.current = [];
      frameTimestampsRef.current = [];
      setMetrics(EMPTY_METRICS);
      setStatus('Compiling motion and rendering the Neutral Frame…');
      const fontRefs = composition.value.document.layers.flatMap((layer) =>
        layer.kind === 'text' && typeof layer.font === 'string' ? [layer.font] : [],
      );
      const fontFamilies = Object.fromEntries(fontRefs.map((ref) => [ref, fontFamily]));
      try {
        const session = await createMixedMediaArtwork({
          canvas,
          composition: composition.value,
          compositionSha256: composition.sha256,
          fontFamilies,
          maxRenderSize: 512,
          motionRecipe: recipe,
          onFrame: (frame: MixedMediaArtworkFrameDiagnostics) => {
            if (!active) return;
            const timestamp = performance.now();
            const durations = [...frameDurationsRef.current, frame.renderDurationMs].slice(-120);
            const timestamps = [...frameTimestampsRef.current, timestamp].slice(-120);
            frameDurationsRef.current = durations;
            frameTimestampsRef.current = timestamps;
            const cadenceWindow = timestamps.length > 1 ? timestamp - timestamps[0] : 0;
            setCurrentTime(frame.choreographyTime);
            setMetrics({
              cadenceFps: cadenceWindow > 0 ? ((timestamps.length - 1) * 1000) / cadenceWindow : 0,
              firstFrameMs: durations[0] ?? 0,
              frameCount: durations.length,
              p50Ms: percentile(durations.slice(1), 0.5),
              p95Ms: percentile(durations.slice(1), 0.95),
              renderHeight: frame.height,
              renderWidth: frame.width,
            });
          },
          onRenderError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
          profile: 'mixed-media-2d@1',
        });
        if (!active) {
          session.destroy();
          return;
        }
        sessionRef.current = session;
        setCapability(session.capabilityReport);
        setCompatibility(session.compatibilityReport);
        setCurrentTime(0);
        setStatus('Neutral Frame ready. Motion remains paused until started.');
      } catch (error) {
        if (!active) return;
        if (error instanceof ArtifactRuntimeUnsupportedError) {
          setCapability(error.report);
          setCompatibility(null);
        } else if (error instanceof MixedMediaRecipeCompatibilityError) {
          setCapability(error.capabilityReport);
          setCompatibility(error.report);
        } else {
          setCapability(null);
          setCompatibility(null);
        }
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [composition, fontFamily, recipe]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.min(512, entry.contentRect.width);
      const height = Math.min(512, entry.contentRect.height);
      void sessionRef.current?.resize(width, height);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => sessionRef.current?.destroy(), []);
  useEffect(
    () => () => {
      if (loadedFontFaceRef.current) document.fonts.delete(loadedFontFaceRef.current);
    },
    [],
  );

  const selectedLayer = composition?.value.document.layers.find((layer) => layer.id === selectedLayerId);
  const selectedTracks = recipe?.tracks.filter((track) => track.target.layerId === selectedLayerId) ?? [];
  const supportedControls = useMemo(
    () => (selectedLayer ? supportedMotionControlsForLayer(selectedLayer) : []),
    [selectedLayer],
  );

  const updateTrack = useCallback((updated: MixedMediaMotionTrack) => {
    setRecipe((current) =>
      current
        ? { ...current, tracks: current.tracks.map((track) => (track.id === updated.id ? updated : track)) }
        : current,
    );
  }, []);

  const loadFont = useCallback(async (file: File) => {
    try {
      const family = `Artifact Motion Lab ${Date.now()}`;
      const face = new FontFace(family, await file.arrayBuffer());
      await face.load();
      if (loadedFontFaceRef.current) document.fonts.delete(loadedFontFaceRef.current);
      document.fonts.add(face);
      loadedFontFaceRef.current = face;
      setFontFamily(`"${family}", ui-monospace, monospace`);
      setFontStatus(`Local mapping loaded from ${file.name}. The font file remains browser-local and is not exported.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const loadCompositionFile = useCallback(async (file: File) => {
    try {
      setComposition(await parseComposition(await file.text(), file.name));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const loadRecipeFile = useCallback(async (file: File) => {
    try {
      setRecipe(parseRecipe(await file.text()));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const togglePlayback = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (session.isRunning) session.pause();
    else session.start();
    setIsRunning(session.isRunning);
  }, []);

  const returnToNeutral = useCallback(() => {
    sessionRef.current?.pause();
    setIsRunning(false);
    void sessionRef.current?.seek(0);
  }, []);

  const seek = useCallback((value: number) => {
    sessionRef.current?.pause();
    setIsRunning(false);
    setCurrentTime(value);
    void sessionRef.current?.seek(value);
  }, []);

  const exportRecipe = useCallback(() => {
    if (recipe) downloadRecipe(recipe);
  }, [recipe]);

  return {
    canvasRef,
    stageRef,
    composition,
    recipe,
    selectedLayerId,
    setSelectedLayerId,
    capability,
    compatibility,
    metrics,
    currentTime,
    isRunning,
    status,
    fontStatus,
    longTasks,
    selectedTracks,
    supportedControls,
    updateTrack,
    loadFont,
    loadDefaultFixture,
    loadCompositionFile,
    loadRecipeFile,
    togglePlayback,
    returnToNeutral,
    seek,
    exportRecipe,
  };
}
