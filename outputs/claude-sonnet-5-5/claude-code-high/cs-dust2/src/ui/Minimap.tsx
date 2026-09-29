import { useEffect, useRef } from 'react';
import { AREAS, CRATES, DOORS, SITES } from '../sim/map.ts';
import type { GameSim } from '../sim/game.ts';
import { runtime } from '../runtime/runtime.ts';

const SIZE = 216;
const MIN_X = 4;
const MIN_Z = 3;
const SPAN = 106; // meters shown (square)
const S = SIZE / SPAN;

const px = (x: number): number => (x - MIN_X) * S;
const pz = (z: number): number => (z - MIN_Z) * S;

const LABELS: Record<string, string> = {
  T_SPAWN: 'T出生',
  CT_SPAWN: 'CT出生',
  LONG: 'A大',
  CAT: '猫道',
  MID: '中路',
  MID_TOP: '中门',
  B_TUNNELS: 'B洞',
  A_SITE: '',
  B_SITE: '',
};

/** Static Dust2 top-down outline, drawn once from the same grid the physics uses. */
function buildBase(sim: GameSim): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = 'rgba(10,12,16,0.82)';
  g.fillRect(0, 0, SIZE, SIZE);
  const { W, H, walk, area } = sim.world.grid;
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (!walk[z * W + x]) continue;
      const a = AREAS[area[z * W + x]];
      const t = a ? a.tint : 0xc0a878;
      const r = ((t >> 16) & 255) * 0.62;
      const gg = ((t >> 8) & 255) * 0.6;
      const b = (t & 255) * 0.5;
      g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
      g.fillRect(px(x), pz(z), S + 0.6, S + 0.6);
    }
  }
  // wall outline: draw edge pixels between walkable and solid cells
  g.fillStyle = 'rgba(235,225,200,0.75)';
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (!walk[z * W + x]) continue;
      if (!walk[z * W + x - 1]) g.fillRect(px(x) - 0.4, pz(z), 1, S);
      if (!walk[z * W + x + 1]) g.fillRect(px(x + 1) - 0.6, pz(z), 1, S);
      if (!walk[(z - 1) * W + x]) g.fillRect(px(x), pz(z) - 0.4, S, 1);
      if (!walk[(z + 1) * W + x]) g.fillRect(px(x), pz(z + 1) - 0.6, S, 1);
    }
  }
  g.fillStyle = 'rgba(40,30,20,0.9)';
  for (const cr of CRATES) g.fillRect(px(cr.x), pz(cr.z), cr.w * S, cr.d * S);
  g.strokeStyle = '#5fb5ff';
  g.lineWidth = 2;
  for (const d of DOORS) {
    for (const l of d.leaves) {
      g.beginPath();
      g.moveTo(px(l.x0), pz((l.z0 + l.z1) / 2));
      g.lineTo(px(l.x1), pz((l.z0 + l.z1) / 2));
      g.stroke();
    }
  }
  g.font = 'bold 9px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.72)';
  const seen = new Set<string>();
  for (const a of AREAS) {
    const label = LABELS[a.id];
    if (!label || seen.has(label)) continue;
    seen.add(label);
    g.fillText(label, px((a.rect[0] + a.rect[2]) / 2), pz((a.rect[1] + a.rect[3]) / 2));
  }
  g.font = 'bold 22px Arial, sans-serif';
  for (const s of SITES) {
    g.fillStyle = s.id === 'A' ? 'rgba(255,214,64,0.9)' : 'rgba(95,208,255,0.9)';
    g.fillText(s.id, px(s.center.x), pz(s.center.z));
  }
  return c;
}

export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<{ sim: GameSim; canvas: HTMLCanvasElement } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const sim = runtime.sim;
      const cv = ref.current;
      if (!sim || !cv) return;
      if (!baseRef.current || baseRef.current.sim !== sim) baseRef.current = { sim, canvas: buildBase(sim) };
      const g = cv.getContext('2d') as CanvasRenderingContext2D;
      g.clearRect(0, 0, SIZE, SIZE);
      g.drawImage(baseRef.current.canvas, 0, 0);

      const view = sim.viewActor;
      const team = sim.human ? sim.human.team : 'CT';

      // bomb
      const b = sim.bomb;
      // The C4 marker is always shown (carried / dropped / planted) as the spec asks for a
      // permanent C4 position on the minimap; a real CS radar would hide the carried bomb from CTs.
      if (b.state === 'carried' || b.state === 'dropped' || b.state === 'planted') {
        const blink = b.state === 'planted' && Math.floor(sim.t * 2.5) % 2 === 0;
        g.fillStyle = blink ? '#ffffff' : '#ff3b2f';
        g.fillRect(px(b.pos.x) - 4, pz(b.pos.z) - 4, 8, 8);
        g.strokeStyle = '#000';
        g.lineWidth = 1;
        g.strokeRect(px(b.pos.x) - 4, pz(b.pos.z) - 4, 8, 8);
        g.fillStyle = '#fff';
        g.font = 'bold 8px Arial';
        g.textAlign = 'center';
        g.fillText('C4', px(b.pos.x), pz(b.pos.z) - 9);
      }

      for (const a of sim.actors) {
        if (!a.alive) continue;
        const friendly = a.team === team;
        if (!friendly && !sim.spottedBy(team, a)) continue;
        const x = px(a.pos.x);
        const y = pz(a.pos.z);
        const isView = view && a.id === view.id;
        if (isView) {
          // view cone
          const fx = -Math.sin(a.yaw);
          const fz = -Math.cos(a.yaw);
          g.fillStyle = 'rgba(255,255,255,0.16)';
          g.beginPath();
          g.moveTo(x, y);
          const half = 0.62;
          for (const s of [-1, 1]) {
            const ang = Math.atan2(fz, fx) + s * half;
            g.lineTo(x + Math.cos(ang) * 46, y + Math.sin(ang) * 46);
          }
          g.closePath();
          g.fill();
          // arrow
          g.save();
          g.translate(x, y);
          g.rotate(Math.atan2(fz, fx) + Math.PI / 2);
          g.fillStyle = '#ffffff';
          g.strokeStyle = '#000';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(0, -6.5);
          g.lineTo(4.6, 5);
          g.lineTo(0, 2.6);
          g.lineTo(-4.6, 5);
          g.closePath();
          g.fill();
          g.stroke();
          g.restore();
        } else {
          g.fillStyle = friendly ? '#5be36b' : '#ff4436';
          g.strokeStyle = '#000';
          g.lineWidth = 1;
          g.beginPath();
          g.arc(x, y, 3.8, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          // facing tick
          g.strokeStyle = friendly ? '#c6ffce' : '#ffc4bd';
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - Math.sin(a.yaw) * 7, y - Math.cos(a.yaw) * 7);
          g.stroke();
        }
        if (a.hasBomb && (team === 'T' || !friendly)) {
          g.fillStyle = '#ff3b2f';
          g.fillRect(x + 4, y - 7, 5, 5);
        }
      }
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  return <canvas ref={ref} className="minimap" width={SIZE} height={SIZE} />;
}
