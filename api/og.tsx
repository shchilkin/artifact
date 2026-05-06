/**
 * Vercel Edge Function — serves the Open Graph image for artifact.shchilkin.dev.
 *
 * Renders a 1200×630 PNG with:
 *   - A 4×2 grid of colour-gradient cells evoking album covers
 *   - A gradient scrim over the bottom-left quadrant
 *   - The "artifact" wordmark + tagline overlaid bottom-left
 *
 * No WebGL, no Playwright, no committed binary.
 * URL: https://artifact.shchilkin.dev/api/og
 */
import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

const W = 1200;
const H = 630;
const COLS = 4;
const ROWS = 2;
const GAP = 4;
const CELL_W = Math.floor((W - GAP * (COLS - 1)) / COLS); // 297
const CELL_H = Math.floor((H - GAP * (ROWS - 1)) / ROWS); // 313

/** Dark-base + accent-highlight gradient pairs for each cover cell. */
const CELLS: [string, string][] = [
    ["#1a0a2e", "#7c3aed"],
    ["#0a1628", "#2563eb"],
    ["#0d1a0a", "#16a34a"],
    ["#1a0d0a", "#dc2626"],
    ["#1a160a", "#d97706"],
    ["#0a1a1a", "#0891b2"],
    ["#1a0a1a", "#db2777"],
    ["#111111", "#525252"],
];

let fontPromise: Promise<ArrayBuffer | null> | null = null;

async function loadFont(): Promise<ArrayBuffer | null> {
    try {
        // Ask Google Fonts for the Barlow Condensed Black CSS, then extract the woff2 URL.
        const css = await fetch(
            "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@900&display=swap",
            { headers: { "User-Agent": "Mozilla/5.0 (compatible)" } },
        ).then((r) => r.text());
        const match = css.match(
            /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/,
        );
        if (!match) return null;
        return fetch(match[1]).then((r) => r.arrayBuffer());
    } catch {
        return null;
    }
}

function CoverRow({ cells }: { cells: [string, string][] }) {
    return (
        <div style={{ display: "flex", gap: GAP }}>
            {cells.map(([from, to], i) => (
                <div
                    key={i}
                    style={{
                        width: CELL_W,
                        height: CELL_H,
                        background:
                            `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
                        display: "flex",
                    }}
                />
            ))}
        </div>
    );
}

export default async function handler(): Promise<Response> {
    fontPromise ??= loadFont();
    const fontData = await fontPromise;
    const fonts = fontData
        ? [
            {
                name: "Barlow Condensed",
                data: fontData,
                weight: 900 as const,
                style: "normal" as const,
            },
        ]
        : [];

    return new ImageResponse(
        (
            <div
                style={{
                    width: W,
                    height: H,
                    background: "#080808",
                    display: "flex",
                    flexDirection: "column",
                    gap: GAP,
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                {/* 4×2 colour-gradient cover grid */}
                <CoverRow cells={CELLS.slice(0, 4)} />
                <CoverRow cells={CELLS.slice(4)} />

                {/* Gradient scrim — bottom-left → transparent top-right */}
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background:
                            "linear-gradient(to top right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.1) 70%)",
                        display: "flex",
                    }}
                />

                {/* Wordmark — bottom-left */}
                <div
                    style={{
                        position: "absolute",
                        bottom: 52,
                        left: 56,
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <div
                        style={{
                            fontSize: 36,
                            color: "rgba(255,255,255,0.65)",
                            display: "flex",
                            marginBottom: 8,
                        }}
                    >
                        ✦
                    </div>
                    <div
                        style={{
                            fontSize: 110,
                            fontWeight: 900,
                            color: "#ffffff",
                            letterSpacing: "-3px",
                            lineHeight: 1,
                            fontFamily: "Barlow Condensed, sans-serif",
                            display: "flex",
                        }}
                    >
                        artifact
                    </div>
                    <div
                        style={{
                            fontSize: 38,
                            color: "rgba(255,255,255,0.6)",
                            marginTop: 4,
                            display: "flex",
                        }}
                    >
                        Create Album Covers
                    </div>
                    <div
                        style={{
                            fontSize: 22,
                            color: "rgba(255,255,255,0.28)",
                            marginTop: 6,
                            display: "flex",
                        }}
                    >
                        artifact.shchilkin.dev
                    </div>
                </div>
            </div>
        ),
        { width: W, height: H, fonts },
    );
}
