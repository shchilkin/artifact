import { useEffect, useRef, useState } from 'react';
import { openProject, readSummary, type SessionSummary, type WebSession } from '../src/index';
import { TextInspector } from './TextInspector';
import { useArtwork } from './useArtwork';

export function Pilot() {
  const session = useRef<WebSession | null>(null);
  const savedJSON = useRef('');
  const loadRevision = useRef(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('No project open');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const selected = summary?.layers.find((layer) => layer.id === selectedId);
  const artwork = useArtwork(session, summary);

  useEffect(
    () => () => {
      loadRevision.current++;
      session.current?.free();
    },
    [],
  );
  useEffect(() => {
    if (!dirty) return;
    const listener = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);

  async function load(file: File) {
    if (dirty && !window.confirm('Discard unsaved changes and open another project?')) return;
    const revision = ++loadRevision.current;
    setLoading(true);
    let candidate: WebSession | null = null;
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error('Package exceeds the 64 MiB pilot limit');
      candidate = await openProject(await file.text());
      if (revision !== loadRevision.current) {
        candidate.free();
        return;
      }
      const next = readSummary(candidate);
      const currentJSON = candidate.export_json();
      const first = next.layers.find((layer) => (layer.scanlines ?? 0) > 0) ?? next.layers[0];
      session.current?.free();
      session.current = candidate;
      candidate = null;
      savedJSON.current = currentJSON;
      setSummary(next);
      setSelectedId(first?.id ?? '');
      setAmount(first?.scanlines?.toString() ?? '');
      setName(file.name);
      setDirty(false);
      setError('');
    } catch (cause) {
      candidate?.free();
      if (revision === loadRevision.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (revision === loadRevision.current) setLoading(false);
    }
  }

  function act(action: (current: WebSession) => void) {
    if (!session.current) return;
    try {
      action(session.current);
      const next = readSummary(session.current);
      setSummary(next);
      setAmount(next.layers.find((layer) => layer.id === selectedId)?.scanlines?.toString() ?? '');
      setDirty(session.current.export_json() !== savedJSON.current);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function saveCopy() {
    if (!session.current) return;
    const data = session.current.export_json();
    const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.artifact.project+json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/\.artifact$/, '')}-copy.artifact`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    // Download initiation is not proof that a browser accepted/saved the file.
  }

  return (
    <main>
      <header>
        <h1>Artifact Core Pilot</h1>
        <label className="open">
          Open project
          <input
            aria-label="Open project"
            type="file"
            accept=".artifact,application/json"
            disabled={loading}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void load(file);
            }}
          />
        </label>
        <button
          type="button"
          disabled={!summary?.canUndo || loading}
          onClick={() =>
            act((current) => {
              current.undo();
            })
          }
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!summary?.canRedo || loading}
          onClick={() =>
            act((current) => {
              current.redo();
            })
          }
        >
          Redo
        </button>
        <button type="button" disabled={!summary || loading} onClick={saveCopy}>
          Save copy
        </button>
        {artwork.url && (
          <a className="export" href={artwork.url} download={`${name.replace(/\.artifact$/, '')}.png`}>
            Export PNG
          </a>
        )}
      </header>
      <p className="filename">
        {name}
        {dirty ? ' · Modified' : ''}
        {loading ? ' · Opening…' : ''}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="workspace">
        <nav aria-label="Layers">
          <h2>Layers {summary ? `(${summary.layers.length})` : ''}</h2>
          {summary?.layers.map((layer) => (
            <button
              type="button"
              key={layer.id}
              aria-pressed={layer.id === selectedId}
              onClick={() => {
                setSelectedId(layer.id);
                setAmount(layer.scanlines?.toString() ?? '');
              }}
            >
              <span>{layer.name}</span>
              <small>{layer.kind}</small>
            </button>
          ))}
        </nav>
        <section aria-label="Layer properties">
          <h2>{selected?.name ?? 'Open an Artifact project'}</h2>
          {selected ? (
            <>
              {selected.scanlines !== null ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    act((current) => {
                      current.set_scanlines(selected.id, Number(amount));
                    });
                  }}
                >
                  <p>
                    Scanlines: <output>{selected.scanlines}</output>
                  </p>
                  <label>
                    New amount (0–100)
                    <input
                      aria-label="Scanlines amount"
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      required
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      !amount.trim() ||
                      !Number.isFinite(Number(amount)) ||
                      Number(amount) < 0 ||
                      Number(amount) > 100 ||
                      Number(amount) === selected.scanlines
                    }
                  >
                    Apply
                  </button>
                </form>
              ) : selected.text ? (
                <TextInspector
                  key={`${selected.id}:${JSON.stringify(selected.text)}`}
                  value={selected.text}
                  disabled={loading}
                  onApply={(patch) =>
                    act((current) => {
                      current.set_text(selected.id, JSON.stringify(patch));
                    })
                  }
                />
              ) : (
                <p>This layer is preserved. Editing is not available in this build.</p>
              )}
              {artwork.busy && <p role="status">Rendering artwork…</p>}
              {artwork.error && <p role="alert">{artwork.error}</p>}
              {artwork.url && <img className="artwork" src={artwork.url} alt="Rendered artwork, 3000 by 3000 pixels" />}
            </>
          ) : (
            <p>Choose an .artifact file to inspect its layers. Files stay on this device.</p>
          )}
        </section>
      </div>
    </main>
  );
}
