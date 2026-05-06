import { Link } from "react-router";
import type { MetaFunction } from "react-router";
import { motion } from "framer-motion";
import { HeroCover } from "../components/HeroCover";
import { SiteNav } from "../components/SiteNav";
import { Footer } from "../components/Footer";

export const meta: MetaFunction = () => [
  { title: "Album Cover Generator" },
  {
    name: "description",
    content:
      "Make strange, deliberate glitch covers in your browser. 16 effects, seeded, no account needed.",
  },
];

const EASE = [0.16, 1, 0.3, 1] as const;

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: EASE, delay },
});

export default function Home() {
  return (
    <div className="flex flex-col min-h-dvh bg-bg overflow-x-hidden overflow-y-auto">
      <SiteNav />
      <div className="landing-grain" aria-hidden="true" />
      <main className="flex-1 flex flex-col justify-center pt-16 pb-10 md:pt-22 md:pb-12 px-[clamp(16px,5vw,72px)]">
        <section className="flex flex-col items-center gap-6 w-full md:flex-row md:items-center md:gap-12">
          <div className="flex flex-col items-center gap-5 flex-1 min-w-0 md:items-start">
            <h1 className="landing-headline text-center md:text-left">
              Make something{" "}
              <span className="landing-headline__weird">weird.</span>
            </h1>
            <motion.p
              {...rise(0.1)}
              className="landing-deck text-center md:text-left"
            >
              A browser-based cover generator for the deliberately strange.
            </motion.p>
            <motion.div
              {...rise(0.18)}
              className="w-12 h-0.5 bg-accent shrink-0"
              aria-hidden="true"
            />
            <motion.ul
              {...rise(0.26)}
              className="list-none flex flex-col gap-1.5 p-0 m-0 landing-features self-start"
              aria-label="How it works"
            >
              <li>Create covers from seeds — every number is unique</li>
              <li>Apply 16 GPU effects: glitch, riso, void, scatter</li>
              <li>Export at 3000×3000, streaming-platform ready</li>
              <li>No account. No install.</li>
            </motion.ul>
            <motion.div {...rise(0.34)}>
              <Link
                to="/app"
                className="btn btn-primary text-[0.85rem] px-8 no-underline min-h-[44px] tracking-[0.06em] landing-cta"
              >
                Open Generator →
              </Link>
            </motion.div>
          </div>
          <motion.div
            className="-order-1 w-full flex justify-center md:order-1 md:w-auto md:shrink-0 md:ml-auto"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
          >
            <HeroCover />
          </motion.div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
