import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { useNavigate } from 'react-router';
import { Footer } from '../components/Footer';
import { SiteNav } from '../components/SiteNav';
import { ASPECT_SIZES, type AspectRatio, type CanvasDocument } from '../types/config';
import { CURATED_EXAMPLES, type CuratedExampleCategory } from '../utils/curatedExamples';
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
  category: CuratedExampleCategory | 'Random seed';
  summary: string;
  usedNodes: string[];
  startCopy: string;
  aspect: AspectRatio;
  doc: CanvasDocument;
  thumbnail: string | null;
}

const ASPECT_ROTATION: AspectRatio[] = ['1:1', '4:5', '9:16', '16:9', '4:5', '1:1', '16:9', '9:16'];
const CATEGORY_ORDER: Array<ExampleItem['category']> = [
  'Graph recipe',
  'Layer recipe',
  'Texture study',
  'Effect stack',
  'Random seed',
];

function pickAspect(index: number): AspectRatio {
  return ASPECT_ROTATION[index % ASPECT_ROTATION.length];
}

function withAspect(doc: CanvasDocument, aspect: AspectRatio): CanvasDocument {
  return { ...doc, global: { ...doc.global, aspect } };
}

const ASPECT_LABEL: Record<AspectRatio, string> = {
  '1:1': 'square',
  '4:5': 'story',
  '9:16': 'vertical',
  '16:9': 'wide',
};

const curatedExamples: ExampleItem[] = CURATED_EXAMPLES.map(
  ({ id, name, category, summary, usedNodes, startCopy, doc }) => ({
    id,
    name,
    category,
    summary,
    usedNodes,
    startCopy,
    aspect: doc.global.aspect,
    doc,
    thumbnail: null,
  }),
);

function buildRandomItems(count: number, baseSeed: number, idPrefix: string): ExampleItem[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = baseSeed + i * 13337;
    const aspect = pickAspect(i + 1);
    const frame = generateRandomHeroFrame(seed);
    const doc = withAspect({ ...frame.doc, export: { format: 'png', scale: 1, target: 'cover' } }, aspect);
    return {
      id: `${idPrefix}-${seed}`,
      name: `Variant #${seed}`,
      category: 'Random seed',
      summary: 'Generated from the random cover engine for fast exploration.',
      usedNodes: ['Random source', 'Effects', ASPECT_LABEL[aspect]],
      startCopy: 'Open this seed when you want a surprising base to edit by hand.',
      aspect,
      doc,
      thumbnail: null,
    };
  });
}

const initialRandom = buildRandomItems(28, 300001, 'random');
const initialItems: ExampleItem[] = [...curatedExamples, ...initialRandom];

const thumbnailImageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadThumbnailImage(src: string): Promise<HTMLImageElement | null> {
  const existing = thumbnailImageCache.get(src);
  if (existing) return existing;
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  thumbnailImageCache.set(src, pending);
  return pending;
}

async function buildThumbnailImageCache(doc: CanvasDocument): Promise<Map<string, HTMLImageElement>> {
  const sources = Array.from(new Set(doc.layers.filter((layer) => layer.kind === 'image').map((layer) => layer.src)));
  const loaded = await Promise.all(sources.map(async (src) => [src, await loadThumbnailImage(src)] as const));
  return new Map(loaded.filter((entry): entry is readonly [string, HTMLImageElement] => entry[1] !== null));
}

interface FilterState {
  aspect: AspectRatio | 'all';
  category: ExampleItem['category'] | 'all';
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
  const [filter, setFilter] = useState<FilterState>({ aspect: 'all', category: 'all' });
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
          const thumb = await generateThumbnail(ex.doc, await buildThumbnailImageCache(ex.doc));
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
        const thumb = await generateThumbnail(item.doc, await buildThumbnailImageCache(item.doc));
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
    return items.filter((item) => {
      const matchesAspect = filter.aspect === 'all' || item.aspect === filter.aspect;
      const matchesCategory = filter.category === 'all' || item.category === filter.category;
      return matchesAspect && matchesCategory;
    });
  }, [items, filter.aspect, filter.category]);

  const aspectTotals = useMemo(() => {
    const totals: Record<AspectRatio, number> = { '1:1': 0, '4:5': 0, '9:16': 0, '16:9': 0 };
    for (const item of items) totals[item.aspect] += 1;
    return totals;
  }, [items]);

  const categoryTotals = useMemo(() => {
    const totals = new Map<ExampleItem['category'], number>();
    for (const item of items) totals.set(item.category, (totals.get(item.category) ?? 0) + 1);
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
              onClick={() => setFilter((current) => ({ ...current, aspect: 'all' }))}
            />
            {(['1:1', '4:5', '9:16', '16:9'] as AspectRatio[]).map((aspect) => (
              <FilterButton
                key={aspect}
                label={`${aspect} ${ASPECT_LABEL[aspect]}`}
                count={aspectTotals[aspect]}
                active={filter.aspect === aspect}
                onClick={() => setFilter((current) => ({ ...current, aspect }))}
              />
            ))}
          </div>
          <div className="examples-filters" role="tablist" aria-label="Filter by workflow category">
            <FilterButton
              label="all workflows"
              count={items.length}
              active={filter.category === 'all'}
              onClick={() => setFilter((current) => ({ ...current, category: 'all' }))}
            />
            {CATEGORY_ORDER.map((category) => (
              <FilterButton
                key={category}
                label={category}
                count={categoryTotals.get(category) ?? 0}
                active={filter.category === category}
                onClick={() => setFilter((current) => ({ ...current, category }))}
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
          <span className="examples-tile__seed">
            {item.category} / SEED #{item.doc.global.seed}
          </span>
          <span className="examples-tile__name">{item.name}</span>
          <span className="examples-tile__summary">{item.summary}</span>
          <span className="examples-tile__nodes">{item.usedNodes.join(' / ')}</span>
          <span className="examples-tile__start">{item.startCopy}</span>
          <span className="examples-tile__cta">Open in generator →</span>
        </div>
      </div>
    </motion.div>
  );
}
