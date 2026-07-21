import { TrackEditor } from './TrackEditor';
import { useMotionLab } from './useMotionLab';
import './motion-lab.css';

export default function MotionLab() {
  const {
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
  } = useMotionLab();

  return (
    <main className="motion-lab" data-testid="motion-lab">
      <header className="motion-lab-header">
        <div>
          <p className="motion-lab-mark">Artifact Runtime · mixed-media-2d@1</p>
          <h1>Motion Lab</h1>
        </div>
        <p>
          Load one portable Composition and its Artwork-owned sidecar, then inspect motion without changing the source
          document.
        </p>
      </header>

      <section className="motion-lab-toolbar" aria-label="Motion Lab files">
        <label className="motion-lab-file">
          <span>Composition</span>
          <input
            type="file"
            accept=".artifact,application/json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void loadCompositionFile(file);
            }}
          />
        </label>
        <label className="motion-lab-file">
          <span>Motion sidecar</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void loadRecipeFile(file);
            }}
          />
        </label>
        <label className="motion-lab-file">
          <span>Local font (optional)</span>
          <input
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void loadFont(file);
            }}
          />
        </label>
        <button
          type="button"
          className="motion-lab-button motion-lab-button--quiet"
          onClick={() => void loadDefaultFixture()}
        >
          Reload Viber
        </button>
        <button type="button" className="motion-lab-button" disabled={!recipe} onClick={exportRecipe}>
          Export sidecar
        </button>
      </section>

      <p className="motion-lab-status" role="status">
        {status}
      </p>

      <div className="motion-lab-workspace">
        <section className="motion-lab-stage-panel" aria-label="Artwork preview">
          <div className="motion-lab-stage" ref={stageRef}>
            <canvas ref={canvasRef} width={512} height={512} aria-label="Mixed Media Artwork preview" />
          </div>
          <div className="motion-lab-transport">
            <button
              type="button"
              className="motion-lab-button"
              disabled={!capability?.supported || !compatibility?.compatible}
              onClick={togglePlayback}
            >
              {isRunning ? 'Pause' : 'Start'}
            </button>
            <button
              type="button"
              className="motion-lab-button motion-lab-button--quiet"
              disabled={!capability?.supported || !compatibility?.compatible}
              onClick={returnToNeutral}
            >
              Neutral frame
            </button>
            <label className="motion-lab-scrubber">
              <span>Time {currentTime.toFixed(2)}s</span>
              <input
                type="range"
                min={0}
                max={recipe?.timeline.durationSeconds ?? 1}
                step={0.01}
                value={currentTime}
                onChange={(event) => {
                  seek(Number(event.currentTarget.value));
                }}
              />
            </label>
          </div>
          <p className="motion-lab-font-note">{fontStatus}</p>
        </section>

        <aside className="motion-lab-inspector" aria-label="Motion inspector">
          <section>
            <h2>Layer controls</h2>
            <label className="motion-lab-field motion-lab-field--wide">
              <span>Layer</span>
              <select value={selectedLayerId} onChange={(event) => setSelectedLayerId(event.currentTarget.value)}>
                {composition?.value.document.layers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name ?? layer.id} · {layer.kind}
                  </option>
                ))}
              </select>
            </label>
            <div className="motion-lab-control-list" aria-label="Supported Motion Controls">
              {supportedControls.length > 0 ? (
                supportedControls.map((control) => <code key={control}>{control}</code>)
              ) : (
                <span>No profile controls</span>
              )}
            </div>
          </section>
          <section>
            <h2>Declared tracks</h2>
            {selectedTracks.length > 0 ? (
              selectedTracks.map((track) => (
                <TrackEditor
                  key={`${track.id}:${track.source.type === 'keyframes' ? JSON.stringify(track.source.keyframes) : track.source.type}`}
                  track={track}
                  onChange={updateTrack}
                />
              ))
            ) : (
              <p>No sidecar tracks target this layer.</p>
            )}
          </section>
        </aside>
      </div>

      <section className="motion-lab-diagnostics" aria-label="Runtime diagnostics">
        <h2>Runtime diagnostics</h2>
        <dl>
          <div>
            <dt>Profile</dt>
            <dd>{recipe?.profile ?? '—'}</dd>
          </div>
          <div>
            <dt>Capability</dt>
            <dd>{capability?.status ?? 'not ready'}</dd>
          </div>
          <div>
            <dt>Recipe</dt>
            <dd>{compatibility ? (compatibility.compatible ? 'compatible' : 'incompatible') : 'not compiled'}</dd>
          </div>
          <div>
            <dt>Provenance</dt>
            <dd>{compatibility?.provenance.status ?? '—'}</dd>
          </div>
          <div>
            <dt>Render size</dt>
            <dd>
              {metrics.renderWidth || 0} × {metrics.renderHeight || 0}
            </dd>
          </div>
          <div>
            <dt>Cadence</dt>
            <dd>{metrics.cadenceFps.toFixed(1)} fps</dd>
          </div>
          <div>
            <dt>First frame</dt>
            <dd>{metrics.firstFrameMs.toFixed(1)} ms</dd>
          </div>
          <div>
            <dt>Warm p50 / p95</dt>
            <dd>
              {metrics.p50Ms.toFixed(1)} / {metrics.p95Ms.toFixed(1)} ms
            </dd>
          </div>
          <div>
            <dt>Long tasks</dt>
            <dd>
              {longTasks.count} · max {longTasks.maxMs.toFixed(1)} ms
            </dd>
          </div>
          <div>
            <dt>Composition SHA</dt>
            <dd>
              <code>{composition?.sha256 ?? '—'}</code>
            </dd>
          </div>
        </dl>
        {capability?.issues.length ? <pre>{JSON.stringify(capability.issues, null, 2)}</pre> : null}
        {compatibility?.issues.length ? <pre>{JSON.stringify(compatibility.issues, null, 2)}</pre> : null}
      </section>
    </main>
  );
}
