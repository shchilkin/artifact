# Cold image command fixture

`cold-image.jpg` is synthetic test data, created locally from a deterministic
64 × 64 RGB grid. It contains no user or stock media. The JPEG parser tests use
this small, decodable baseline and add valid JPEG comment segments in memory to
exercise the cold (>1 MiB) command envelope without checking a large binary
into the repository.

To regenerate it on macOS, run this from the repository root:

```sh
python3 - <<'PY'
from pathlib import Path

path = Path('/private/tmp/artifact-cold-image-grid.ppm')
with path.open('wb') as image:
    image.write(b'P6\n64 64\n255\n')
    for y in range(64):
        for x in range(64):
            image.write(bytes(((x * 7 + y * 3) & 255,
                               (x * 5 + y * 11) & 255,
                               (x * 13 + y * 17) & 255)))
PY
sips -s format jpeg /private/tmp/artifact-cold-image-grid.ppm \
  --out crates/artifact-core/tests/fixtures/cold-image.jpg
```

The encoded JPEG bytes can vary with the platform encoder; the fixed RGB grid,
dimensions, and decodability are the test contract.
