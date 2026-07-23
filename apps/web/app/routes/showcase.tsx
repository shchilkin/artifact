import { ProgressIndicator, Skeleton } from '@artifact/ui';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, type MetaFunction } from 'react-router';
import { PublicPageLayout } from '../components/PublicPageLayout';
import { ProductPageHeader } from '../components/product-surfaces/ProductPageHeader';
import { ActionButton } from '../components/ui/ActionButton';
import { EmptyState } from '../components/ui/EmptyState';
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
  thumbnailError?: boolean;
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
  onError: (id: string) => void,
  isCancelled: () => boolean = () => false,
) {
  let cursor = 0;
  const nextItem = () => {
    const item = batch[cursor];
    cursor += 1;
    return item;
  };
  const workers = Array.from({ length: thumbnailWorkerCount(batch) }, () =>
    renderThumbnailWorker(nextItem, onThumbnail, onError, isCancelled),
  );
  await Promise.all(workers);
}

function thumbnailWorkerCount(batch: ShowcaseItem[]) {
  return Math.min(THUMBNAIL_RENDER_CONCURRENCY, batch.length);
}

async function renderThumbnailWorker(
  nextItem: () => ShowcaseItem | undefined,
  onThumbnail: (id: string, thumbnail: string) => void,
  onError: (id: string) => void,
  isCancelled: () => boolean,
) {
  while (!isCancelled()) {
    const item = nextItem();
    if (!item) return;
    await renderThumbnailItem(item, onThumbnail, onError, isCancelled);
  }
}

async function renderThumbnailItem(
  item: ShowcaseItem,
  onThumbnail: (id: string, thumbnail: string) => void,
  onError: (id: string) => void,
  isCancelled: () => boolean,
) {
  try {
    const thumbnail = await renderShowcaseThumbnail(item);
    if (!isCancelled()) onThumbnail(item.id, thumbnail);
  } catch {
    if (!isCancelled()) onError(item.id);
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
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, thumbnail, thumbnailError: false } : item)));
      },
      (id) => setItems((prev) => prev.map((item) => (item.id === id ? { ...item, thumbnailError: true } : item))),
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

    await renderThumbnailBatch(
      newItems,
      (id, thumbnail) => {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, thumbnail, thumbnailError: false } : item)));
      },
      (id) => setItems((prev) => prev.map((item) => (item.id === id ? { ...item, thumbnailError: true } : item))),
    );
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

  const columns = useMemo(() => distributeColumns(items, columnCount), [items, columnCount]);

  return (
    <PublicPageLayout className="showcase-route" navSolid={false}>
      <main className="showcase-main">
        <ProductPageHeader
          eyebrow="Showcase"
          title="Made in Artifact."
          deck="Covers, posters, texture studies, and seeded starters made from Artifact documents."
          meta={<span>{items.length} editable starts</span>}
        />

        <section className="showcase-library" aria-label="Made in Artifact project wall" aria-busy={generating}>
          {items.length > 0 ? (
            <div className="showcase-mosaic">
              {columns.map((col, ci) => (
                <div key={ci} className="showcase-mosaic__col">
                  {col.map((item) => (
                    <ShowcaseTile
                      key={item.id}
                      item={item}
                      href={`/app?doc=${encodeURIComponent(JSON.stringify(item.doc))}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              eyebrow="Showcase"
              title="No artwork is available."
              body="Open a blank canvas and make the first editable piece."
              actions={
                <Link to="/app?new=blank" className="showcase-empty-link">
                  Open editor
                </Link>
              }
            />
          )}
        </section>

        <div className="showcase-sentinel" ref={sentinelRef}>
          <ActionButton variant="primary" onClick={handleGenerateMore} loading={generating}>
            {generating ? 'Rendering...' : 'Render more'}
          </ActionButton>
          {generating ? (
            <div className="showcase-loading">
              <span>Rendering {RANDOM_BATCH_SIZE} more.</span>
              <ProgressIndicator label="Rendering more showcase previews" />
            </div>
          ) : null}
        </div>
      </main>
    </PublicPageLayout>
  );
}

interface ShowcaseTileProps {
  item: ShowcaseItem;
  href: string;
}

function ShowcaseTile({ item, href }: ShowcaseTileProps) {
  const [aw, ah] = ASPECT_SIZES[item.aspect];
  const aspectStyle = { aspectRatio: `${aw} / ${ah}` };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`showcase-tile-wrap showcase-tile--${item.aspect.replace(':', 'x')}`}
    >
      <Link
        className="showcase-tile"
        to={href}
        aria-label={`Open ${item.name} in editor${item.thumbnailError ? '; preview unavailable' : ''}`}
      >
        <div className="showcase-tile__frame" style={aspectStyle}>
          {item.thumbnail ? (
            <img src={item.thumbnail} alt={item.name} className="showcase-tile__img" loading="lazy" />
          ) : item.thumbnailError ? (
            <span className="showcase-tile__error">Preview unavailable.</span>
          ) : (
            <Skeleton className="showcase-tile__loading" shape="block" />
          )}
          <div className="showcase-tile__overlay" aria-hidden="true">
            <span className="showcase-tile__seed">
              {item.aspect} / SEED #{item.doc.global.seed}
            </span>
            <span className="showcase-tile__name">{item.name}</span>
            <span className="showcase-tile__cta">Open in editor</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
