# @shchilkin/artifact-runtime

Experimental browser runtime for portable `.artifact` compositions. The
`mixed-media-2d@1` profile supports a bounded set of 2D layers and linear graphs;
unsupported compositions fail with a capability report.

```ts
import { createMixedMediaArtwork } from '@shchilkin/artifact-runtime';

const session = await createMixedMediaArtwork({
  canvas,
  composition, // parsed portable .artifact package
  motionRecipe, // parsed artwork-owned .motion.json
  profile: 'mixed-media-2d@1',
  maxRenderSize: 512,
});
// Creation resolves only after a complete neutral frame has been committed.
session.start();
session.pause();
await session.seek(0);
await session.resize(512, 512);
session.destroy();
```

Text layers using `artifact-font://ID` automatically resolve matching embedded
`document.fontAssets` with base64 font data URLs. Metadata-only entries remain
unresolved. Each session loads its own FontFace names and deletes only its own
faces on cleanup; explicit host `fontFamilies` mappings override embedded data.
Invalid font bytes reject initialization before replacing the host canvas.
Capability analysis checks payload availability; successful browser decoding
is established during session preparation.

The package does not fetch composition URLs, implement DOM interactions, or
choose autoplay/reduced-motion policies. Hosts should dynamically import it
when artwork opens, retain a static poster while loading, avoid initialization
under reduced motion and destroy the session when closing. Embedded assets are
supplied by the host and are not included in the runtime package.

An end-to-end host example and real packed-browser verification live in
`examples/viber-embed` in the source repository. The older
`createArtifactRuntimePlayer` raster prototype remains available for existing
consumers. Do not treat the two factories as interchangeable.
