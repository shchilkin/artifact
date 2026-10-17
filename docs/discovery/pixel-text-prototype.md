# Pixel text prototype

Experiment for [#469](https://github.com/shchilkin/artifact/issues/469) (Text → Pixel art node) and
[#468](https://github.com/shchilkin/artifact/issues/468) (pixel art editor for lettering). Lives on
`experiment/pixel-text` only; not for `development`.

## Run

Start the web dev server and open `/dev/pixel-lettering-lab.html`, or open
`apps/web/public/dev/pixel-lettering-lab.html` directly in a browser. It is one self-contained page (plain JS, Google
Fonts from the CDN).

## What it covers

- Text is rasterised per line onto its own grid, anchored to the line's pen start and baseline. Rows per cap height
  sets the scale; letter spacing and line gap are in cells.
- Six algorithms run side by side: Center sample, Coverage threshold, Stroke / skeleton (Zhang–Suen thinning at
  sample resolution, thinned again at cell level, spur trimming, square dilation to the stroke width), Outline, Dither
  (Bayer 4×4 or Floyd–Steinberg over softened coverage), Rough block (seeded edge bites and bumps).
- Render pass: cell shape, cell gap, seeded chipped edges on exposed sides of square cells.
- Editor: pick a source algorithm, toggle/draw/erase cells, glyph outline overlay, Copy SVG. Edits are stored as
  overrides keyed by line index and cell coordinates relative to the line's baseline grid.
- Font files (TTF, OTF, WOFF, WOFF2) can be dropped anywhere on the page.

## Questions it should answer

- Stroke on serif and script fonts: how many spurs survive, and what trim length works (try Playfair Display,
  PT Serif, Lobster, Caveat).
- Whether hand edits can survive text changes. Currently they are pinned to cell positions, so changing rows or
  letter spacing moves the grid under them.

## Moving into the app

Grid functions (`rasterLine`, `thin`, `prune`, `dilate`, `erode`, the algorithm `run` functions, `paint`) are pure
over typed arrays and can move into a `features/pixel-text` module with unit tests. Rasterisation needs a 2D canvas
and the font loaded.
