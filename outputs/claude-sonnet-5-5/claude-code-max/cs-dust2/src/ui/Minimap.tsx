import { useEffect, useRef } from 'react';
import type { Level } from '../game/level';
import type { Team } from '../game/types';
import { useEngine, useHud } from './EngineContext';

const PX_PER_M = 2.2;
const TEAM_COLOR: Record<Team, string> = { CT: '#5aa9ff', T: '#ffb54a' };

/** Pre-render the static Dust2 top-down outline once per level (floors shaded by height, crates, labels, sites). */
const paintBackground = (level: Level): HTMLCanvasElement => {
  const map = level.map;
  const w = Math.round((map.maxX - map.minX) * PX_PER_M);
  const h = Math.round((map.maxZ - map.minZ) * PX_PER_M);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = 'rgba(12,16,22,0.78)';
  ctx.fillRect(0, 0, w, h);
  const cellPx = map.cell * PX_PER_M;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const i = r * map.cols + c;
      const fh = map.floor[i];
      if (Number.isNaN(fh)) continue;
      const roofed = !Number.isNaN(map.roof[i]);
      // Higher ground is lighter; tunnels are slightly darker.
      const base = 150 + fh * 30 - (roofed ? 30 : 0);
      ctx.fillStyle = `rgb(${Math.min(235, base + 20)},${Math.min(230, base + 8)},${Math.min(215, base - 14)})`;
      ctx.fillRect(c * cellPx, r * cellPx, cellPx + 0.6, cellPx + 0.6);
    }
  }
  // Crates.
  ctx.fillStyle = 'rgba(70,55,35,0.9)';
  for (const crate of map.crates) {
    const d = crate.def;
    ctx.fillRect((d.x0 - map.minX) * PX_PER_M, (d.z0 - map.minZ) * PX_PER_M, (d.x1 - d.x0) * PX_PER_M, (d.z1 - d.z0) * PX_PER_M);
  }
  // Doors.
  ctx.fillStyle = '#4b8a6a';
  for (const d of map.doors) {
    const hw = d.axis === 'x' ? d.width / 2 : d.thickness;
    const hd = d.axis === 'x' ? d.thickness : d.width / 2;
    ctx.fillRect((d.x - hw - map.minX) * PX_PER_M, (d.z - hd - map.minZ) * PX_PER_M, hw * 2 * PX_PER_M, hd * 2 * PX_PER_M);
  }
  // Zone callouts (the Chinese names used in the community).
  ctx.font = '600 10px "Microsoft YaHei","PingFang SC",system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const major = new Set(['T_SPAWN', 'CT_SPAWN', 'A_LONG', 'A_SITE', 'MID_DOORS', 'CATWALK', 'B_TUNNELS', 'B_SITE', 'MID']);
  for (const label of map.zoneLabels) {
    if (!major.has(label.id)) continue;
    const x = (label.x - map.minX) * PX_PER_M;
    const y = (label.z - map.minZ) * PX_PER_M;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(label.name, x, y);
    ctx.fillStyle = '#f4f1e6';
    ctx.fillText(label.name, x, y);
  }
  // Bombsite rings.
  for (const s of map.sites) {
    ctx.strokeStyle = 'rgba(255,80,60,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc((s.x - map.minX) * PX_PER_M, (s.z - map.minZ) * PX_PER_M, s.radius * PX_PER_M, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvas;
};

const backgrounds = new WeakMap<Level, HTMLCanvasElement>();

/**
 * Always-on minimap: static top-down outline + live dots for yourself (view cone), teammates, enemies that a teammate
 * currently sees, and the C4. Drawn imperatively every frame from the simulation state (no React state involved).
 */
export const Minimap = () => {
  const engine = useEngine();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zone = useHud((h) => h.zoneName);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let bg = backgrounds.get(engine.level);
    if (!bg) {
      bg = paintBackground(engine.level);
      backgrounds.set(engine.level, bg);
    }
    canvas.width = bg.width;
    canvas.height = bg.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const map = engine.level.map;
    const background = bg;

    const toX = (x: number): number => (x - map.minX) * PX_PER_M;
    const toY = (z: number): number => (z - map.minZ) * PX_PER_M;

    const dot = (x: number, z: number, yaw: number, color: string, radius: number, wedge: boolean): void => {
      const px = toX(x);
      const py = toY(z);
      if (wedge) {
        // Facing direction: yaw 0 looks toward -Z (up on the radar).
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.arc(px, py, radius * 4.2, -Math.PI / 2 - yaw - 0.55, -Math.PI / 2 - yaw + 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.stroke();
    };

    return engine.frame$.on(() => {
      const w = engine.world;
      const view = engine.viewActor;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(background, 0, 0);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);

      // Bomb.
      const b = w.bomb;
      if (b.status === 'planted') {
        const px = toX(b.pos.x);
        const py = toY(b.pos.z);
        ctx.fillStyle = `rgba(255,50,40,${0.35 + 0.5 * pulse})`;
        ctx.beginPath();
        ctx.arc(px, py, 9 + pulse * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff3b30';
        ctx.fillRect(px - 4, py - 4, 8, 8);
      } else if (b.status === 'dropped') {
        const px = toX(b.pos.x);
        const py = toY(b.pos.z);
        ctx.fillStyle = '#ffd84a';
        ctx.beginPath();
        ctx.moveTo(px, py - 6);
        ctx.lineTo(px + 6, py + 5);
        ctx.lineTo(px - 6, py + 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.stroke();
      }

      // Teammates (always shown), enemies only when spotted.
      for (const a of w.actors) {
        if (a.id === view.id) continue;
        if (a.team === view.team) {
          if (!a.alive) {
            const px = toX(a.pos.x);
            const py = toY(a.pos.z);
            ctx.strokeStyle = 'rgba(200,200,200,0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px - 3, py - 3);
            ctx.lineTo(px + 3, py + 3);
            ctx.moveTo(px + 3, py - 3);
            ctx.lineTo(px - 3, py + 3);
            ctx.stroke();
            continue;
          }
          dot(a.pos.x, a.pos.z, a.yaw, TEAM_COLOR[a.team], 4, false);
          if (a.hasBomb) {
            const px = toX(a.pos.x);
            const py = toY(a.pos.z);
            ctx.fillStyle = '#ff5a3c';
            ctx.fillRect(px - 2, py - 9, 4, 4);
          }
        } else if (a.alive && engine.isEnemyVisible(a)) {
          dot(a.pos.x, a.pos.z, a.yaw, '#ff4a4a', 4, false);
        }
      }
      // Yourself: bright dot with a view cone.
      if (view.alive) dot(view.pos.x, view.pos.z, view.yaw, '#ffffff', 4.5, true);
    });
  }, [engine]);

  return (
    <div className="minimap">
      <canvas ref={canvasRef} />
      <div className="minimap-zone">{zone || ' '}</div>
    </div>
  );
};
