import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { useNavigate } from 'react-router';
import { Footer } from '../components/Footer';
import { SiteNav } from '../components/SiteNav';
import { ASPECT_SIZES, type AspectRatio, type CanvasDocument } from '../types/config';
import { CURATED_EXAMPLES } from '../utils/curatedExamples';
import { generateThumbnail } from '../utils/generateThumbnail';
import { generateRandomHeroFrame } from '../utils/heroConfigs';

export const meta: MetaFunction = () => [
  { title: 'Examples | Album Cover Generator' },
  {
    name: 'description',
    content: 'Browse glitch covers in every aspect ratio: square, story, vertical, wide. Tap any to open and remix it.',
  },
];

interface ExampleItem {
  id: string;
  name: string;
  aspect: AspectRatio;
  doc: CanvasDocument;
  thumbnail: string | null;
}

const ASPECT_ROTATION: AspectRatio[] = ['1:1', '4:5', '9:16', '16:9', '4:5', '1:1', '16:9', '9:16'];

function pickAspect(index: number): AspectRatio {
  return ASPECT_ROTATION[index % ASPECT_ROTATION.length];
}

function withAspect(doc: CanvasDocument, aspect: AspectRatio): CanvasDocument {
  return { ...doc, global: { ...doc.global, aspect } };
}

const curatedExamples: ExampleItem[] = CURATED_EXAMPLES.map(({ id, name, doc }) => ({
  id,
  name,
  aspect: doc.global.aspect,
  doc,
  thumbnail: null,
}));

function buildRandomItems(count: number, baseSeed: number, idPrefix: string): ExampleItem[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = baseSeed + i * 13337;
    const aspect = pickAspect(i + 1);
    const frame = generateRandomHeroFrame(seed);
    const doc = withAspect({ ...frame.doc, export: { format: 'png', scale: 1, target: 'cover' } }, aspect);
    return {
      id: `${idPrefix}-${seed}`,
      name: `Variant #${seed}`,
      aspect,
      doc,
      thumbnail: null,
    };
  });
}

const initialRandom = buildRandomItems(28, 300001, 'random');
const initialItems: ExampleItem[] = [...curatedExamples, ...initialRandom];

const ASPECT_LABEL: Record<AspectRatio, string> = {
  '1:1': 'square',
  '4:5': 'story',
  '9:16': 'vertical',
  '16:9': 'wide',
};

interface FilterState {
  aspect: AspectRatio | 'all';
}

function getColumnCount(width: number): number {
  if (width >= 1600) return 5;
  if (width >= 1200) return 4;
  if (width >= 768) return 3;
  return 2;
}

function distributeColumns(items: ExampleItem[], colCount: number): ExampleItem[][] {
  const cols: ExampleItem[][] = Array.from({ length: colCount }, () => []);
  const heights = new Array<number>(colCount).fill(0);
  for (const item of items) {
    const [aw, ah] = ASPECT_SIZES[item.aspect];
    const ratio = ah / aw;
    let shortest = 0;
    for (let i = 1; i < colCount; i++) {
      if (heights[i] < heights[shortest]) shortest = i;
    }
    cols[shortest].push(item);
    heights[shortest] += ratio;
  }
  return cols;
}

