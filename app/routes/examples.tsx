import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { MetaFunction } from 'react-router';
import { SiteNav } from '../components/SiteNav';
import { generateThumbnail } from '../utils/generateThumbnail';
import type { GeneratorConfig } from '../types/config';
import { DEFAULT_CONFIG } from '../types/config';

export const meta: MetaFunction = () => [
  { title: 'Examples — Album Cover Generator' },
  { name: 'description', content: 'Browse glitch album covers made with the generator. Tap any to open and remix it.' },
];

interface ExampleData {
  name: string;
  seed: number;
  cfg: Partial<GeneratorConfig>;
}

interface ExampleItem extends ExampleData {
  thumbnail: string | null;
  id: string;
}

// Load all JSON files from app/examples/
const exampleModules = import.meta.glob('../examples/*.json', { eager: true }) as Record<string, { default: ExampleData }>;

const rawExamples: Array<ExampleData & { id: string }> = Object.entries(exampleModules).map(([path, mod]) => {
  const data = (mod as any).default ?? mod;
  const id = path.replace('../examples/', '').replace('.json', '');
  return { ...data, id };
});

export default function Examples() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ExampleItem[]>(
    rawExamples.map(ex => ({ ...ex, thumbnail: null }))
  );
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function renderAll() {
      for (const ex of rawExamples) {
        if (cancelled) break;
        try {
          const cfg = { ...DEFAULT_CONFIG, ...ex.cfg } as GeneratorConfig;
          const thumb = await generateThumbnail(cfg, ex.seed);
          if (!cancelled) {
            setItems(prev => prev.map(item => item.id === ex.id ? { ...item, thumbnail: thumb } : item));
          }
        } catch {
          // leave thumbnail null
        }
      }
    }
    renderAll();
    return () => { cancelled = true; };
  }, []);

  function openInGenerator(ex: ExampleItem) {
    navigate(`/app?seed=${ex.seed}&cfg=${encodeURIComponent(JSON.stringify(ex.cfg))}`);
  }

  function toggleReveal(id: string) {
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="examples-page">
      <SiteNav />
      <main className="examples-main">
        <header className="examples-header">
          <h1 className="examples-title">Examples</h1>
          <p className="examples-subtitle">Tap any cover to open it in the generator.</p>
        </header>
        {items.length === 0 ? (
          <p className="examples-empty">Nothing here yet.</p>
        ) : (
          <div className="examples-grid">
            {items.map(item => (
              <div
                key={item.id}
                className={`examples-item${revealed.has(item.id) ? ' examples-item--revealed' : ''}`}
                onClick={() => {
                  if (!revealed.has(item.id)) {
                    toggleReveal(item.id);
                  } else {
                    openInGenerator(item);
                  }
                }}
                onMouseEnter={() => setRevealed(prev => new Set(prev).add(item.id))}
                onMouseLeave={() => setRevealed(prev => { const n = new Set(prev); n.delete(item.id); return n; })}
                role="button"
                tabIndex={0}
                aria-label={`${item.name} — Open in generator`}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openInGenerator(item); }}
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.name} className="examples-item__img" />
                ) : (
                  <div className="examples-item__loading" aria-hidden="true" />
                )}
                <div className="examples-item__overlay">
                  <span className="examples-item__seed">#{item.seed}</span>
                  <span className="examples-item__name">{item.name}</span>
                  <span className="examples-item__cta">Open in generator →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
