import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { MetaFunction } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { SiteNav } from "../components/SiteNav";
import { Footer } from "../components/Footer";
import { generateThumbnail } from "../utils/generateThumbnail";
import type { GeneratorConfig } from "../types/config";
import { DEFAULT_CONFIG } from "../types/config";
import { generateRandomHeroFrame } from "../utils/heroConfigs";

export const meta: MetaFunction = () => [
  { title: "Examples — Album Cover Generator" },
  {
    name: "description",
    content:
      "Browse glitch album covers made with the generator. Tap any to open and remix it.",
  },
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
const exampleModules = import.meta.glob("../examples/*.json", {
  eager: true,
}) as Record<string, { default: ExampleData }>;

const rawExamples: Array<ExampleData & { id: string }> = Object.entries(
  exampleModules,
).map(([path, mod]) => {
  const data = mod.default ?? mod;
  const id = path.replace("../examples/", "").replace(".json", "");
  return { ...data, id };
});

// Pre-generate 24 random examples at module level so seeds are stable across re-renders
const randomExamples: Array<ExampleData & { id: string }> = Array.from({
  length: 24,
}, (_, i) => {
  const seed = 300001 + i * 13337;
  const frame = generateRandomHeroFrame(seed);
  return {
    id: `random-${seed}`,
    name: `Variant #${seed}`,
    seed: frame.seed,
    cfg: frame.cfg,
  };
});

const allInitialExamples = [...rawExamples, ...randomExamples];

export default function Examples() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ExampleItem[]>(
    allInitialExamples.map((ex) => ({ ...ex, thumbnail: null })),
  );
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [isTouch] = useState(
    () => window.matchMedia("(pointer: coarse)").matches,
  );
  const [generating, setGenerating] = useState(false);
  const generateBatchRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const generatingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function renderAll() {
      for (const ex of allInitialExamples) {
        if (cancelled) break;
        try {
          const cfg = { ...DEFAULT_CONFIG, ...ex.cfg } as GeneratorConfig;
          const thumb = await generateThumbnail(cfg, ex.seed);
          if (!cancelled) {
            setItems((prev) =>
              prev.map((item) =>
                item.id === ex.id ? { ...item, thumbnail: thumb } : item
              )
            );
          }
        } catch {
          // leave thumbnail null
        }
      }
    }
    renderAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerateMore = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    const batch = generateBatchRef.current;
    generateBatchRef.current += 1;

    // Build all new items first
    const newItems: ExampleItem[] = Array.from({ length: 32 }, (_, i) => {
      const seed = 700001 + batch * 32000 + i * 997;
      const frame = generateRandomHeroFrame(seed);
      return {
        id: `more-${seed}`,
        name: `Variant #${frame.seed}`,
        seed: frame.seed,
        cfg: frame.cfg,
        thumbnail: null,
      };
    });

    // Append all at once — no interleaving with thumbnail updates
    setItems((prev) => [...prev, ...newItems]);

    // Render thumbnails one by one, updating in place
    for (const item of newItems) {
      try {
        const cfg = { ...DEFAULT_CONFIG, ...item.cfg } as GeneratorConfig;
        const thumb = await generateThumbnail(cfg, item.seed);
        setItems((prev) =>
          prev.map((x) => x.id === item.id ? { ...x, thumbnail: thumb } : x)
        );
      } catch {
        // leave null
      }
    }
    generatingRef.current = false;
    setGenerating(false);
  }, []);

  // Auto-load when sentinel scrolls into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !generatingRef.current) {
          handleGenerateMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleGenerateMore]);

  function openInGenerator(ex: ExampleItem) {
    navigate(
      `/app?seed=${ex.seed}&cfg=${encodeURIComponent(JSON.stringify(ex.cfg))}`,
    );
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-dvh bg-bg flex flex-col overflow-y-auto">
      <SiteNav />
      <main className="flex-1 pt-22 pb-12 px-4 max-w-350 w-full mx-auto">
        <motion.header
          className="mb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="font-display font-black text-[clamp(2rem,6vw,4rem)] leading-none uppercase text-text mb-2">
            Examples
          </h1>
          <p className="font-mono text-[0.75rem] text-dim tracking-[0.03em]">
            Tap any cover to open it in the generator.
          </p>
        </motion.header>
        {items.length === 0
          ? (
            <p className="font-mono text-[0.8rem] text-dim py-12">
              Nothing here yet.
            </p>
          )
          : (
            <div className="examples-grid">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.92, y: 16 }}
                    whileInView={{ opacity: 1, scale: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    exit={{
                      opacity: 0,
                      scale: 0.88,
                      transition: { duration: 0.2 },
                    }}
                    whileHover={{
                      scale: 1.025,
                      transition: { duration: 0.18 },
                    }}
                    className={`examples-item${
                      revealed.has(item.id) ? " examples-item--revealed" : ""
                    }`}
                    onClick={() => {
                      if (isTouch || revealed.has(item.id)) {
                        openInGenerator(item);
                      } else {
                        toggleReveal(item.id);
                      }
                    }}
                    onMouseEnter={() => {
                      if (!isTouch) {setRevealed((prev) =>
                          new Set(prev).add(item.id)
                        );}
                    }}
                    onMouseLeave={() => {
                      if (!isTouch) {
                        setRevealed((prev) => {
                          const n = new Set(prev);
                          n.delete(item.id);
                          return n;
                        });
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${item.name} — Open in generator`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (isTouch || revealed.has(item.id)) {
                          openInGenerator(item);
                        } else {
                          toggleReveal(item.id);
                        }
                      }
                    }}
                  >
                    {item.thumbnail
                      ? (
                        <motion.img
                          src={item.thumbnail}
                          alt={item.name}
                          className="examples-item__img"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.35 }}
                        />
                      )
                      : (
                        <div
                          className="examples-item__loading"
                          aria-hidden="true"
                        />
                      )}
                    <div className="examples-item__overlay">
                      <span className="examples-item__seed">#{item.seed}</span>
                      <span className="examples-item__name">{item.name}</span>
                      <span className="examples-item__cta">
                        Open in generator →
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        <div
          ref={sentinelRef}
          className="flex justify-center pt-10 pb-6 min-h-16"
        >
          {generating && (
            <motion.span
              className="font-mono text-[0.75rem] text-dim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Generating…
            </motion.span>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
