import * as THREE from 'three';
import { Rng } from '../core/math.ts';

/**
 * Procedural textures drawn onto 2D canvases (no image files). They are mostly grey-scale
 * detail; the hue comes from the per-vertex colours so one texture serves many palettes.
 */

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  return { c, g };
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(g: CanvasRenderingContext2D, rng: Rng, size: number, count: number, minA: number, maxA: number, light: boolean): void {
  for (let i = 0; i < count; i++) {
    const a = rng.range(minA, maxA);
    g.fillStyle = light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    const s = rng.range(1, 3);
    g.fillRect(rng.next() * size, rng.next() * size, s, s);
  }
}

/** Sandy ground: fine grain plus a few soft blotches. Tile = 4 m. */
export function floorTexture(): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = makeCanvas(S, S);
  const rng = new Rng(11);
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = rng.next() * S;
    const y = rng.next() * S;
    const r = rng.range(10, 40);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng.chance(0.5);
    grd.addColorStop(0, dark ? 'rgba(90,80,60,0.16)' : 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  speckle(g, rng, S, 1800, 0.05, 0.2, false);
  speckle(g, rng, S, 900, 0.05, 0.18, true);
  // faint paving joints so scale is readable
  g.strokeStyle = 'rgba(0,0,0,0.07)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, S - 1, S - 1);
  g.beginPath();
  g.moveTo(S / 2, 0);
  g.lineTo(S / 2, S);
  g.moveTo(0, S / 2);
  g.lineTo(S, S / 2);
  g.stroke();
  return toTexture(c);
}

/** Plaster wall with brick courses, cracks and stains. Tile = 4 m. */
export function wallTexture(): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = makeCanvas(S, S);
  const rng = new Rng(23);
  g.fillStyle = '#dcdcdc';
  g.fillRect(0, 0, S, S);
  // stains
  for (let i = 0; i < 26; i++) {
    const x = rng.next() * S;
    const y = rng.next() * S;
    const w = rng.range(12, 60);
    const h = rng.range(20, 90);
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, 'rgba(60,45,25,0.13)');
    grd.addColorStop(1, 'rgba(60,45,25,0)');
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
  }
  // brick courses (0.25 m high, 0.5 m long at 4 m per tile)
  const rows = 16;
  const rh = S / rows;
  g.strokeStyle = 'rgba(0,0,0,0.13)';
  g.lineWidth = 1;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(S, y + 0.5);
    g.stroke();
    const off = r % 2 === 0 ? 0 : S / 16;
    for (let x = off; x < S; x += S / 8) {
      g.beginPath();
      g.moveTo(x + 0.5, y);
      g.lineTo(x + 0.5, y + rh);
      g.stroke();
    }
  }
  // individual brick tone variation
  for (let r = 0; r < rows; r++) {
    for (let b = 0; b < 8; b++) {
      if (!rng.chance(0.35)) continue;
      g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
      g.fillRect(b * (S / 8) + (r % 2 ? S / 16 : 0), r * rh, S / 8, rh);
    }
  }
  // cracks
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  for (let i = 0; i < 5; i++) {
    let x = rng.next() * S;
    let y = rng.next() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += rng.range(-6, 6);
      y += rng.range(4, 14);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  speckle(g, rng, S, 1200, 0.04, 0.16, false);
  return toTexture(c);
}

/** Dark stone / concrete used for roofs and tunnels. */
export function roofTexture(): THREE.CanvasTexture {
  const S = 128;
  const { c, g } = makeCanvas(S, S);
  const rng = new Rng(31);
  g.fillStyle = '#bdbdbd';
  g.fillRect(0, 0, S, S);
  speckle(g, rng, S, 900, 0.05, 0.25, false);
  speckle(g, rng, S, 500, 0.05, 0.2, true);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.strokeRect(0.5, 0.5, S - 1, S - 1);
  return toTexture(c);
}

export type CrateStyle = 'wood' | 'containerBlue' | 'containerGreen' | 'metal' | 'car' | 'doorWood';

