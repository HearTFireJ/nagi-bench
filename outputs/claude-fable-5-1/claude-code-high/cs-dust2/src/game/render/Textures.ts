import * as THREE from 'three';

/** Procedural canvas textures (no external files). */

function makeCanvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

export interface NoiseTextureOpts {
  base: number;
  variance?: number;
  size?: number;
  pattern?: 'none' | 'planks' | 'bricks' | 'tiles' | 'metal';
  seed?: number;
}

export function makeNoiseTexture(opts: NoiseTextureOpts): THREE.CanvasTexture {
  const size = opts.size ?? 128;
  const variance = opts.variance ?? 18;
  const { c, ctx } = makeCanvas(size);
  const [r, g, b] = hexToRgb(opts.base);
  const img = ctx.createImageData(size, size);
  let s = opts.seed ?? 1337;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < size * size; i++) {
    const n = (rnd() - 0.5) * 2 * variance;
    const n2 = (rnd() - 0.5) * variance * 0.5;
    img.data[i * 4] = Math.max(0, Math.min(255, r + n + n2));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, g + n + n2 * 0.6));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, b + n * 0.8));
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // low-frequency blotches for a weathered look
  for (let i = 0; i < 24; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const rad = 6 + rnd() * size * 0.25;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const dark = rnd() > 0.5;
    grad.addColorStop(0, dark ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.lineWidth = Math.max(1, size / 64);
  switch (opts.pattern) {
    case 'planks': {
      ctx.strokeStyle = 'rgba(40,25,10,0.55)';
      const n = 4;
      for (let i = 0; i <= n; i++) {
        const y = (i * size) / n;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(40,25,10,0.35)';
      ctx.beginPath();
      ctx.moveTo(2, 2);
      ctx.lineTo(size - 2, 2);
      ctx.lineTo(size - 2, size - 2);
      ctx.lineTo(2, size - 2);
      ctx.closePath();
      ctx.stroke();
      // nails
      ctx.fillStyle = 'rgba(30,30,30,0.6)';
      for (let i = 0; i < n; i++) {
        const y = ((i + 0.5) * size) / n;
        ctx.fillRect(6, y - 1.5, 3, 3);
        ctx.fillRect(size - 9, y - 1.5, 3, 3);
      }
      break;
    }
    case 'bricks': {
      ctx.strokeStyle = 'rgba(70,55,35,0.35)';
      const rows = 6;
      const bh = size / rows;
      for (let i = 0; i < rows; i++) {
        const y = i * bh;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
        const off = i % 2 === 0 ? 0 : size / 6;
        for (let x = off; x < size; x += size / 3) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + bh);
          ctx.stroke();
        }
      }
      break;
    }
    case 'tiles': {
      ctx.strokeStyle = 'rgba(60,50,30,0.3)';
      const n = 2;
      for (let i = 0; i <= n; i++) {
        const p = (i * size) / n;
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.stroke();
      }
      break;
    }
    case 'metal': {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < 6; i++) {
        const y = (i * size) / 6 + 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
      break;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeLetterTexture(text: string, color: string, bg = 'rgba(0,0,0,0)'): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = color;
  ctx.font = 'bold 200px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeNameTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(text, 128, 32);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * BoxGeometry whose UVs are scaled so that a texture tile covers `tile` meters on
 * every face, regardless of the box dimensions.
 */
export function boxGeo(w: number, h: number, d: number, tile = 2): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // faces: +x, -x, +y, -y, +z, -z — 4 verts each
  const faceScale: [number, number][] = [
    [d / tile, h / tile],
    [d / tile, h / tile],
    [w / tile, d / tile],
    [w / tile, d / tile],
    [w / tile, h / tile],
    [w / tile, h / tile],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = faceScale[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  uv.needsUpdate = true;
  return g;
}

export interface MapMaterials {
  wall: THREE.Material;
  wallTop: THREE.Material;
  floor: THREE.Material;
  elevated: THREE.Material;
  crate: THREE.Material;
  roof: THREE.Material;
  door: THREE.Material;
  frame: THREE.Material;
  siteA: THREE.Material;
  siteB: THREE.Material;
}

let cached: MapMaterials | null = null;

export function getMapMaterials(): MapMaterials {
  if (cached) return cached;
  const wallTex = makeNoiseTexture({ base: 0xcbb489, variance: 14, pattern: 'bricks', seed: 11 });
  const floorTex = makeNoiseTexture({ base: 0xb9a37a, variance: 16, pattern: 'tiles', seed: 21 });
  const elevTex = makeNoiseTexture({ base: 0xb09a72, variance: 14, pattern: 'tiles', seed: 31 });
  const crateTex = makeNoiseTexture({ base: 0x9a7648, variance: 20, pattern: 'planks', seed: 41 });
  const roofTex = makeNoiseTexture({ base: 0x8f7d5c, variance: 12, pattern: 'metal', seed: 51 });
  const doorTex = makeNoiseTexture({ base: 0x4c6a55, variance: 10, pattern: 'metal', seed: 61 });
  cached = {
    wall: new THREE.MeshLambertMaterial({ map: wallTex }),
    wallTop: new THREE.MeshLambertMaterial({ color: 0xa8926b }),
    floor: new THREE.MeshLambertMaterial({ map: floorTex }),
    elevated: new THREE.MeshLambertMaterial({ map: elevTex }),
    crate: new THREE.MeshLambertMaterial({ map: crateTex }),
    roof: new THREE.MeshLambertMaterial({ map: roofTex, side: THREE.DoubleSide }),
    door: new THREE.MeshLambertMaterial({ map: doorTex }),
    frame: new THREE.MeshLambertMaterial({ color: 0x3a3f3a }),
    siteA: new THREE.MeshBasicMaterial({ map: makeLetterTexture('A', 'rgba(255,120,40,0.85)'), transparent: true, depthWrite: false }),
    siteB: new THREE.MeshBasicMaterial({ map: makeLetterTexture('B', 'rgba(255,120,40,0.85)'), transparent: true, depthWrite: false }),
  };
  return cached;
}
