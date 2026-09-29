import * as THREE from "three";
import { VoxGrid, glow, matte } from "../util/vox";
import { hash, hash2, jitter, mix } from "../util/math";
import { rock, roundGeometry } from "../art/props";
import type { LightPreset } from "../direction/rig";

/**
 * The institute's model workshop after hours: cold fluorescent light, a five-axis
 * CNC machine, a lathe, and a scale model of the space elevator on a bench.
 * Frame: x right, z toward the door (+z), floor y = 0.
 */
export const SHOP = { hx: 6, hz: 4.5, h: 4 };

export interface Shop {
  group: THREE.Group;
  /** Machine origin (centre of the work zone floor). */
  cncPos: THREE.Vector3;
  spindle: THREE.Group;
  toolTip: THREE.Object3D;
  chuck: THREE.Group;
  mountedStone: THREE.Mesh;
  panel: { set(seg: number, mode: "idle" | "cut" | "saw" | "done", t: number): void };
  tower: { red: THREE.MeshBasicMaterial; amber: THREE.MeshBasicMaterial; green: THREE.MeshBasicMaterial };
  door: THREE.Group;
  tubes: Array<{ mat: THREE.MeshBasicMaterial }>;
  rods: THREE.InstancedMesh;
  segments: THREE.InstancedMesh;
  trayPos: THREE.Vector3;
  rawStones: THREE.Mesh[];
  sawBlade: THREE.Mesh;
  toolCase: THREE.Group;
  previewLight: LightPreset;
}

const CONCRETE = 0x6f7378;

function shell(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.125;
  const { hx, hz, h } = SHOP;
  const nx = Math.round((hx * 2) / v), nz = Math.round((hz * 2) / v);
  const floor = new VoxGrid(nx, 2, nz);
  floor.box(0, 0, 0, nx, 2, nz, (x, y, z) => {
    const line = (x === 40 || x === 41 || x === 55 || x === 56) && z > 6 && z < nz - 6;
    let c = mix(0x74777b, 0x666a6f, hash2(x >> 2, z >> 2, 3));
    if (line) c = 0xe0b422;
    if (x % 24 === 0 || z % 24 === 0) c = 0x54575b;
    return jitter(c, 0.04, x, y, z, 2);
  });
  const fm = floor.mesh(v, matte({ roughness: 0.6 }), "min");
  fm.position.set(-hx, -0.25, -hz);
  fm.castShadow = false;
  grp.add(fm);

  const hh = Math.round(h / v);
  const wall = (len: number, x0: number, z0: number, alongX: boolean, holes: Array<[number, number, number, number]>) => {
    const n = Math.round(len / v);
    const g = new VoxGrid(alongX ? n : 3, hh, alongX ? 3 : n);
    g.box(0, 0, 0, g.sx, g.sy, g.sz, (x, y, z) => {
      const u = alongX ? x : z;
      for (const [a, b, c, d] of holes) if (u >= a && u < b && y >= c && y < d) return null;
      if (y < 12) return jitter(0x4d5a55, 0.04, x, y, z, 3);
      if (y === 12) return 0xd6d9d6;
      return jitter(0x9fb3aa, 0.03, x, y, z, 4);
    });
    const m = g.mesh(v, matte({ roughness: 0.9 }), "min");
    m.position.set(x0, 0, z0);
    return m;
  };
  grp.add(wall(hx * 2 + 0.75, -hx - 0.375, -hz - 0.375, true, []));
  grp.add(wall(hx * 2 + 0.75, -hx - 0.375, hz, true, [[Math.round((3.4 + hx) / v) + 3, Math.round((5.4 + hx) / v) + 3, 0, 18]]));
  grp.add(wall(hz * 2, -hx - 0.375, -hz, false, [[Math.round((-2.4 + hz) / v), Math.round((0.6 + hz) / v), 14, 26]]));
  grp.add(wall(hz * 2, hx, -hz, false, []));
  const cx = Math.round((hx * 2) / v), cz = Math.round((hz * 2) / v);
  const ceil = new VoxGrid(cx, 3, cz);
  ceil.box(0, 0, 0, cx, 3, cz, (x, y, z) => (x % 16 < 2 && y < 2 ? 0x55595e : jitter(0x8a8f91, 0.03, x, y, z, 5)));
  const cm = ceil.mesh(v, matte(), "min");
  cm.position.set(-hx, h, -hz);
  cm.castShadow = false;
  grp.add(cm);
  return grp;
}

