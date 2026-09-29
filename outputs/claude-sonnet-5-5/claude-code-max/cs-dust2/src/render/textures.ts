// Procedural textures drawn on 2D canvases (no image assets). Every texture is deterministic (seeded) and tileable.
import * as THREE from 'three';
import { Rng } from '../core/math';

type Ctx = CanvasRenderingContext2D;

const makeCanvas = (size: number): { canvas: HTMLCanvasElement; ctx: Ctx } => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return { canvas, ctx };
};

const toTexture = (canvas: HTMLCanvasElement, repeat = true): THREE.CanvasTexture => {
  const tex = new THREE.CanvasTexture(canvas);
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
};

const speckle = (ctx: Ctx, size: number, rng: Rng, count: number, colors: string[], maxR: number): void => {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[rng.int(colors.length)];
    const r = 0.5 + rng.next() * maxR;
    const x = rng.next() * size;
    const y = rng.next() * size;
    // Draw wrapped copies so the texture tiles without seams.
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
        ctx.fillRect(x + ox, y + oy, r, r);
      }
    }
  }
};

/** Warm packed sand with darker patches and pebbles. */
export const makeSandTexture = (): THREE.CanvasTexture => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rng = new Rng(11);
  ctx.fillStyle = '#c9ae7c';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, rng, 260, ['#b99a68', '#d8bf8f', '#c2a473'], 22);
  speckle(ctx, size, rng, 2200, ['#a98b5c', '#d9c495', '#bfa070', '#8f7649'], 2.6);
  return toTexture(canvas);
};

/** Cream plaster wall with mud-brick courses, like the Dust2 walls. */
export const makeWallTexture = (): THREE.CanvasTexture => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rng = new Rng(23);
  ctx.fillStyle = '#d9c497';
  ctx.fillRect(0, 0, size, size);
  const rows = 8;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const bricks = 4;
    const bw = size / bricks;
    const offset = r % 2 === 0 ? 0 : bw / 2;
    for (let b = -1; b <= bricks; b++) {
      const x = b * bw + offset;
      const shade = rng.range(-14, 14);
      ctx.fillStyle = `rgb(${217 + shade},${196 + shade},${151 + shade})`;
      ctx.fillRect(x + 1.5, r * rowH + 1.5, bw - 3, rowH - 3);
    }
  }
  ctx.strokeStyle = 'rgba(110,88,55,0.55)';
  ctx.lineWidth = 2;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * rowH);
    ctx.lineTo(size, r * rowH);
    ctx.stroke();
  }
  speckle(ctx, size, rng, 900, ['rgba(120,95,60,0.18)', 'rgba(255,240,200,0.14)'], 3);
  return toTexture(canvas);
};

/** Cool grey-beige stone tiles (bombsites, doorways). */
export const makeStoneTexture = (): THREE.CanvasTexture => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rng = new Rng(37);
  ctx.fillStyle = '#b3a892';
  ctx.fillRect(0, 0, size, size);
  const n = 4;
  const s = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = rng.range(-10, 10);
      ctx.fillStyle = `rgb(${179 + v},${168 + v},${146 + v})`;
      ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
    }
  }
  ctx.strokeStyle = 'rgba(70,62,50,0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, size);
    ctx.moveTo(0, i * s);
    ctx.lineTo(size, i * s);
    ctx.stroke();
  }
  speckle(ctx, size, rng, 1400, ['rgba(60,55,45,0.16)', 'rgba(230,220,200,0.14)'], 2.5);
  return toTexture(canvas);
};

/** Dark stone for tunnel ceilings. */
export const makeRoofTexture = (): THREE.CanvasTexture => {
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  const rng = new Rng(41);
  ctx.fillStyle = '#6f6759';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, rng, 700, ['#5d564a', '#7f7666', '#4f493f'], 4);
  return toTexture(canvas);
};

