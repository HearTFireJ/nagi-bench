import { useEffect, useRef } from 'react';
import { CELL, MAP_LABELS } from '../game/map/MapData';
import { getMapGrid } from '../game/map/MapGrid';
import { useGame } from './GameContext';

const SIZE = 230;

/** Pre-render the Dust2 top-down outline once. */
function renderBackground(): HTMLCanvasElement {
  const map = getMapGrid();
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d')!;
  const s = SIZE / map.w;
  ctx.fillStyle = '#141820';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (const cell of map.cells) {
    let color: string | null = null;
    if (cell.wall) color = null;
    else if (cell.zone === 'A' || cell.zone === 'B') color = '#8a5a3a';
    else if (cell.crateH > 0) color = '#6b5638';
    else if (cell.roof) color = '#5c5647';
    else if (cell.ramp) color = '#8c8266';
    else if (cell.floorH >= 2) color = '#a39a80';
    else if (cell.spawn === 'CT') color = '#6f7f99';
    else if (cell.spawn === 'T') color = '#9c8a6a';
    else if (cell.door) color = '#4c6a55';
    else color = '#8a8270';
    if (!color) continue;
    ctx.fillStyle = color;
    ctx.fillRect(cell.x * s, cell.z * s, s + 0.5, s + 0.5);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 3;
  for (const l of MAP_LABELS) ctx.fillText(l.text, (l.x + 0.5) * s, (l.z + 0.5) * s);
  return c;
}

export function Minimap() {
  const game = useGame();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const bg = renderBackground();
    const scale = SIZE / (getMapGrid().w * CELL);
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 50) return;
      last = t;
      const d = game.getMinimapData();
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(bg, 0, 0);
      const px = (x: number) => x * scale;
      // C4
      if (d.c4) {
        const blink = d.c4.state === 'planted' && Math.floor(t / 300) % 2 === 0;
        ctx.fillStyle = d.c4.state === 'defused' ? '#5cf58a' : blink ? '#ffffff' : '#ff5c3c';
        ctx.fillRect(px(d.c4.x) - 4, px(d.c4.z) - 4, 8, 8);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(px(d.c4.x) - 4, px(d.c4.z) - 4, 8, 8);
      }
      // Enemies
      for (const e of d.enemies) {
        ctx.fillStyle = '#ff4040';
        ctx.beginPath();
        ctx.arc(px(e.x), px(e.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.stroke();
      }
      // Allies
      for (const a of d.allies) {
        if (!a.alive) {
          ctx.strokeStyle = 'rgba(200,200,200,0.7)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px(a.x) - 3, px(a.z) - 3);
          ctx.lineTo(px(a.x) + 3, px(a.z) + 3);
          ctx.moveTo(px(a.x) + 3, px(a.z) - 3);
          ctx.lineTo(px(a.x) - 3, px(a.z) + 3);
          ctx.stroke();
          continue;
        }
        drawArrow(ctx, px(a.x), px(a.z), a.yaw, d.team === 'CT' ? '#7ab8ff' : '#ffb45c', 5);
      }
      // Viewer with a view cone
      if (d.viewer) {
        const v = d.viewer;
        const cx = px(v.x);
        const cz = px(v.z);
        if (v.alive) {
          const dirA = -v.yaw - Math.PI / 2; // yaw=0 looks -z (up on the map)
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          ctx.moveTo(cx, cz);
          ctx.arc(cx, cz, 26, dirA - 0.6, dirA + 0.6);
          ctx.closePath();
          ctx.fill();
          drawArrow(ctx, cx, cz, v.yaw, '#ffffff', 6);
        } else {
          ctx.fillStyle = '#888';
          ctx.fillRect(cx - 3, cz - 3, 6, 6);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [game]);

  return (
    <div className="minimap">
      <canvas ref={ref} width={SIZE} height={SIZE} />
    </div>
  );
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, yaw: number, color: string, r: number) {
  // forward on the map: (-sin yaw, -cos yaw)
  const fx = -Math.sin(yaw);
  const fy = -Math.cos(yaw);
  const rx = fy;
  const ry = -fx;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + fx * r * 1.3, y + fy * r * 1.3);
  ctx.lineTo(x - fx * r * 0.8 + rx * r * 0.8, y - fy * r * 0.8 + ry * r * 0.8);
  ctx.lineTo(x - fx * r * 0.3, y - fy * r * 0.3);
  ctx.lineTo(x - fx * r * 0.8 - rx * r * 0.8, y - fy * r * 0.8 - ry * r * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
