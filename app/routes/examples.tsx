import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { MetaFunction } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { SiteNav } from '../components/SiteNav';
import { generateThumbnail } from '../utils/generateThumbnail';
import type { GeneratorConfig } from '../types/config';
import { DEFAULT_CONFIG } from '../types/config';
import { generateRandomHeroFrame } from '../utils/heroConfigs';

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

// Pre-generate 24 random examples at module level so seeds are stable across re-renders
const randomExamples: Array<ExampleData & { id: string }> = Array.from({ length: 24 }, (_, i) => {
  const seed = 300001 + i * 13337;
  const frame = generateRandomHeroFrame(seed);
  return { id: `random-${seed}`, name: `Variant #${seed}`, seed: frame.seed, cfg: frame.cfg };
});

const allInitialExamples = [...rawExamples, ...randomExamples];

export default function Examples() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ExampleItem[]>(
    allInitialExamples.map(ex => ({ ...ex, thumbnail: null }))
  );
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [isTouch, setIsTouch] = useState(false);
  const [allRendered, setAllRendered] = useState(false);
  const [generating, setGenerating] = useState(false);
  const generateBatchRef = useRef(0);

  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function renderAll() {
      for (const ex of allInitialExamples) {
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
      if (!cancelled) setAllRendered(true);
    }
    renderAll();
    return () => { cancelled = true; };
  }, []);

  async function handleGenerateMore() {
    setGenerating(true);
    const batch = generateBatchRef.current;
    generateBatchRef.current += 1;

    // Build all new items first
    const newItems: ExampleItem[] = Array.from({ length: 8 }, (_, i) => {
      const seed = 700001 + batch * 8000 + i * 997;
      const frame = generateRandomHeroFrame(seed);
      return { id: `more-${seed}`, name: `Variant #${frame.seed}`, seed: frame.seed, cfg: frame.cfg, thumbnail: null };
    });

    // Append all at once — no interleaving with thumbnail updates
    setItems(prev => [...prev, ...newItems]);

    // Render thumbnails one by one, updating in place
    for (const item of newItems) {
      try {
        const cfg = { ...DEFAULT_CONFIG, ...item.cfg } as GeneratorConfig;
        const thumb = await generateThumbnail(cfg, item.seed);
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, thumbnail: thumb } : x));
      } catch {
        // leave null
      }
    }
    setGenerating(false);
  }

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
        <motion.header
          className="examples-header"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="examples-title">Examples</h1>
          <p className="examples-subtitle">Tap any cover to open it in the generator.</p>
        </motion.header>
        {items.length === 0 ? (
          <p className="examples-empty">Nothing here yet.</p>
        ) : (
          <motion.div
            className="examples-grid"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
            }}
          >
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  variants={{
                    hidden: { opacity: 0, scale: 0.92, y: 12 },
                    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
                  }}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, scale: 0.88, transition: { duration: 0.2 } }}
                  whileHover={{ scale: 1.025, transition: { duration: 0.18 } }}
                  className={`examples-item${revealed.has(item.id) ? ' examples-item--revealed' : ''}`}
                  onClick={() => {
                    if (isTouch || revealed.has(item.id)) {
                      openInGenerator(item);
                    } else {
                      toggleReveal(item.id);
                    }
                  }}
                  onMouseEnter={() => { if (!isTouch) setRevealed(prev => new Set(prev).add(item.id)); }}
                  onMouseLeave={() => { if (!isTouch) setRevealed(prev => { const n = new Set(prev); n.delete(item.id); return n; }); }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${item.name} — Open in generator`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isTouch || revealed.has(item.id)) {
                        openInGenerator(item);
                      } else {
                        toggleReveal(item.id);
                      }
                    }
                  }}
                >
                  {item.thumbnail ? (
                    <motion.img
                      src={item.thumbnail}
                      alt={item.name}
                      className="examples-item__img"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.35 }}
                    />
                  ) : (
                    <div className="examples-item__loading" aria-hidden="true" />
                  )}
                  <div className="examples-item__overlay">
                    <span className="examples-item__seed">#{item.seed}</span>
                    <span className="examples-item__name">{item.name}</span>
                    <span className="examples-item__cta">Open in generator →</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
        <AnimatePresence>
          {allRendered && (
            <motion.div
              className="examples-more"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                className="btn btn-primary"
                onClick={handleGenerateMore}
                disabled={generating}
              >
                {generating ? 'Generating…' : 'Generate more →'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