export const CNC = {
  v: 0.045,
  nx: 56, ny: 60, nz: 36,
  tableTop: 16 * 0.045,
  chuckY: 16 * 0.045 + 0.2,
  restNose: 1.98,
  cutNose: 1.7,
  toolLen: 0.32,
};

function cnc(): { group: THREE.Group; spindle: THREE.Group; toolTip: THREE.Object3D; chuck: THREE.Group; stoneMount: THREE.Group; tower: Shop["tower"]; screen: THREE.Mesh; screenCanvas: HTMLCanvasElement; screenTex: THREE.CanvasTexture } {
  const grp = new THREE.Group();
  const { v, nx, ny, nz } = CNC;
  const YEL = 0xe6b422, GREY = 0xb6bcc2, DARK = 0x3a3f46;
  // body: base, back wall, roof, side walls; the front is open for the camera
  const g = new VoxGrid(nx, ny, nz);
  g.box(0, 0, 0, nx, 14, nz, (x, y, z) => (y < 2 ? DARK : jitter(YEL, 0.04, x, y, z, 2)));
  g.box(0, 14, 0, nx, 16, nz, GREY);
  g.box(0, 16, 0, nx, ny, 3, (x, y, z) => jitter(0x8f979f, 0.04, x, y, z, 3));
  g.box(0, 16, 0, 3, ny, nz, (x, y, z) => jitter(YEL, 0.04, x, y, z, 4));
  g.box(nx - 3, 16, 0, nx, ny, nz, (x, y, z) => jitter(YEL, 0.04, x, y, z, 5));
  g.box(0, ny - 5, 0, nx, ny, nz, (x, y, z) => jitter(YEL, 0.04, x, y, z, 6));
  g.box(3, 16, 3, nx - 3, 17, nz - 2, 0x6a7078);
  for (let x = 6; x < nx - 6; x += 4) g.box(x, 16, 4, x + 1, 17, nz - 3, 0x555b62);
  const body = g.mesh(v, matte({ roughness: 0.5 }), "min");
  body.position.set(-nx * v / 2, 0, -nz * v / 2);
  grp.add(body);

  const light = new VoxGrid(nx - 10, 1, 2).box(0, 0, 0, nx - 10, 1, 2, 0xb8c4c8);
  const lm = new THREE.Mesh(light.geometry(v, "min"), glow({ toneMapped: false }));
  lm.position.set(-nx * v / 2 + 5 * v, (ny - 5) * v - 0.03, nz * v / 2 - 8 * v);
  grp.add(lm);

  // rotary chuck on the table
  const chuck = new THREE.Group();
  const ch = new VoxGrid(20, 10, 20);
  ch.cyl(10, 10, 9.5, 0, 3, (x, y, z) => jitter(0x40454c, 0.05, x, y, z, 2));
  ch.cyl(10, 10, 6.5, 3, 8, (x, y, z) => jitter(0x9aa1a9, 0.05, x, y, z, 3));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    ch.box(10 + Math.cos(a) * 5 - 1.5, 8, 10 + Math.sin(a) * 5 - 1.5, 10 + Math.cos(a) * 5 + 1.5, 10, 10 + Math.sin(a) * 5 + 1.5, 0x2a2d33);
  }
  chuck.add(ch.mesh(0.04, matte({ roughness: 0.4 }), "center"));
  chuck.position.set(0, CNC.chuckY, 0.1);
  grp.add(chuck);
  const stoneMount = new THREE.Group();
  stoneMount.position.set(0, 0.2, 0);
  chuck.add(stoneMount);

  // spindle head on a gantry: origin = spindle nose, head above, tool below
  const spindle = new THREE.Group();
  const sh = new VoxGrid(14, 16, 14);
  sh.box(0, 2, 0, 14, 16, 14, (x, y, z) => jitter(0xd8dde2, 0.04, x, y, z, 2));
  sh.box(2, 0, 2, 12, 2, 12, 0x3a3f46);
  sh.box(0, 8, 4, 14, 10, 10, 0x8f979f);
  const shm = sh.mesh(0.03, matte({ roughness: 0.4 }), "min");
  shm.position.set(-7 * 0.03, 0, -7 * 0.03);
  spindle.add(shm);
  const tool = new VoxGrid(3, 10, 3).box(0, 0, 0, 3, 10, 3, (x, y, z) => jitter(y < 3 ? 0x9a9fa6 : 0xc9ced4, 0.06, x, y, z, 4));
  const tm = tool.mesh(0.03, matte({ roughness: 0.3 }), "min");
  tm.position.set(-1.5 * 0.03, -10 * 0.03, -1.5 * 0.03);
  spindle.add(tm);
  const toolTip = new THREE.Object3D();
  toolTip.position.set(0, -CNC.toolLen, 0);
  spindle.add(toolTip);
  spindle.position.set(0, CNC.restNose, 0.1);
  grp.add(spindle);

  // gantry rail over the work zone
  const rail = new VoxGrid(nx - 6, 3, 4).box(0, 0, 0, nx - 6, 3, 4, 0x8f979f);
  const rm = rail.mesh(v, matte({ roughness: 0.4 }), "min");
  rm.position.set(-nx * v / 2 + 3 * v, CNC.restNose + 0.5, 0.1 - 2 * v);
  grp.add(rm);

  // status tower
  const red = glow({ toneMapped: false });
  const amber = glow({ toneMapped: false });
  const green = glow({ toneMapped: false });
  red.color.set(0x551010); amber.color.set(0x553d10); green.color.set(0x37ff7a);
  const tw = new THREE.Group();
  const cell = new VoxGrid(3, 3, 3).box(0, 0, 0, 3, 3, 3, 0xffffff).geometry(0.045, "center");
  [red, amber, green].forEach((m, i) => {
    const mesh = new THREE.Mesh(cell, m);
    mesh.position.set(0, i * 3 * 0.045, 0);
    tw.add(mesh);
  });
  const post = new VoxGrid(1, 6, 1).box(0, 0, 0, 1, 6, 1, 0x30343a).mesh(0.045, matte(), "center");
  post.position.set(0, -6 * 0.045, 0);
  tw.add(post);
  tw.position.set(nx * v / 2 - 4 * v, ny * v + 0.3, -nz * v / 2 + 6 * v);
  grp.add(tw);

  // control pendant: panel + live screen, standing at the machine's right
  const panel = new VoxGrid(20, 30, 10);
  panel.box(0, 0, 0, 20, 30, 10, (x, y, z) => jitter(0xc9ced4, 0.04, x, y, z, 2));
  panel.box(2, 14, 9, 18, 28, 10, 0x1a1d21);
  for (let i = 0; i < 12; i++) panel.box(2 + (i % 6) * 2.6, 3 + Math.floor(i / 6) * 5, 9, 3 + (i % 6) * 2.6, 5 + Math.floor(i / 6) * 5, 10, i % 5 === 0 ? 0xd94a3d : 0x6a7078);
  const pm = panel.mesh(0.045, matte({ roughness: 0.5 }), "min");
  const pend = new THREE.Group();
  pm.position.set(-10 * 0.045, 0, 0);
  pend.add(pm);
  const leg = new VoxGrid(3, 30, 3).box(0, 0, 0, 3, 30, 3, 0x30343a).mesh(0.045, matte(), "min");
  leg.position.set(-1.5 * 0.045, -1.3, 3 * 0.045);
  pend.add(leg);
  pend.position.set(nx * v / 2 + 0.55, 1.75, 0.0);
  pend.rotation.y = -0.6;
  grp.add(pend);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 80;
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.42), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(0, 21 * 0.045, 10 * 0.045 + 0.004);
  pend.add(screen);

  return { group: grp, spindle, toolTip, chuck, stoneMount, tower: { red, amber, green }, screen, screenCanvas: canvas, screenTex: tex };
}

