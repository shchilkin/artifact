/** Host presentation policy. Choreography and rendering belong to the package. */
export function mountArtwork({ container, playButton, neutralButton, status, compositionUrl, recipeUrl }) {
  const abort = new AbortController();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  canvas.setAttribute('aria-label', 'Анимированная обложка Вайбер');
  canvas.hidden = true;
  container.append(canvas);
  let session;
  let disposed = false;
  let wantsPlayback = true;
  let observer;

  function showStatic(message) {
    container.dataset.state = 'static';
    canvas.hidden = true;
    playButton.hidden = true;
    neutralButton.hidden = true;
    status.textContent = message;
  }

  function stopSession() {
    observer?.disconnect();
    observer = undefined;
    session?.destroy();
    session = undefined;
  }

  function syncPlayback() {
    if (!session) return;
    if (wantsPlayback && document.visibilityState === 'visible') session.start();
    else session.pause();
    playButton.textContent = wantsPlayback ? 'Пауза' : 'Продолжить';
    status.textContent = wantsPlayback ? 'Движение включено' : 'Движение приостановлено';
  }

  async function initialize() {
    if (reducedMotion.matches) {
      showStatic('Статичная обложка — уменьшение движения включено в настройках устройства.');
      return;
    }
    container.dataset.state = 'loading';
    status.textContent = 'Загружаем живую обложку…';
    try {
      const [runtime, compositionResponse, recipeResponse] = await Promise.all([
        import('@shchilkin/artifact-runtime'),
        fetch(compositionUrl, { signal: abort.signal }),
        fetch(recipeUrl, { signal: abort.signal }),
      ]);
      if (!compositionResponse.ok || !recipeResponse.ok) throw new Error('Artwork assets unavailable');
      const [composition, motionRecipe] = await Promise.all([compositionResponse.json(), recipeResponse.json()]);
      if (disposed || reducedMotion.matches) return;
      const created = await runtime.createMixedMediaArtwork({
        canvas,
        composition,
        motionRecipe,
        profile: 'mixed-media-2d@1',
        maxRenderSize: 512,
        pixelRatio: 1,
        onRenderError: fail,
      });
      if (disposed || reducedMotion.matches) {
        created.destroy();
        return;
      }
      session = created;
      canvas.hidden = false;
      container.dataset.state = 'ready';
      playButton.hidden = false;
      neutralButton.hidden = false;
      observer = new ResizeObserver(([entry]) => {
        if (entry.contentRect.width > 0)
          void session?.resize(entry.contentRect.width, entry.contentRect.height).catch(fail);
      });
      observer.observe(container);
      syncPlayback();
    } catch (error) {
      if (!disposed && !abort.signal.aborted) fail(error);
    }
  }

  function fail(error) {
    if (disposed) return;
    stopSession();
    showStatic('Не удалось запустить движение. Оригинальная обложка остаётся доступной.');
    // Error details are for the integrator, not visitor-facing rendering logic.
    console.error('Artwork initialization or rendering failed', error);
  }

  playButton.addEventListener(
    'click',
    () => {
      wantsPlayback = !wantsPlayback;
      syncPlayback();
    },
    { signal: abort.signal },
  );
  neutralButton.addEventListener(
    'click',
    () => {
      wantsPlayback = false;
      syncPlayback();
      void session?.seek(0).catch(fail);
    },
    { signal: abort.signal },
  );
  document.addEventListener('visibilitychange', syncPlayback, { signal: abort.signal });
  reducedMotion.addEventListener(
    'change',
    () => {
      if (reducedMotion.matches) {
        stopSession();
        showStatic('Статичная обложка — уменьшение движения включено в настройках устройства.');
      }
      // Reopen to opt into motion after preferences change; never autoplay here.
    },
    { signal: abort.signal },
  );
  void initialize();

  return {
    destroy() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      stopSession();
      canvas.remove();
      showStatic('');
    },
  };
}