/** Crate / container / door skins. Tile = 2 m. */
export function crateTexture(style: CrateStyle): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = makeCanvas(S, S);
  const rng = new Rng(97 + style.length);
  g.fillStyle = '#e4e4e4';
  g.fillRect(0, 0, S, S);
  if (style === 'wood' || style === 'doorWood') {
    const planks = style === 'doorWood' ? 4 : 6;
    const ph = S / planks;
    for (let p = 0; p < planks; p++) {
      const shade = rng.range(-0.08, 0.08);
      g.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
      g.fillRect(0, p * ph, S, ph);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, p * ph);
      g.lineTo(S, p * ph);
      g.stroke();
      // grain
      g.strokeStyle = 'rgba(60,35,10,0.18)';
      g.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const y = p * ph + rng.next() * ph;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= S; x += 32) g.lineTo(x, y + rng.range(-1.5, 1.5));
        g.stroke();
      }
    }
    // frame + X brace
    g.strokeStyle = 'rgba(40,25,5,0.55)';
    g.lineWidth = 10;
    g.strokeRect(5, 5, S - 10, S - 10);
    if (style === 'wood') {
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(8, 8);
      g.lineTo(S - 8, S - 8);
      g.moveTo(S - 8, 8);
      g.lineTo(8, S - 8);
      g.stroke();
    }
    // nails
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (const [x, y] of [
      [14, 14],
      [S - 14, 14],
      [14, S - 14],
      [S - 14, S - 14],
    ]) {
      g.fillRect(x - 2, y - 2, 4, 4);
    }
  } else if (style === 'containerBlue' || style === 'containerGreen') {
    // corrugated steel
    for (let x = 0; x < S; x += 16) {
      const grd = g.createLinearGradient(x, 0, x + 16, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0.22)');
      grd.addColorStop(0.5, 'rgba(0,0,0,0.18)');
      grd.addColorStop(1, 'rgba(255,255,255,0.05)');
      g.fillStyle = grd;
      g.fillRect(x, 0, 16, S);
    }
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, S - 6, S - 6);
    // rust streaks
    for (let i = 0; i < 14; i++) {
      const x = rng.next() * S;
      const grd = g.createLinearGradient(x, 0, x, S);
      grd.addColorStop(0, 'rgba(120,60,20,0.2)');
      grd.addColorStop(1, 'rgba(120,60,20,0)');
      g.fillStyle = grd;
      g.fillRect(x, rng.next() * 60, rng.range(2, 6), rng.range(60, 200));
    }
  } else if (style === 'metal') {
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 3;
    g.strokeRect(6, 6, S - 12, S - 12);
    g.beginPath();
    g.moveTo(S / 2, 6);
    g.lineTo(S / 2, S - 6);
    g.moveTo(6, S / 2);
    g.lineTo(S - 6, S / 2);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) g.fillRect(16 + i * 74, 16 + j * 74, 5, 5);
    }
    speckle(g, rng, S, 500, 0.05, 0.2, false);
  } else {
    // car body panels
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    g.strokeRect(4, 4, S - 8, S - 8);
    g.beginPath();
    g.moveTo(0, S * 0.62);
    g.lineTo(S, S * 0.62);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(S * 0.12, S * 0.12, S * 0.32, S * 0.32);
    g.fillRect(S * 0.56, S * 0.12, S * 0.32, S * 0.32);
    speckle(g, rng, S, 800, 0.04, 0.18, false);
  }
  return toTexture(c);
}

/** Equirectangular sky: gradient, sun glow and soft clouds. */
export function skyTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const rng = new Rng(5);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#3f78c4');
  grd.addColorStop(0.35, '#7fb0e2');
  grd.addColorStop(0.5, '#dfe6ea');
  grd.addColorStop(0.52, '#d8cdb0');
  grd.addColorStop(1, '#bba97f');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // sun
  const sx = W * 0.27;
  const sy = H * 0.24;
  const sun = g.createRadialGradient(sx, sy, 0, sx, sy, 90);
  sun.addColorStop(0, 'rgba(255,255,240,1)');
  sun.addColorStop(0.12, 'rgba(255,248,215,0.95)');
  sun.addColorStop(0.4, 'rgba(255,235,170,0.25)');
  sun.addColorStop(1, 'rgba(255,235,170,0)');
  g.fillStyle = sun;
  g.fillRect(sx - 100, sy - 100, 200, 200);
  // clouds
  for (let i = 0; i < 26; i++) {
    const x = rng.next() * W;
    const y = rng.range(H * 0.12, H * 0.42);
    const w = rng.range(60, 190);
    const h = rng.range(12, 30);
    const cg = g.createRadialGradient(x, y, 0, x, y, w / 2);
    cg.addColorStop(0, 'rgba(255,255,255,0.45)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg;
    g.save();
    g.translate(x, y);
    g.scale(1, h / w);
    g.translate(-x, -y);
    g.fillRect(x - w / 2, y - w / 2, w, w);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft round sprite used for muzzle flashes, explosions, smoke. */
export function glowTexture(): THREE.CanvasTexture {
  const S = 64;
  const { c, g } = makeCanvas(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
