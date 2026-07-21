import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from '@playwright/test';

const projectPath =
  process.env.ARTIFACT_VIBER_PROJECT ??
  '/Users/shchilkin/dev/portfolio-2025/public/album-covers/artifact/viber.artifact';
const recipePath =
  process.env.ARTIFACT_VIBER_MOTION ?? new URL('../docs/experiments/fixtures/viber.motion.json', import.meta.url);
const baseUrl = process.env.ARTIFACT_RUNTIME_BASE_URL ?? 'http://127.0.0.1:4173';
const screenshotPath = process.env.ARTIFACT_VIBER_SCREENSHOT ?? '/private/tmp/artifact-viber-motion-frame.png';
const [projectBytes, recipeBytes] = await Promise.all([readFile(projectPath), readFile(recipePath)]);
const project = JSON.parse(projectBytes.toString('utf8'));
const recipe = JSON.parse(recipeBytes.toString('utf8'));
const projectSha256 = createHash('sha256').update(projectBytes).digest('hex');
const recipeSha256 = createHash('sha256').update(recipeBytes).digest('hex');
const fontRef = project.document.layers.find((layer) => layer.kind === 'text')?.font;
if (typeof fontRef !== 'string') throw new Error('The Viber fixture has no editable text font reference.');

const runtimeModuleUrl = `/@fs${process.cwd()}/packages/runtime/src/index.ts`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const result = await page.evaluate(
    async ({ fontRef, project, projectSha256, recipe, runtimeModuleUrl }) => {
      const runtime = await import(runtimeModuleUrl);
      const fontFamilies = { [fontRef]: 'ui-monospace, monospace' };
      const unresolvedReport = runtime.analyzeArtifactRuntimeProject(project);
      const report = runtime.analyzeArtifactRuntimeProject(project, { fontFamilies });
      const pixels = (canvas) =>
        new Uint8ClampedArray(
          canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data,
        );
      const digest = async (value) => {
        const hash = await crypto.subtle.digest('SHA-256', value);
        return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      };
      const countChanged = (left, right) => {
        let changed = 0;
        for (let index = 0; index < Math.min(left.length, right.length); index += 4) {
          if (
            left[index] !== right[index] ||
            left[index + 1] !== right[index + 1] ||
            left[index + 2] !== right[index + 2] ||
            left[index + 3] !== right[index + 3]
          ) {
            changed += 1;
          }
        }
        return changed;
      };
      const pixelDiff = (left, right, tolerance = 2) => {
        let changedOverTolerance = 0;
        let maxChannelDelta = 0;
        let totalChannelDelta = 0;
        const pixelCount = Math.min(left.length, right.length) / 4;
        for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
          const delta = Math.abs(left[index] - right[index]);
          totalChannelDelta += delta;
          maxChannelDelta = Math.max(maxChannelDelta, delta);
          if (index % 4 !== 3 && delta > tolerance) changedOverTolerance += 1;
        }
        return {
          changedOverTolerance,
          maxChannelDelta,
          meanChannelDelta: totalChannelDelta / Math.min(left.length, right.length),
          pixelCount,
        };
      };

      const staticCanvas = document.createElement('canvas');
      const staticStartedAt = performance.now();
      await runtime.renderArtifactRuntimeProject({
        canvas: staticCanvas,
        project,
        width: 512,
        height: 512,
        fontFamilies,
      });
      const staticRenderMs = performance.now() - staticStartedAt;
      const staticPixels = pixels(staticCanvas);

      const renderRecipeSlice = async (tracks, time) => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const frameDiagnostics = [];
        const slice = { ...recipe, tracks };
        const creationStartedAt = performance.now();
        const session = await runtime.createMixedMediaArtwork({
          canvas,
          composition: project,
          compositionSha256: projectSha256,
          fontFamilies,
          maxRenderSize: 512,
          motionRecipe: slice,
          onFrame: (frame) => frameDiagnostics.push(frame),
          pixelRatio: 1,
          profile: 'mixed-media-2d@1',
        });
        const creationMs = performance.now() - creationStartedAt;
        const neutral = pixels(canvas);
        await session.seek(time);
        const animated = pixels(canvas);
        session.destroy();
        return {
          animated,
          changedPixels: countChanged(neutral, animated),
          creationMs,
          firstFrameRenderMs: frameDiagnostics[0]?.renderDurationMs ?? 0,
          neutral,
        };
      };

      const imageTracks = recipe.tracks.filter((track) => track.target.layerId === 'layer-1780509986923-502');
      const emojiTracks = recipe.tracks.filter((track) => track.target.layerId === 'layer-1780509501549-384');
      const effectTracks = recipe.tracks.filter((track) => track.target.layerKind === 'effect');
      const [imageSlice, emojiSlice, emojiWithinStepSlice, effectSlice] = await Promise.all([
        renderRecipeSlice(imageTracks, 1.25),
        renderRecipeSlice(emojiTracks, 1.25),
        renderRecipeSlice(emojiTracks, 1.251),
        renderRecipeSlice(effectTracks, 1.72),
      ]);

      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const frames = [];
      const longTasks = [];
      const observer =
        'PerformanceObserver' in window && PerformanceObserver.supportedEntryTypes.includes('longtask')
          ? new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)))
          : null;
      observer?.observe({ entryTypes: ['longtask'] });
      const creationStartedAt = performance.now();
      const session = await runtime.createMixedMediaArtwork({
        canvas,
        composition: project,
        compositionSha256: projectSha256,
        fontFamilies,
        maxRenderSize: 512,
        motionRecipe: recipe,
        onFrame: (frame) => frames.push({ ...frame, capturedAt: performance.now() }),
        pixelRatio: 1,
        profile: 'mixed-media-2d@1',
      });
      const creationMs = performance.now() - creationStartedAt;
      const neutralPixels = pixels(canvas);
      const neutralChecksum = await digest(neutralPixels);
      const neutralStaticChangedPixels = countChanged(staticPixels, neutralPixels);
      const neutralStaticDiff = pixelDiff(staticPixels, neutralPixels);
      await session.seek(1.25);
      const firstAnimatedPixels = pixels(canvas);
      const firstAnimatedChecksum = await digest(firstAnimatedPixels);
      await session.seek(1.25);
      const repeatedAnimatedChecksum = await digest(pixels(canvas));
      await session.seek(recipe.timeline.durationSeconds);
      const loopEndChecksum = await digest(pixels(canvas));
      session.start();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      session.pause();
      observer?.disconnect();
      const cadenceFrames = frames.slice(4);
      const cadenceWindow =
        cadenceFrames.length > 1 ? cadenceFrames.at(-1).capturedAt - cadenceFrames[0].capturedAt : 0;
      const cadenceFps = cadenceWindow > 0 ? ((cadenceFrames.length - 1) * 1000) / cadenceWindow : 0;
      const warmDurations = frames
        .slice(1)
        .map((frame) => frame.renderDurationMs)
        .toSorted((a, b) => a - b);
      const percentile = (fraction) =>
        warmDurations[Math.min(warmDurations.length - 1, Math.floor(warmDurations.length * fraction))] ?? 0;
      const displayCanvas = document.createElement('canvas');
      displayCanvas.width = canvas.width;
      displayCanvas.height = canvas.height;
      displayCanvas.getContext('2d').drawImage(canvas, 0, 0);
      session.destroy();

      document.body.replaceChildren(displayCanvas);
      Object.assign(document.body.style, { margin: '0', width: '512px', height: '512px', overflow: 'hidden' });
      return {
        capabilityReport: report,
        compatibilityReport: runtime.analyzeMixedMediaMotionRecipe(project, recipe, {
          compositionSha256: projectSha256,
        }),
        compositionControls: Object.fromEntries(
          project.document.layers.map((layer) => [layer.id, runtime.supportedMotionControlsForLayer(layer)]),
        ),
        deterministic: firstAnimatedChecksum === repeatedAnimatedChecksum,
        effectChangedPixels: effectSlice.changedPixels,
        emojiChangedPixels: emojiSlice.changedPixels,
        emojiStableWithinStepChangedPixels: countChanged(emojiSlice.animated, emojiWithinStepSlice.animated),
        firstAnimatedChecksum,
        firstFrameRenderMs: frames[0]?.renderDurationMs ?? 0,
        imageChangedPixels: imageSlice.changedPixels,
        lifecycle: { destroyedCanvas: [canvas.width, canvas.height], idempotentDestroyCoveredByUnitTest: true },
        loopEndChecksum,
        loopMatchesNeutral: loopEndChecksum === neutralChecksum,
        longTasksOver100Ms: longTasks.filter((duration) => duration > 100),
        neutralChecksum,
        neutralMatchesStatic:
          neutralStaticDiff.changedOverTolerance / neutralStaticDiff.pixelCount < 0.005 &&
          neutralStaticDiff.meanChannelDelta < 0.2,
        neutralStaticDiff,
        neutralStaticChangedPixels,
        performance: {
          cadenceFps,
          creationMs,
          firstFrameRenderMs: frames[0]?.renderDurationMs ?? 0,
          staticRenderMs,
          warmFrameCount: warmDurations.length,
          warmP50Ms: percentile(0.5),
          warmP95Ms: percentile(0.95),
        },
        repeatedAnimatedChecksum,
        unresolvedReport,
        userAgent: navigator.userAgent,
      };
    },
    { fontRef, project, projectSha256, recipe, runtimeModuleUrl },
  );

  if (result.unresolvedReport.status !== 'unresolved-fonts') {
    throw new Error(`Expected unresolved-fonts without a host mapping, received ${result.unresolvedReport.status}.`);
  }
  if (result.capabilityReport.status !== 'ready' || result.capabilityReport.layerOrder.length !== 15) {
    throw new Error('The mapped Viber project did not resolve as one ready 15-layer graph.');
  }
  if (!result.compatibilityReport.compatible || result.compatibilityReport.provenance.status !== 'match') {
    throw new Error('The Viber Motion Recipe did not compile against its retained Composition provenance.');
  }
  if (!result.neutralMatchesStatic || !result.loopMatchesNeutral) {
    throw new Error(
      `The document-backed Neutral Frame or loop boundary diverged from static rendering: ${JSON.stringify({ neutralMatchesStatic: result.neutralMatchesStatic, neutralStaticChangedPixels: result.neutralStaticChangedPixels, neutralStaticDiff: result.neutralStaticDiff, loopMatchesNeutral: result.loopMatchesNeutral, neutralChecksum: result.neutralChecksum, loopEndChecksum: result.loopEndChecksum })}`,
    );
  }
  if (!result.deterministic) throw new Error('Repeated Viber evaluation at the same time was nondeterministic.');
  if ([result.imageChangedPixels, result.emojiChangedPixels, result.effectChangedPixels].some((value) => value === 0)) {
    throw new Error('One of the required image, emoji, or effect evidence slices did not change pixels.');
  }
  if (result.emojiStableWithinStepChangedPixels !== 0) {
    throw new Error('The stepped emoji field reshuffled without a choreography-time change.');
  }
  if (result.performance.cadenceFps < 30) {
    throw new Error(`Viber cadence ${result.performance.cadenceFps.toFixed(1)} fps missed the 30 fps target.`);
  }
  if (result.longTasksOver100Ms.length > 1) {
    throw new Error(`Viber produced repeated long tasks over 100 ms: ${result.longTasksOver100Ms.join(', ')}.`);
  }

  await page.screenshot({ path: screenshotPath, clip: { x: 0, y: 0, width: 512, height: 512 } });
  console.log(
    JSON.stringify(
      {
        ...result,
        blocker:
          'The retained imported font is metadata-only. The local fallback proves runtime behavior but not exact typography parity or redistribution rights.',
        projectSha256,
        recipeSha256,
        screenshotPath,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
