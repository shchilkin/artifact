# Standalone Viber embed

This is a plain HTML/JavaScript host for a document-backed cover. It runs from a
production Vite build outside the Artifact workspace and installs the actual
runtime tarball. Neither the host nor the generated site imports editor source.

## Run with a local artwork

From the Artifact repository:

```sh
npm run prepare:runtime-embed -- /absolute/path/to/viber.artifact --outline-text
```

The command prints a new temporary output directory. It builds and packs the
runtime, runs a real `npm install` in that directory, copies these example files,
and creates a web derivative of the specified Composition there. It prepares the three-effect signal
recipe, its isolated effect variants and the retained five-track embed recipe,
updating their provenance hashes.
With `--outline-text`, the four Viber text layers become separate SVG path image
layers with their original IDs and graph connections. Their transforms are baked
into transparent 540px vector plates; opacity and blend mode stay on each layer.
The converter reuses the runtime text painter, calibrates the font's baseline in
Chrome, and exports paths using the existing build-only Skia dependency. It removes
font payloads and inventory from the web derivative. No original font file is
copied into `public/` or `dist/`. The source file remains editable and untouched.
The source and derivative hashes are both recorded in `evidence.json`.

This is an explicit square-cover export, not a general editor conversion command.
It requires embedded fonts at build time and fails if they cannot be resolved.
It does not support outlining text motion tracks: recipes must target the
derivative's layer kinds. Viber's effect/phone/emoji recipes need no such changes.
Browser font hinting is not preserved by SVG paths, so small stems can look
slightly thinner; compare the local before/after image before public use.

Omit `--outline-text` to retain the earlier embedded-font consumer proof.
An isolated Chrome page renders the derivative's 512px PNG poster.
Chrome must be installed; `ARTIFACT_BROWSER_CHANNEL` may select another
installed Playwright Chromium channel.

```sh
npm run verify:runtime-embed -- /absolute/output/directory
npm run verify:runtime-outlines -- /absolute/output/directory /absolute/path/to/viber.artifact
npm run verify:runtime-signal -- /absolute/output/directory /optional/previous/viber.png
npm run serve:runtime-embed -- /absolute/output/directory/dist 4184
```

Open `http://127.0.0.1:4184`. The static server binds only to loopback. The
output includes the `.tgz`, isolated dependency lockfile, built `dist/`,
`evidence.json`, and (after verification) browser screenshots and
`verification.json`.

The optional previous poster in the signal check must be from the same text mode;
that check requires pixel equality. Use `verify:runtime-outlines` for the
embedded-text versus outline comparison: it records per-layer bounds and alpha
coverage at 512, 540 and 1080px, with a two-pixel bounds / 3-of-255 mean-alpha
regression tolerance. It also blocks `FontFace` construction during outlined
rendering. This is not a claim of exact raster parity. Its comparison PNG places
the original on the left and the outlined derivative on the right.

Run the converter's five checks against the private fixture without committing it:

```sh
ARTIFACT_OUTLINE_FIXTURE=/absolute/path/to/viber.artifact npm run test:runtime-outlines
```

Without that environment variable the four data/error tests run and the local
font conformance check is explicitly skipped. Node with TypeScript stripping is
required by the build-only shared painter import (locally verified on Node 25).

The Composition and embedded font are local inputs, not committed examples or
package contents. Do not publish this generated directory until the owner has
confirmed rights for all included assets. Outlining removes the font-file delivery
dependency; it is not itself permission to publish artwork or font-derived shapes.
The package stays on
the unpublished `0.3.0-alpha.0` experiment; identify each local build by its
tarball SHA-256, not by version alone.

## Integrate in another site

1. Install the generated `.tgz` using npm in the host project.
2. Place the Composition, `.motion.json` and PNG poster at host-owned asset URLs.
3. Copy/adapt `embed.js` and the artwork markup/CSS. Call `mountArtwork` when
   the fullscreen preview opens; call the returned `destroy()` when it closes.
4. Keep the static image available through loading, errors and reduced motion.

```js
import { mountArtwork } from './embed.js';

const artwork = mountArtwork({
  container: document.querySelector('#artwork'),
  playButton: document.querySelector('#play'),
  neutralButton: document.querySelector('#neutral'),
  status: document.querySelector('#status'),
  compositionUrl: '/artworks/viber.artifact',
  recipeUrl: '/artworks/viber.motion.json',
});

// On closing the preview:
artwork.destroy();
```

The host owns loading, visibility, buttons, resize and reduced-motion policy.
The runtime owns font/image decoding, layer interpretation, motion evaluation
and rendering. `render.html`/`render.js` are local poster preparation tools and
need not be shipped as visitor-facing routes. The pixel comparison checks
poster-to-runtime continuity, not parity against a separately captured editor
export.

The default signal loop animates only three background effects: Noise Warp
field flow, stepped Grain evolution and two Glitch events. Phone placement,
emoji placement, text and the advisory label stay fixed. The motion selector
also offers each effect separately and the previous phone/emoji/grain/glitch
variant. Switching destroys the previous session and starts the selected recipe
at its neutral frame. This example provides time-based animation with play/pause,
not pointer-driven layer input. Control semantics and scope are documented in
`docs/experiments/effect-phase-v1.md` in the source repository.