function lathe(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.06;
  const g = new VoxGrid(60, 20, 18);
  g.box(0, 0, 0, 60, 3, 18, 0x30343a);
  g.box(2, 3, 2, 8, 14, 16, (x, y, z) => jitter(0x3d6a5c, 0.04, x, y, z, 2));
  g.box(8, 3, 6, 50, 6, 12, (x, y, z) => jitter(0x5b636b, 0.05, x, y, z, 3));
  g.box(44, 6, 5, 52, 14, 13, (x, y, z) => jitter(0x3d6a5c, 0.04, x, y, z, 4));
  g.cyl(0, 0, 0, 0, 0, 0);
  g.box(8, 8, 8, 20, 12, 10, 0xb8bec5);
  g.box(0, 3, 0, 60, 4, 1, 0x1f2226);
  grp.add(g.mesh(v, matte({ roughness: 0.5 }), "min"));
  return grp;
}

function stationModel(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.012;
  const R = 34, T = 5, span = (R + T + 4) * 2, c = span / 2;
  const g = new VoxGrid(span, 44, span);
  for (let y = 0; y < 44; y++) {
    for (let z = 0; z < span; z++) {
      for (let x = 0; x < span; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - 22, dz = z + 0.5 - c;
        const q = Math.hypot(Math.hypot(dx, dz) - R, dy);
        if (q <= T) g.set(x, y, z, jitter(0xe0e4e8, 0.04, x, y, z, 2));
      }
    }
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    for (let r = 3; r < R - T; r++) g.set(c + Math.cos(a) * r, 22, c + Math.sin(a) * r, 0xb9c1cb);
  }
  g.cyl(c, c, 3, 6, 38, 0xd0d5db);
  const m = g.mesh(v, matte({ roughness: 0.5 }), "center");
  m.rotation.z = 0.5;
  grp.add(m);
  const base = new VoxGrid(30, 3, 30).box(0, 0, 0, 30, 3, 30, (x, y, z) => jitter(0x2a2d33, 0.05, x, y, z, 2)).mesh(0.03, matte(), "center");
  base.position.y = -0.55;
  grp.add(base);
  // elevator cable model
  const cab = new VoxGrid(1, 60, 1).box(0, 0, 0, 1, 60, 1, (x, y) => (y % 4 < 2 ? 0xd0d5db : 0x8f979f)).mesh(0.012, matte(), "min");
  cab.position.set(0, -0.6, 0);
  grp.add(cab);
  return grp;
}

