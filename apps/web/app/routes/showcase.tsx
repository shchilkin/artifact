import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { useNavigate } from 'react-router';
import { Footer } from '../components/Footer';
import { SiteNav } from '../components/SiteNav';
import { ActionButton } from '../components/ui/ActionButton';
import { ASPECT_SIZES, type AspectRatio, type CanvasDocument } from '../types/config';
import { CURATED_EXAMPLES } from '../utils/curatedExamples';
import { generateThumbnail } from '../utils/generateThumbnail';
import { RANDOM_FORMULA_IDS, type RandomFormulaId, randomDocumentForFormula } from '../utils/randomConfig';

export const meta: MetaFunction = () => [
  { title: 'Showcase | Made in Artifact' },
  {
    name: 'description',
    content: 'Browse an infinite wall of artwork made in Artifact.',
  },
];

interface RandomFormulaProfile {
  title: string;
}

interface ShowcaseItem {
  id: string;
  name: string;
  aspect: AspectRatio;
  doc: CanvasDocument;
  thumbnail: string | null;
}

const ASPECT_ROTATION: AspectRatio[] = ['1:1', '4:5', '9:16', '16:9', '4:5', '1:1', '16:9', '9:16'];
const INITIAL_RANDOM_COUNT = 56;
const RANDOM_BATCH_SIZE = 48;
const THUMBNAIL_RENDER_CONCURRENCY = 4;

const RANDOM_FORMULA_PROFILES: Record<RandomFormulaId, RandomFormulaProfile> = {
  imagePoster: {
    title: 'Photo poster',
  },
  typePoster: {
    title: 'Type stack',
  },
  texturePlate: {
    title: 'Texture plate',
  },
  printDamage: {
    title: 'Print treatment',
  },
};

function pickAspect(index: number): AspectRatio {
  return ASPECT_ROTATION[index % ASPECT_ROTATION.length];
}

function withAspect(doc: CanvasDocument, aspect: AspectRatio): CanvasDocument {
  return { ...doc, global: { ...doc.global, aspect } };
}

const curatedShowcaseItems: ShowcaseItem[] = CURATED_EXAMPLES.map(({ id, name, doc }) => ({
  id,
  name,
  aspect: doc.global.aspect,
  doc,
  thumbnail: null,
}));

function buildRandomItems(count: number, baseSeed: number, idPrefix: string): ShowcaseItem[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = baseSeed + i * 13337;
    const formula = RANDOM_FORMULA_IDS[i % RANDOM_FORMULA_IDS.length];
    const profile = RANDOM_FORMULA_PROFILES[formula];
    const aspect = pickAspect(i + 1);
    const doc = withAspect(randomDocumentForFormula(formula, seed), aspect);
    return {
      id: `${idPrefix}-${seed}`,
      name: profile.title,
      aspect,
      doc,
      thumbnail: null,
    };
  });
}

const initialRandom = buildRandomItems(INITIAL_RANDOM_COUNT, 300001, 'random');
const initialItems: ShowcaseItem[] = [...curatedShowcaseItems, ...initialRandom];

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

async function renderShowcaseThumbnail(item: ShowcaseItem): Promise<string> {
  return generateThumbnail(item.doc, await buildThumbnailImageCache(item.doc));
}

async function renderThumbnailBatch(
  batch: ShowcaseItem[],
  onThumbnail: (id: string, thumbnail: string) => void,
  isCancelled: () => boolean = () => false,
) {
  let cursor = 0;
  const nextItem = () => {
    const item = batch[cursor];
    cursor += 1;
    return item;
  };
  const workers = Array.from({ length: thumbnailWorkerCount(batch) }, () =>
    renderThumbnailWorker(nextItem, onThumbnail, isCancelled),
  );
  await Promise.all(workers);
}

function thumbnailWorkerCount(batch: ShowcaseItem[]) {
  return Math.min(THUMBNAIL_RENDER_CONCURRENCY, batch.length);
}

async function renderThumbnailWorker(
  nextItem: () => ShowcaseItem | undefined,
  onThumbnail: (id: string, thumbnail: string) => void,
  isCancelled: () => boolean,
) {
  while (!isCancelled()) {
    const item = nextItem();
    if (!item) return;
    await renderThumbnailItem(item, onThumbnail, isCancelled);
  }
}

