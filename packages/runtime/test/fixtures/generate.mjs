// Generates the three 540px harness fixtures (issue #331). Run from the repository root:
//
//   node packages/runtime/test/fixtures/generate.mjs
//
// Every shape comes from a seeded generator, so the photo-like and graphic fixtures are the same on every run. The
// text fixture uses a system sans-serif font, so a regenerated file can differ between machines; the committed
// files are the source of truth, and nothing reads this script at test time.
import { writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';

const SIZE = 540;
const here = new URL('.', import.meta.url);

/** Mulberry32: small, seeded, and stable across Node versions. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Continuous tones: sky, sun, soft hills, blurred light blobs, and sensor-like grain. */
function photo() {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const rand = random(330);

  const sky = ctx.createLinearGradient(0, 0, 0, SIZE);
  sky.addColorStop(0, '#2b3f73');
  sky.addColorStop(0.45, '#d9826b');
  sky.addColorStop(0.62, '#f2c58e');
  sky.addColorStop(1, '#3a2a2e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const sun = ctx.createRadialGradient(370, 250, 4, 370, 250, 150);
  sun.addColorStop(0, 'rgba(255, 244, 214, 1)');
  sun.addColorStop(0.18, 'rgba(255, 220, 160, 0.9)');
  sun.addColorStop(1, 'rgba(255, 180, 120, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.filter = 'blur(18px)';
  for (let index = 0; index < 14; index += 1) {
    ctx.fillStyle = `rgba(${150 + rand() * 100}, ${90 + rand() * 90}, ${120 + rand() * 120}, ${0.15 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.arc(rand() * SIZE, rand() * SIZE * 0.6, 20 + rand() * 60, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = 'none';

  const hills = [
    { base: 330, amp: 40, color: ['#5b4a5e', '#2f2a3a'] },
    { base: 390, amp: 30, color: ['#3c3a46', '#1f1c26'] },
    { base: 450, amp: 24, color: ['#262431', '#121019'] },
  ];
  for (const hill of hills) {
    const phase = rand() * Math.PI * 2;
    const gradient = ctx.createLinearGradient(0, hill.base - hill.amp, 0, SIZE);
    gradient.addColorStop(0, hill.color[0]);
    gradient.addColorStop(1, hill.color[1]);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, SIZE);
    for (let x = 0; x <= SIZE; x += 6) {
      const y = hill.base + Math.sin(x / 70 + phase) * hill.amp + Math.sin(x / 23 + phase * 2) * hill.amp * 0.25;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(SIZE, SIZE);
    ctx.closePath();
    ctx.fill();
  }

  const image = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let index = 0; index < image.data.length; index += 4) {
    const grain = (rand() - 0.5) * 14;
    image.data[index] += grain;
    image.data[index + 1] += grain;
    image.data[index + 2] += grain;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toBuffer('image/webp', 82);
}

/** Flat colour, hard edges: bands, discs, triangles, and a checker block. */
function graphic() {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f1e9d8';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const colors = ['#e2401c', '#1d3fbf', '#f2b705', '#111111', '#0f8a5f'];
  for (let index = 0; index < 9; index += 1) {
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(0, 40 + index * 22, SIZE * 0.55, 11);
  }
  ctx.fillStyle = '#1d3fbf';
  ctx.beginPath();
  ctx.arc(395, 150, 105, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2b705';
  ctx.beginPath();
  ctx.arc(395, 150, 52, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e2401c';
  ctx.beginPath();
  ctx.moveTo(40, 500);
  ctx.lineTo(200, 280);
  ctx.lineTo(300, 500);
  ctx.closePath();
  ctx.fill();

  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#111111' : '#f1e9d8';
      ctx.fillRect(320 + x * 30, 310 + y * 30, 30, 30);
    }
  }
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, SIZE - 28, SIZE - 28);
  return canvas.toBuffer('image/png');
}

/** A text-heavy cover: a large title, a subtitle, and a block of small credits. */
function text() {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#16141c';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#e8e2d0';
  ctx.textBaseline = 'top';

  ctx.font = 'bold 112px sans-serif';
  ctx.fillText('NIGHT', 30, 34);
  ctx.fillText('SIGNAL', 30, 140);
  ctx.fillStyle = '#ff5a36';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('LIVE AT THE EMPTY HALL', 34, 262);

  ctx.fillStyle = '#b9b3a3';
  ctx.font = '15px sans-serif';
  const credits = [
    'A1  Low Tide Static          04:12',
    'A2  Glass Corridor           05:47',
    'A3  Paper Moons              03:58',
    'B1  The Long Exposure        06:20',
    'B2  Sodium Lights            04:33',
    'B3  Last Train North         07:05',
    'Recorded in one take. Mixed on tape.',
    'Cover type set in the house sans.',
  ];
  credits.forEach((line, index) => {
    ctx.fillText(line, 34, 318 + index * 24);
  });
  ctx.fillStyle = '#e8e2d0';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('SIDE A / SIDE B — 33 RPM — CAT. NS-0331', 34, 510);
  return canvas.toBuffer('image/png');
}

writeFileSync(new URL('photo.webp', here), photo());
writeFileSync(new URL('graphic.png', here), graphic());
writeFileSync(new URL('text.png', here), text());
