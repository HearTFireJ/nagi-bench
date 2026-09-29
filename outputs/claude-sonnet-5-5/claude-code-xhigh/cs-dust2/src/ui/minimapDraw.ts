import type { Game } from '../core/game/game.ts';
import type { Character } from '../core/entities/character.ts';
import type { Team } from '../core/map/types.ts';

const TEAM_COLOR: Record<Team, string> = { CT: '#4aa8ff', T: '#ffb43c' };
const ENEMY_COLOR = '#ff4a4a';

/**
 * Radar. The terrain (walkable cells shaded by height, crates, doors, callout labels) is
 * rasterised once into an off-screen canvas; every frame only the dynamic markers are drawn.
 * North is up, like the Dust2 radar.
 */
export class MinimapDrawer {
  private game: Game;
  private base: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  private scale: number;

  constructor(game: Game, width: number) {
    this.game = game;
    this.width = width;
    this.scale = width / game.map.width;
    this.height = Math.round(game.map.depth * this.scale);
    this.base = document.createElement('canvas');
    this.base.width = this.width;
    this.base.height = this.height;
    this.renderBase();
  }

  private renderBase(): void {
    const g = this.base.getContext('2d') as CanvasRenderingContext2D;
    const map = this.game.map;
    const s = this.scale;
    g.clearRect(0, 0, this.width, this.height);
    // floor cells, lighter = higher
    for (let z = 0; z < map.rows; z++) {
      for (let x = 0; x < map.cols; x++) {
        const h = map.terrain[z * map.cols + x];
        if (Number.isNaN(h)) continue;
        const v = Math.round(58 + (h / 2.4) * 28);
        g.fillStyle = `rgb(${v - 10},${v + 14},${v + 6})`;
        g.fillRect(x * s, z * s, Math.ceil(s) + 0.5, Math.ceil(s) + 0.5);
      }
    }
    // ramps are drawn as gradients so slopes read on the radar
    for (const r of this.game.world.ramps) {
      const grd = r.axis === 'x' ? g.createLinearGradient(r.x0 * s, 0, r.x1 * s, 0) : g.createLinearGradient(0, r.z0 * s, 0, r.z1 * s);
      const a = 58 + (r.hFrom / 2.4) * 28;
      const b = 58 + (r.hTo / 2.4) * 28;
      grd.addColorStop(0, `rgb(${a - 10},${a + 14},${a + 6})`);
      grd.addColorStop(1, `rgb(${b - 10},${b + 14},${b + 6})`);
      g.fillStyle = grd;
      g.fillRect(r.x0 * s, r.z0 * s, (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    }
    // crates
    for (const b of map.boxes) {
      if (b.kind !== 'crate') continue;
      g.fillStyle = 'rgba(20,28,26,0.85)';
      g.fillRect(b.minX * s, b.minZ * s, (b.maxX - b.minX) * s, (b.maxZ - b.minZ) * s);
      g.strokeStyle = 'rgba(150,170,160,0.35)';
      g.lineWidth = 0.6;
      g.strokeRect(b.minX * s + 0.3, b.minZ * s + 0.3, (b.maxX - b.minX) * s - 0.6, (b.maxZ - b.minZ) * s - 0.6);
    }
    // doors
    g.fillStyle = '#d9b24a';
    for (const d of map.doors) g.fillRect(d.x0 * s, d.z0 * s + (d.z1 - d.z0) * s * 0.35, (d.x1 - d.x0) * s, Math.max(1.5, (d.z1 - d.z0) * s * 0.3));
    // bombsite letters
    g.font = `bold ${Math.round(this.width * 0.13)}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,220,120,0.32)';
    for (const id of ['A', 'B'] as const) {
      const c = map.sites[id].center;
      g.fillText(id, c.x * s, c.z * s);
    }
    // callout labels
    g.font = `bold ${Math.max(8, Math.round(this.width * 0.045))}px Arial, sans-serif`;
    g.fillStyle = 'rgba(235,240,235,0.62)';
    const skip = new Set(['aSite', 'bSite', 'aRamp', 'ctB', 'midToB', 'lowerTunnels', 'bTunnelExit', 'ctMid', 'outsideLong']);
    for (const z of map.zones) {
      if (skip.has(z.id)) continue;
      const r = z.rects[0];
      g.fillText(z.label, ((r[0] + r[2]) / 2) * s, ((r[1] + r[3]) / 2) * s);
    }
  }

  private dot(g: CanvasRenderingContext2D, x: number, z: number, color: string, r: number): void {
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.beginPath();
    g.arc(x, z, r + 1.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, z, r, 0, Math.PI * 2);
    g.fill();
  }

  /** Draw the whole radar into `ctx` (which is width x height in size). */
  draw(ctx: CanvasRenderingContext2D, viewer: Character | null, time: number): void {
    const game = this.game;
    const s = this.scale;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(this.base, 0, 0);
    const team: Team = viewer ? viewer.team : game.cfg.playerTeam;

    // bomb
    const b = game.bomb;
    if (b.state === 'planted') {
      const pulse = 0.5 + 0.5 * Math.sin(time * 10);
      ctx.fillStyle = `rgba(255,60,60,${0.25 + 0.4 * pulse})`;
      ctx.beginPath();
      ctx.arc(b.pos.x * s, b.pos.z * s, 9 + pulse * 3, 0, Math.PI * 2);
      ctx.fill();
      this.bombIcon(ctx, b.pos.x * s, b.pos.z * s, '#ff3b3b');
    } else if (b.state === 'dropped') {
      this.bombIcon(ctx, b.pos.x * s, b.pos.z * s, '#ffd23c');
    }

    // dead teammates
    for (const c of game.chars) {
      if (c.alive || c.team !== team) continue;
      ctx.strokeStyle = 'rgba(200,200,200,0.55)';
      ctx.lineWidth = 1.4;
      const x = c.pos.x * s;
      const z = c.pos.z * s;
      ctx.beginPath();
      ctx.moveTo(x - 3, z - 3);
      ctx.lineTo(x + 3, z + 3);
      ctx.moveTo(x + 3, z - 3);
      ctx.lineTo(x - 3, z + 3);
      ctx.stroke();
    }

    // enemies that the team can currently see
    for (const c of game.chars) {
      if (!c.alive || c.team === team) continue;
      if (!game.isSpotted(c, team)) continue;
      this.dot(ctx, c.pos.x * s, c.pos.z * s, ENEMY_COLOR, 3.6);
    }

    // teammates (the bomb carrier gets a yellow ring for the Ts)
    for (const c of game.chars) {
      if (!c.alive || c.team !== team || c === viewer) continue;
      const x = c.pos.x * s;
      const z = c.pos.z * s;
      this.dot(ctx, x, z, TEAM_COLOR[team], 3.6);
      if (c.hasBomb && team === 'T') {
        ctx.strokeStyle = '#ffe14d';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(x, z, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // the viewer: arrow with a view cone
    if (viewer && viewer.alive) {
      const x = viewer.pos.x * s;
      const z = viewer.pos.z * s;
      const fx = -Math.sin(viewer.yaw);
      const fz = -Math.cos(viewer.yaw);
      const ang = Math.atan2(fz, fx);
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.beginPath();
      ctx.moveTo(x, z);
      ctx.arc(x, z, 26, ang - 0.7, ang + 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, 5);
      ctx.lineTo(-2.5, 0);
      ctx.lineTo(-5, -5);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
      if (viewer.hasBomb) {
        ctx.strokeStyle = '#ffe14d';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(x, z, 7.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private bombIcon(ctx: CanvasRenderingContext2D, x: number, z: number, color: string): void {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 6.5, z - 4.5, 13, 9);
    ctx.fillStyle = color;
    ctx.fillRect(x - 5.5, z - 3.5, 11, 7);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 6px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C4', x, z + 0.5);
  }
}