async function renderThumbnailItem(
  item: ShowcaseItem,
  onThumbnail: (id: string, thumbnail: string) => void,
  isCancelled: () => boolean,
) {
  try {
    const thumbnail = await renderShowcaseThumbnail(item);
    if (!isCancelled()) onThumbnail(item.id, thumbnail);
  } catch {
    // ignore single-item failures
  }
}

function getColumnCount(width: number): number {
  if (width >= 1600) return 5;
  if (width >= 1200) return 4;
  if (width >= 768) return 3;
  return 2;
}

function distributeColumns(items: ShowcaseItem[], colCount: number): ShowcaseItem[][] {
  const cols: ShowcaseItem[][] = Array.from({ length: colCount }, () => []);
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

export default function Showcase() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ShowcaseItem[]>(initialItems);
  const [generating, setGenerating] = useState(false);
  const [columnCount, setColumnCount] = useState(() =>
    typeof window === 'undefined' ? 3 : getColumnCount(window.innerWidth),
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const generateBatchRef = useRef(0);
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
    void renderThumbnailBatch(
      initialItems,
      (id, thumbnail) => {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, thumbnail } : item)));
      },
      () => cancelled,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerateMore = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    const batch = generateBatchRef.current++;
    const newItems = buildRandomItems(RANDOM_BATCH_SIZE, 700001 + batch * 64000, `more-${batch}`);
    setItems((prev) => [...prev, ...newItems]);

    await renderThumbnailBatch(newItems, (id, thumbnail) => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, thumbnail } : item)));
    });
    generatingRef.current = false;
    setGenerating(false);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void handleGenerateMore();
        }
      },
      { rootMargin: '1400px 0px 1400px', threshold: 0.01 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleGenerateMore]);

  function openInEditor(item: ShowcaseItem) {
    navigate(`/app?doc=${encodeURIComponent(JSON.stringify(item.doc))}`);
  }

  const columns = useMemo(() => distributeColumns(items, columnCount), [items, columnCount]);

  return (
    <div className="min-h-dvh bg-bg flex flex-col overflow-y-auto">
      <SiteNav />
      <main className="showcase-main">
        <motion.header
          className="showcase-header"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="showcase-header__top">
            <p className="showcase-header__eyebrow">Showcase</p>
            <h1 className="showcase-header__title">Made in Artifact.</h1>
            <p className="showcase-header__deck">
              Covers, posters, texture studies, and seeded starters made from Artifact documents.
            </p>
          </div>
        </motion.header>

        <section className="showcase-library" aria-label="Made in Artifact project wall">
          <div className="showcase-mosaic">
            {columns.map((col, ci) => (
              <div key={ci} className="showcase-mosaic__col">
                {col.map((item) => (
                  <ShowcaseTile key={item.id} item={item} onOpen={() => openInEditor(item)} />
                ))}
              </div>
            ))}
          </div>
        </section>

        <div className="showcase-sentinel" ref={sentinelRef}>
          <ActionButton variant="primary" onClick={handleGenerateMore} disabled={generating}>
            {generating ? 'Rendering...' : 'Render more'}
          </ActionButton>
          {generating ? (
            <motion.span
              className="showcase-loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Rendering {RANDOM_BATCH_SIZE} more.
            </motion.span>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  );
}

interface ShowcaseTileProps {
  item: ShowcaseItem;
  onOpen: () => void;
}

function ShowcaseTile({ item, onOpen }: ShowcaseTileProps) {
  const [aw, ah] = ASPECT_SIZES[item.aspect];
  const aspectStyle = { aspectRatio: `${aw} / ${ah}` };

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`showcase-tile showcase-tile--${item.aspect.replace(':', 'x')}`}
      aria-label={`Open ${item.name} in editor`}
      onClick={onOpen}
    >
      <div className="showcase-tile__frame" style={aspectStyle}>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.name} className="showcase-tile__img" loading="lazy" />
        ) : (
          <div className="showcase-tile__loading" aria-hidden="true" />
        )}
        <div className="showcase-tile__overlay" aria-hidden="true">
          <span className="showcase-tile__seed">
            {item.aspect} / SEED #{item.doc.global.seed}
          </span>
          <span className="showcase-tile__name">{item.name}</span>
          <span className="showcase-tile__cta">Open in editor</span>
        </div>
      </div>
    </motion.button>
  );
}