function textPlane(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, cw: number, ch: number) => void, px = 128): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = Math.round(px * (h / w));
  const ctx = canvas.getContext("2d")!;
  draw(ctx, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
}

export function buildShop(): Shop {
  const group = new THREE.Group();
  group.name = "shop";
  const { hx, hz, h } = SHOP;
  group.add(shell());

  const c = cnc();
  const cncPos = new THREE.Vector3(0.6, 0, -1.6);
  c.group.position.copy(cncPos);
  group.add(c.group);
  const screen = c.screen;
  // panel canvas
  const ctx = c.screenCanvas.getContext("2d")!;
  let lastKey = "";
  const panel: Shop["panel"] = {
    set(seg, mode, t) {
      const key = `${seg}|${mode}|${Math.floor(t * 2)}`;
      if (key === lastKey) return;
      lastKey = key;
      ctx.fillStyle = "#04140c";
      ctx.fillRect(0, 0, 128, 80);
      ctx.fillStyle = mode === "done" ? "#37ff7a" : mode === "idle" ? "#7a8a80" : "#ffb02e";
      ctx.font = "bold 14px monospace";
      ctx.fillText(mode.toUpperCase(), 6, 16);
      ctx.fillStyle = "#37ff7a";
      ctx.font = "bold 22px monospace";
      ctx.fillText(`SEG ${String(seg).padStart(2, "0")}/36`, 6, 44);
      ctx.fillStyle = "#123b26";
      ctx.fillRect(6, 56, 116, 8);
      ctx.fillStyle = "#37ff7a";
      ctx.fillRect(6, 56, Math.round(116 * (seg / 36)), 8);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = Math.floor(t * 2 + i) % 3 === 0 ? "#ffb02e" : "#1d5a3a";
        ctx.fillRect(6 + i * 20, 70, 14, 4);
      }
      c.screenTex.needsUpdate = true;
    },
  };
  panel.set(0, "idle", 0);

  const lt = lathe();
  lt.position.set(-4.3, 0, -3.0);
  lt.rotation.y = 0.15;
  group.add(lt);
  const lt2 = lathe();
  lt2.position.set(-4.3, 0, 0.6);
  lt2.rotation.y = -0.05;
  lt2.scale.set(0.85, 0.85, 0.85);
  group.add(lt2);

  // workbenches with the elevator model, along the back wall
  const bench = new VoxGrid(64, 16, 14);
  bench.box(0, 12, 0, 64, 16, 14, (x, y, z) => jitter(0x8a6a44, 0.05, x, y, z, 2));
  for (const x of [1, 59]) bench.box(x, 0, 1, x + 4, 12, 13, 0x4a4e54);
  bench.box(1, 5, 1, 63, 6, 13, 0x4a4e54);
  const bm = bench.mesh(0.06, matte({ roughness: 0.6 }), "min");
  bm.position.set(-hx + 1.6, 0, -hz + 0.35);
  group.add(bm);
  const model = stationModel();
  model.position.set(-hx + 2.6, 0.96 + 0.18, -hz + 0.9);
  group.add(model);

  // pegboard with tools
  const peg = new VoxGrid(60, 30, 2);
  peg.box(0, 0, 0, 60, 30, 2, (x, y, z) => (z === 1 && x % 4 === 2 && y % 4 === 2 ? 0x2d3237 : jitter(0xb8a37a, 0.04, x, y, z, 2)));
  const tools = [0xd94a3d, 0x2f6fb5, 0xe6b422, 0x9aa1aa, 0x3d6a5c, 0xd94a3d, 0x9aa1aa];
  tools.forEach((col, i) => peg.box(4 + i * 8, 6, 1, 6 + i * 8, 24 - (i % 3) * 3, 2, col));
  const pegm = peg.mesh(0.05, matte(), "min");
  pegm.position.set(1.8, 1.4, -hz + 0.1);
  group.add(pegm);

  // signs
  const sign = textPlane(1.6, 0.4, (ctx, w, hh) => {
    ctx.fillStyle = "#1c4d3a";
    ctx.fillRect(0, 0, w, hh);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.floor(hh * 0.55)}px sans-serif`;
    ctx.fillText("模型车间", 10, Math.floor(hh * 0.72));
  }, 192);
  sign.position.set(-2.4, 3.1, -hz + 0.07);
  group.add(sign);
  const clock = textPlane(0.5, 0.5, (ctx, w, hh) => {
    ctx.fillStyle = "#f2efe6";
    ctx.fillRect(0, 0, w, hh);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(w / 2 - 2, 8, 4, hh / 2 - 8);
    ctx.fillRect(w / 2 - 1, hh / 2 - 2, w / 2 - 14, 4);
    ctx.fillRect(0, 0, w, 3);
    ctx.fillRect(0, hh - 3, w, 3);
    ctx.fillRect(0, 0, 3, hh);
    ctx.fillRect(w - 3, 0, 3, hh);
  }, 48);
  clock.position.set(-0.4, 3.0, -hz + 0.07);
  group.add(clock);

  // ceiling fluorescent tubes
  const tubes: Shop["tubes"] = [];
  const tube = new VoxGrid(48, 2, 4).box(0, 0, 0, 48, 2, 4, 0xf2fff8).geometry(0.05, "center");
  const housing = new VoxGrid(52, 1, 6).box(0, 0, 0, 52, 1, 6, 0x9aa1a5).geometry(0.05, "center");
  for (const [x, z] of [[-3.6, -2.4], [-0.4, -2.4], [3.4, -2.4], [-3.6, 1.6], [-0.4, 1.6], [3.4, 1.6]] as const) {
    const mat = glow({ toneMapped: false });
    const m = new THREE.Mesh(tube, mat);
    m.position.set(x, h - 0.12, z);
    m.castShadow = false;
    const hm = new THREE.Mesh(housing, matte());
    hm.position.set(x, h - 0.08, z);
    hm.castShadow = false;
    group.add(m, hm);
    tubes.push({ mat });
  }

  // night window
  const night = new VoxGrid(60, 24, 1);
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 60; x++) {
      let col = 0x0b1020;
      if (y < 8 && hash2(x, y, 3) > 0.7) col = hash2(x, y, 4) > 0.5 ? 0xffc36b : 0xfff0c0;
      if (y === 8) col = 0x151b30;
      night.set(x, y, 0, col);
    }
  }
  const nm = night.mesh(0.05, glow({ toneMapped: false, fog: false }), "min");
  nm.position.set(-hx - 0.6, 1.75, 0.6);
  nm.rotation.y = Math.PI / 2;
  nm.scale.x = 1;
  group.add(nm);
  const nm2 = night.mesh(0.05, glow({ toneMapped: false, fog: false }), "min");
  nm2.position.set(-hx - 0.6, 1.75, 0.6);
  nm2.rotation.y = Math.PI / 2;
  // (the window is a hole in the −x wall; the mesh behind it is the city)
  nm2.visible = false;
  group.add(nm2);

  // door (closed) on the +z wall
  const door = new THREE.Group();
  const dg = new VoxGrid(3, 36, 32);
  dg.box(0, 0, 0, 3, 36, 32, (x, y, z) => (z === 15 || z === 16 ? 0x2a2d31 : jitter(0x6e7378, 0.04, x, y, z, 2)));
  dg.box(0, 18, 26, 3, 20, 28, 0xb9c0c8);
  const dm = dg.mesh(0.0625, matte({ roughness: 0.5 }), "min");
  door.add(dm);
  door.position.set(3.4, 0, hz - 0.05);
  door.rotation.y = 0;
  dm.rotation.y = Math.PI / 2;
  dm.position.set(0, 0, 0);
  group.add(door);

  // instanced stock: rods (pencil-thick) and 36 finished segments
  const rodGeo = new VoxGrid(1, 1, 30).box(0, 0, 0, 1, 1, 30, (x, y, z) => jitter(0x6a625a, 0.1, x, y, z, 3)).geometry(0.028, "center");
  const rods = new THREE.InstancedMesh(rodGeo, matte({ roughness: 0.5 }), 12);
  rods.frustumCulled = false;
  const segGeo = new VoxGrid(1, 1, 2).box(0, 0, 0, 1, 1, 2, (x, y, z) => jitter(0x74695e, 0.08, x, y, z, 4)).geometry(0.028, "center");
  const segments = new THREE.InstancedMesh(segGeo, matte({ roughness: 0.5 }), 36);
  segments.frustumCulled = false;
  const trayPos = new THREE.Vector3(cncPos.x - 1.4, 1.02, cncPos.z + 1.0);
  const tray = new VoxGrid(30, 2, 20);
  tray.box(0, 0, 0, 30, 2, 20, (x, y, z) => (y === 0 || x === 0 || z === 0 || x === 29 || z === 19 ? 0x8b939b : 0xc0c6cc));
  const trayM = tray.mesh(0.028, matte({ roughness: 0.4 }), "center");
  trayM.position.copy(trayPos).add(new THREE.Vector3(0, -0.028, 0));
  group.add(trayM);
  rods.position.copy(trayPos);
  segments.position.copy(trayPos);
  group.add(rods, segments);
  // side table for the tray
  const table = new VoxGrid(24, 16, 16).box(0, 0, 0, 24, 16, 16, (x, y, z) => (y < 14 && x > 1 && x < 22 && z > 1 && z < 14 && (x < 3 || x > 20 || z < 3 || z > 12) ? 0x4a4e54 : y >= 14 ? 0x8a6a44 : null));
  const tableM = table.mesh(0.0625, matte(), "center");
  tableM.position.set(trayPos.x, 0.5, trayPos.z);
  group.add(tableM);

  // raw meteorites waiting on the bench beside the machine
  const rawStones: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const s = rock(30 + i, 5.6 + i * 0.4, "iron", 0.02);
    s.position.set(cncPos.x + 1.75 + i * 0.3 - 0.3, 1.09, cncPos.z + 1.3);
    group.add(s);
    rawStones.push(s);
  }
  const table2 = tableM.clone();
  table2.position.set(cncPos.x + 1.75, 0.5, cncPos.z + 1.3);
  group.add(table2);
  const mounted = rock(31, 7, "iron", 0.024);
  mounted.position.set(0, 0.15, 0);
  c.stoneMount.add(mounted);

  // circular saw blade fixture (segments are sawn here)
  const bl = new VoxGrid(24, 2, 24);
  bl.cyl(12, 12, 11, 0, 2, (x, y, z) => (Math.hypot(x - 12, z - 12) > 9.5 && (x + z) % 3 === 0 ? 0x5a5f66 : jitter(0xc4cad0, 0.06, x, y, z, 2)));
  bl.cyl(12, 12, 1.5, 0, 2, 0x222222);
  const sawBlade = bl.mesh(0.035, matte({ roughness: 0.3 }), "center");
  sawBlade.position.copy(cncPos).add(new THREE.Vector3(0, 1.45, 0.4));
  sawBlade.rotation.x = Math.PI / 2;
  sawBlade.visible = false;
  group.add(sawBlade);

  // small hard case for the finished segments (used at the end of the sequence)
  const toolCase = new THREE.Group();
  const cs = new VoxGrid(28, 5, 18);
  cs.box(0, 0, 0, 28, 5, 18, (x, y, z) => (y < 4 && x > 0 && x < 27 && z > 0 && z < 17 && y > 0 ? 0x1a1c20 : 0x2b2f35));
  toolCase.add(cs.mesh(0.03, matte(), "center"));
  toolCase.visible = false;
  group.add(toolCase);

  const previewLight: LightPreset = {
    bg: 0x05070a,
    fog: { color: 0x0d1412, density: 0.006 },
    hemi: [0x86a89a, 0x1a2420, 0.9],
    spot: { color: 0xeafff5, intensity: 90, pos: [0.6, h - 0.3, -1.0], target: [0.6, 1.0, -1.6], angle: 0.8, penumbra: 0.7, distance: 12 },
    points: [
      { color: 0xbfe8dc, intensity: 14, pos: [-2.2, h - 0.5, 0], distance: 10 },
      { color: 0xbfe8dc, intensity: 10, pos: [3.4, h - 0.5, 1.6], distance: 10 },
      { color: 0xffa64a, intensity: 6, pos: [0.6, 1.2, -1.6], distance: 4 },
    ],
  };
  void hx;
  return {
    group, cncPos, spindle: c.spindle, toolTip: c.toolTip, chuck: c.chuck, mountedStone: mounted, panel, tower: c.tower, door, tubes,
    rods, segments, trayPos, rawStones, sawBlade, toolCase, previewLight,
  };
}

export { hash, roundGeometry };