export default function Examples() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ExampleItem[]>(initialItems);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterState>({ aspect: 'all' });
  const [isTouch] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(pointer: coarse)').matches,
  );
  const [generating, setGenerating] = useState(false);
  const [columnCount, setColumnCount] = useState(() =>
    typeof window === 'undefined' ? 3 : getColumnCount(window.innerWidth),
  );
  const generateBatchRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const generatingRef = useRef(false);

  useEffect(() => {
    function update() {
      setColumnCount(getColumnCount(window.innerWidth));
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const ex of initialItems) {
        if (cancelled) break;
        try {
          const thumb = await generateThumbnail(ex.doc, new Map());
          if (!cancelled) {
            setItems((prev) => prev.map((item) => (item.id === ex.id ? { ...item, thumbnail: thumb } : item)));
          }
        } catch {
          // ignore single-item failures
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerateMore = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    const batch = generateBatchRef.current++;
    const newItems = buildRandomItems(32, 700001 + batch * 32000, `more-${batch}`);
    setItems((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      try {
        const thumb = await generateThumbnail(item.doc, new Map());
        setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, thumbnail: thumb } : x)));
      } catch {
        // ignore
      }
    }
    generatingRef.current = false;
    setGenerating(false);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !generatingRef.current) handleGenerateMore();
      },
      { rootMargin: '320px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleGenerateMore]);

  function openInGenerator(item: ExampleItem) {
    navigate(`/app?doc=${encodeURIComponent(JSON.stringify(item.doc))}`);
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredItems = useMemo(() => {
    if (filter.aspect === 'all') return items;
    return items.filter((item) => item.aspect === filter.aspect);
  }, [items, filter.aspect]);

  const aspectTotals = useMemo(() => {
    const totals: Record<AspectRatio, number> = { '1:1': 0, '4:5': 0, '9:16': 0, '16:9': 0 };
    for (const item of items) totals[item.aspect] += 1;
    return totals;
  }, [items]);

  const columns = useMemo(() => distributeColumns(filteredItems, columnCount), [filteredItems, columnCount]);

  return (
    <div className="min-h-dvh bg-bg flex flex-col overflow-y-auto">
      <SiteNav />
      <main className="examples-main">
        <motion.header
          className="examples-header"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="examples-header__top">
            <p className="examples-header__eyebrow">Field guide</p>
            <h1 className="examples-header__title">Examples</h1>
            <p className="examples-header__deck">Curated workflows and random seeds. Tap one to remix.</p>
            <button type="button" className="examples-blank-link" onClick={() => navigate('/app?new=blank')}>
              New blank canvas
            </button>
          </div>
          <div className="examples-filters" role="tablist" aria-label="Filter by aspect ratio">
            <FilterButton
              label="all"
              count={items.length}
              active={filter.aspect === 'all'}
              onClick={() => setFilter({ aspect: 'all' })}
            />
            {(['1:1', '4:5', '9:16', '16:9'] as AspectRatio[]).map((aspect) => (
              <FilterButton
                key={aspect}
                label={`${aspect} ${ASPECT_LABEL[aspect]}`}
                count={aspectTotals[aspect]}
                active={filter.aspect === aspect}
                onClick={() => setFilter({ aspect })}
              />
            ))}
          </div>
        </motion.header>

        {filteredItems.length === 0 ? (
          <p className="examples-empty">No examples in this aspect yet.</p>
        ) : (
          <div className="examples-mosaic">
            {columns.map((col, ci) => (
              <div key={ci} className="examples-mosaic__col">
                {col.map((item) => (
                  <ExampleTile
                    key={item.id}
                    item={item}
                    revealed={revealed.has(item.id)}
                    isTouch={isTouch}
                    onOpen={() => openInGenerator(item)}
                    onReveal={() => toggleReveal(item.id)}
                    onHoverIn={() => {
                      if (!isTouch) {
                        setRevealed((prev) => {
                          if (prev.has(item.id)) return prev;
                          const next = new Set(prev);
                          next.add(item.id);
                          return next;
                        });
                      }
                    }}
                    onHoverOut={() => {
                      if (!isTouch) {
                        setRevealed((prev) => {
                          if (!prev.has(item.id)) return prev;
                          const next = new Set(prev);
                          next.delete(item.id);
                          return next;
                        });
                      }
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        <div ref={sentinelRef} className="examples-sentinel">
          {generating && (
            <motion.span
              className="examples-loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              generating…
            </motion.span>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

interface FilterButtonProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function FilterButton({ label, count, active, onClick }: FilterButtonProps) {
  return (
    <button
      type="button"
      className={`examples-filter${active ? ' examples-filter--active' : ''}`}
      onClick={onClick}
      role="tab"
      aria-selected={active}
    >
      <span>{label}</span>
      <span className="examples-filter__count">{count}</span>
    </button>
  );
}

interface ExampleTileProps {
  item: ExampleItem;
  revealed: boolean;
  isTouch: boolean;
  onOpen: () => void;
  onReveal: () => void;
  onHoverIn: () => void;
  onHoverOut: () => void;
}

function ExampleTile({ item, revealed, isTouch, onOpen, onReveal, onHoverIn, onHoverOut }: ExampleTileProps) {
  const [aw, ah] = ASPECT_SIZES[item.aspect];
  const aspectStyle = { aspectRatio: `${aw} / ${ah}` };

  function handleClick() {
    if (isTouch || revealed) onOpen();
    else onReveal();
  }

  function handleKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`examples-tile examples-tile--${item.aspect.replace(':', 'x')}${revealed ? ' examples-tile--revealed' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Open ${item.name} in generator`}
      onClick={handleClick}
      onKeyDown={handleKey}
      onMouseEnter={onHoverIn}
      onMouseLeave={onHoverOut}
      onFocus={onHoverIn}
      onBlur={onHoverOut}
    >
      <div className="examples-tile__frame" style={aspectStyle}>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.name} className="examples-tile__img" loading="lazy" />
        ) : (
          <div className="examples-tile__loading" aria-hidden="true" />
        )}
        <div className="examples-tile__overlay">
          <span className="examples-tile__seed">SEED #{item.doc.global.seed}</span>
          <span className="examples-tile__name">{item.name}</span>
          <span className="examples-tile__cta">Open in generator →</span>
        </div>
      </div>
    </motion.div>
  );
}