/** Wooden planks (floor version: horizontal boards). */
export const makeWoodTexture = (): THREE.CanvasTexture => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rng = new Rng(53);
  const boards = 6;
  const bh = size / boards;
  for (let i = 0; i < boards; i++) {
    const v = rng.range(-16, 16);
    ctx.fillStyle = `rgb(${150 + v},${106 + v},${62 + v})`;
    ctx.fillRect(0, i * bh, size, bh);
    ctx.strokeStyle = 'rgba(70,44,22,0.5)';
    for (let g = 0; g < 9; g++) {
      const y = i * bh + rng.next() * bh;
      ctx.lineWidth = 0.6 + rng.next();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + rng.range(-2, 2), size * 0.6, y + rng.range(-2, 2), size, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(50,30,14,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, i * bh);
    ctx.lineTo(size, i * bh);
    ctx.stroke();
  }
  return toTexture(canvas);
};

/** A single wooden crate face: frame + planks + diagonal brace (not tiled). */
export const makeCrateTexture = (): THREE.CanvasTexture => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rng = new Rng(67);
  ctx.fillStyle = '#a5773f';
  ctx.fillRect(0, 0, size, size);
  const planks = 5;
  const ph = size / planks;
  for (let i = 0; i < planks; i++) {
    const v = rng.range(-12, 12);
    ctx.fillStyle = `rgb(${165 + v},${119 + v},${63 + v})`;
    ctx.fillRect(10, i * ph + 2, size - 20, ph - 4);
    ctx.strokeStyle = 'rgba(80,52,24,0.45)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      const y = i * ph + 6 + rng.next() * (ph - 12);
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(size - 12, y + rng.range(-2, 2));
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#7d5529';
  ctx.fillRect(0, 0, size, 14);
  ctx.fillRect(0, size - 14, size, 14);
  ctx.fillRect(0, 0, 14, size);
  ctx.fillRect(size - 14, 0, 14, size);
  ctx.strokeStyle = '#6b4520';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.lineTo(size - 14, size - 14);
  ctx.stroke();
  ctx.fillStyle = '#3d3a37';
  for (const [x, y] of [[7, 7], [size - 7, 7], [7, size - 7], [size - 7, size - 7]]) ctx.fillRect(x - 2, y - 2, 4, 4);
  return toTexture(canvas, true);
};

/** Ribbed shipping-container metal (blue-green), tiled vertically. */
export const makeContainerTexture = (): THREE.CanvasTexture => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rng = new Rng(79);
  ctx.fillStyle = '#3f6f86';
  ctx.fillRect(0, 0, size, size);
  const ribs = 16;
  const rw = size / ribs;
  for (let i = 0; i < ribs; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#4a7d95' : '#37647a';
    ctx.fillRect(i * rw, 0, rw, size);
  }
  speckle(ctx, size, rng, 500, ['rgba(20,40,50,0.22)', 'rgba(170,110,60,0.25)', 'rgba(200,230,240,0.12)'], 4);
  ctx.fillStyle = 'rgba(190,120,60,0.35)';
  for (let i = 0; i < 6; i++) ctx.fillRect(rng.next() * size, rng.next() * size, 3 + rng.next() * 10, 1 + rng.next() * 3);
  return toTexture(canvas);
};

/** Painted wooden door leaf. */
export const makeDoorTexture = (): THREE.CanvasTexture => {
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  const rng = new Rng(91);
  ctx.fillStyle = '#5b7b6a';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#4b6858';
  for (let i = 0; i < 4; i++) ctx.fillRect(i * (size / 4) + 2, 0, 3, size);
  ctx.strokeStyle = '#33473c';
  ctx.lineWidth = 5;
  ctx.strokeRect(10, 10, size - 20, size - 20);
  speckle(ctx, size, rng, 250, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.12)'], 3);
  return toTexture(canvas);
};

/** Big letter decal for the bombsites. */
export const makeSiteLabelTexture = (letter: string): THREE.CanvasTexture => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(200,40,30,0.9)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,40,30,0.85)';
  ctx.font = 'bold 170px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, size / 2, size / 2 + 8);
  return toTexture(canvas, false);
};

/** Soft radial glow (muzzle flash, explosion, bomb LED). */
export const makeGlowTexture = (inner = 'rgba(255,240,190,1)', outer = 'rgba(255,150,40,0)'): THREE.CanvasTexture => {
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, 'rgba(255,200,90,0.75)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas, false);
};

/** Bullet hole decal. */
export const makeBulletHoleTexture = (): THREE.CanvasTexture => {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(10,8,6,0.95)');
  g.addColorStop(0.35, 'rgba(20,16,12,0.7)');
  g.addColorStop(1, 'rgba(20,16,12,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas, false);
};
