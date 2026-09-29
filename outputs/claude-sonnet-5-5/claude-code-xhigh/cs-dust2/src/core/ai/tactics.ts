import type { Game } from '../game/game.ts';
import type { Character } from '../entities/character.ts';
import type { Vec2 } from '../math.ts';
import type { PlanStep } from './brain.ts';
import type { SiteId } from '../game/events.ts';

/**
 * Team level decisions. Runs at round start (pick a strategy, hand every bot a route)
 * and when the bomb is planted (Ts turn into defenders, CTs into a retake).
 * Routes are ordered anchor names from the map; the bots turn them into A* paths.
 */

interface Strategy {
  id: string;
  site: SiteId;
  weight: number;
  /** one route name per T (in order, the bomb carrier is moved to a plantable route) */
  routes: string[];
}

const T_STRATEGIES: Strategy[] = [
  { id: 'A_RUSH', site: 'A', weight: 3, routes: ['T_A_LONG', 'T_A_LONG', 'T_A_CAT', 'T_A_LONG', 'T_A_CAT'] },
  { id: 'B_RUSH', site: 'B', weight: 3, routes: ['T_B_TUNNELS', 'T_B_TUNNELS', 'T_B_TUNNELS', 'T_B_LOWER', 'T_B_TUNNELS'] },
  { id: 'A_SPLIT', site: 'A', weight: 2, routes: ['T_A_LONG', 'T_A_CAT', 'T_A_LONG', 'T_A_CAT', 'T_MID'] },
  { id: 'B_SPLIT', site: 'B', weight: 2, routes: ['T_B_TUNNELS', 'T_B_MID', 'T_B_TUNNELS', 'T_B_MID', 'T_B_LOWER'] },
  { id: 'MID_B', site: 'B', weight: 1, routes: ['T_B_MID', 'T_B_MID', 'T_B_TUNNELS', 'T_B_MID', 'T_MID'] },
];

function step(x: number, z: number, hold = 0, extra: Partial<PlanStep> = {}): PlanStep {
  return { x, z, hold, ...extra };
}

/** Nudge a point to a nearby walkable spot so bots don't all stand on the same cell. */
function jitter(game: Game, p: Vec2, r: number): Vec2 {
  for (let i = 0; i < 6; i++) {
    const x = p.x + game.rng.range(-r, r);
    const z = p.z + game.rng.range(-r, r);
    if (game.nav.isWalkable(x, z) && game.nav.clearanceAt(x, z) > 0.8) return { x, z };
  }
  return p;
}

export function assignTactics(game: Game): void {
  assignT(game);
  assignCT(game);
}

function pickStrategy(game: Game): Strategy {
  const total = T_STRATEGIES.reduce((s, x) => s + x.weight, 0);
  let r = game.rng.next() * total;
  for (const s of T_STRATEGIES) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return T_STRATEGIES[0];
}

function assignT(game: Game): void {
  const strat = pickStrategy(game);
  const site = game.map.sites[strat.site];
  const ts = game.chars.filter((c) => c.team === 'T');
  // the carrier must walk a plantable route (never the lurk route)
  const routes = [...strat.routes];
  const carrierIdx = ts.findIndex((c) => c.hasBomb);
  if (carrierIdx >= 0 && routes[carrierIdx % routes.length] === 'T_MID') {
    const swap = routes.findIndex((r) => r !== 'T_MID');
    routes[carrierIdx % routes.length] = routes[swap];
    routes[swap] = 'T_MID';
  }
  // the whole team commits at the same moment (default -> execute)
  const executeAt = game.rng.range(16, 32);
  ts.forEach((c, i) => {
    if (c.isHuman || !c.brain) return;
    const routeName = routes[i % routes.length];
    const route = game.map.routes[routeName];
    const pts = route.slice(1).map((a) => game.map.anchors[a]);
    const plan: PlanStep[] = [];
    let patrol: PlanStep[] = [];
    if (routeName === 'T_MID') {
      // lurker: hold mid, later joins the site once the bomb is down
      for (const p of pts) plan.push(step(p.x, p.z, 0));
      const top = game.map.anchors.MID_TOP;
      const xbox = game.map.anchors.MID_XBOX;
      patrol = [step(top.x + 2, top.z, 9, { look: game.map.anchors.MID_DOORS }), step(xbox.x, xbox.z, 7)];
    } else {
      pts.forEach((p, k) => {
        const isLast = k === pts.length - 1;
        // one anchor of every route is the rally point where the team waits for the execute call
        // (long A has a straight sight line down the corridor, so its rally point is further back)
        const rallyK = routeName === 'T_A_LONG' ? 0 : 1;
        if (!isLast) plan.push(step(p.x, p.z, 0, k === rallyK ? { waitUntil: executeAt, look: pts[Math.min(pts.length - 1, k + 1)] } : {}));
      });
      if (c.hasBomb) {
        const spot = game.rng.pick(site.plantSpots);
        plan.push(step(spot.x, spot.z, 0, { action: 'plant', site: site.id }));
      } else {
        const g1 = jitter(game, site.guardSpots[i % site.guardSpots.length], 1.5);
        plan.push(step(g1.x, g1.z, 5, { look: site.center }));
        patrol = site.guardSpots.map((s) => step(s.x, s.z, 6, { look: site.center }));
      }
    }
    c.brain.role = `T:${strat.id}:${routeName}`;
    c.brain.setPlan(plan, patrol);
  });
}

function assignCT(game: Game): void {
  const A = game.map.sites.A;
  const B = game.map.sites.B;
  const an = game.map.anchors;
  // defensive posts: [hold, alternate hold]
  const post = {
    A_SITE: { role: 'A_SITE', a: A.defendSpots[0], b: A.defendSpots[2] },
    A_LONG: { role: 'A_LONG', a: an.LONG_CORNER, b: A.defendSpots[1] },
    A_RAMP: { role: 'A_RAMP', a: A.defendSpots[2], b: A.defendSpots[3] },
    B_SITE: { role: 'B_SITE', a: B.defendSpots[0], b: B.defendSpots[1] },
    B_TUNNEL: { role: 'B_TUNNEL', a: B.defendSpots[3], b: B.defendSpots[2] },
    B_DOOR: { role: 'B_DOOR', a: B.defendSpots[1], b: B.defendSpots[0] },
    MID: { role: 'MID', a: { x: 60, z: 34 }, b: an.MID_DOORS },
  };
  // the CTs do not know where the Ts go: they pick a setup (balanced, A-heavy or B-heavy) each round
  const setups: { w: number; posts: (keyof typeof post)[] }[] = [
    { w: 3, posts: ['A_SITE', 'A_LONG', 'B_SITE', 'B_TUNNEL', 'MID'] },
    { w: 2, posts: ['A_SITE', 'A_LONG', 'A_RAMP', 'B_SITE', 'MID'] },
    { w: 2, posts: ['A_SITE', 'B_SITE', 'B_TUNNEL', 'B_DOOR', 'MID'] },
    { w: 1, posts: ['A_SITE', 'A_LONG', 'B_SITE', 'B_TUNNEL', 'B_DOOR'] },
  ];
  let roll = game.rng.next() * setups.reduce((s, x) => s + x.w, 0);
  let setup = setups[0];
  for (const s of setups) {
    roll -= s.w;
    if (roll <= 0) {
      setup = s;
      break;
    }
  }
  const posts = setup.posts.map((k) => post[k]);
  const bots = game.chars.filter((c) => c.team === 'CT' && !c.isHuman && c.brain);
  bots.forEach((c, i) => {
    const p = posts[i % posts.length];
    const a = jitter(game, p.a, 1.2);
    const b = jitter(game, p.b, 1.2);
    const toSpawnRoute = p.role.startsWith('A') ? an.A_RAMP : p.role === 'MID' ? an.CT_MID : an.CT_B;
    const plan = [step(toSpawnRoute.x, toSpawnRoute.z, 0), step(a.x, a.z, 10 + game.rng.range(0, 6), { look: lookFor(game, p.role) })];
    const patrol = [step(b.x, b.z, 8 + game.rng.range(0, 5), { look: lookFor(game, p.role) }), step(a.x, a.z, 10 + game.rng.range(0, 6), { look: lookFor(game, p.role) })];
    (c.brain as NonNullable<Character['brain']>).role = `CT:${p.role}`;
    (c.brain as NonNullable<Character['brain']>).setPlan(plan, patrol);
  });
}

/** Where a defender at this post expects the enemy to come from. */
function lookFor(game: Game, role: string): Vec2 {
  const an = game.map.anchors;
  switch (role) {
    case 'A_SITE':
    case 'A_RAMP':
      return an.CAT_TOP;
    case 'A_LONG':
      return an.LONG_MID;
    case 'B_SITE':
      return an.B_RAMP_W;
    case 'B_TUNNEL':
    case 'B_DOOR':
      return an.B_LOBBY;
    default:
      return an.MID_TOP;
  }
}

/** Map a callout zone to the bombsite it belongs to (null = neutral ground such as mid). */
export function siteOfZone(zoneId: string | undefined): SiteId | null {
  switch (zoneId) {
    case 'aSite':
    case 'aRamp':
    case 'catwalk':
    case 'longA':
    case 'outsideLong':
      return 'A';
    case 'bSite':
    case 'bTunnelExit':
    case 'ctB':
    case 'midToB':
    case 'lowerTunnels':
    case 'bTunnels':
      return 'B';
    default:
      return null;
  }
}

/**
 * The fuse is nearly burnt: Ts standing close to the C4 run out of the blast radius
 * (to a fall-back anchor at least ~30 m from the bomb).
 */
export function fleeBomb(game: Game): void {
  const b = game.bomb;
  if (b.state !== 'planted') return;
  const an = game.map.anchors;
  const names = b.site === 'A' ? ['LONG_MID', 'CAT_BOTTOM', 'OUT_LONG', 'MID_TOP'] : ['B_LOBBY', 'UP_TUNNEL_N', 'MID_TO_B', 'CT_B'];
  const safe = names.map((n) => an[n]).filter((p) => Math.hypot(p.x - b.pos.x, p.z - b.pos.z) >= 26);
  if (safe.length === 0) return;
  for (const c of game.chars) {
    if (!c.alive || c.team !== 'T' || c.isHuman || !c.brain) continue;
    if (Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z) > 24) continue;
    let best = safe[0];
    let bestD = Infinity;
    for (const p of safe) {
      const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    c.brain.setPlan([step(best.x, best.z, 999)], []);
  }
}

/**
 * Radio call: an enemy was seen at (x,z). Idle CTs from the other side of the map rotate
 * towards that bombsite (with some probability, and never twice within a short time).
 * Returns the plan the bot should follow, or null to stay put.
 */
export function rotationPlan(game: Game, c: Character, x: number, z: number): { plan: PlanStep[]; patrol: PlanStep[] } | null {
  const guess = siteOfZone(game.zoneOf(x, z)?.id);
  if (!guess) return null;
  const role = c.brain?.role ?? '';
  const mine: SiteId | null = role.includes('A_') ? 'A' : role.includes('B_') ? 'B' : null;
  if (mine === guess) return null;
  const site = game.map.sites[guess];
  const sorted = [...site.defendSpots].sort((a, b) => Math.hypot(a.x - c.pos.x, a.z - c.pos.z) - Math.hypot(b.x - c.pos.x, b.z - c.pos.z));
  const a = jitter(game, sorted[0], 1.5);
  const b = jitter(game, sorted[1], 1.5);
  const look = { x, z };
  return {
    plan: [step(a.x, a.z, 9, { look })],
    patrol: [step(b.x, b.z, 7, { look }), step(a.x, a.z, 9, { look })],
  };
}

/** The bomb is down: Ts dig in around it, CTs go for the retake. */
export function onBombPlanted(game: Game): void {
  const b = game.bomb;
  if (!b.site) return;
  const site = game.map.sites[b.site];
  const bombPos: Vec2 = { x: b.pos.x, z: b.pos.z };

  const ts = game.chars.filter((c) => c.alive && c.team === 'T' && !c.isHuman && c.brain);
  const spots = game.rng.shuffle([...site.guardSpots]);
  ts.forEach((c, i) => {
    const s = spots[i % spots.length];
    const p = jitter(game, s, 1.5);
    (c.brain as NonNullable<Character['brain']>).setPlan([step(p.x, p.z, 999, { look: bombPos })], []);
  });

  const cts = game.chars.filter((c) => c.alive && c.team === 'CT' && !c.isHuman && c.brain);
  cts.forEach((c) => {
    // cover positions first, then close in on the bomb
    // staging spots just outside the site (out of the guards' sight), nearest one to this bot
    const an = game.map.anchors;
    const staging = b.site === 'A' ? [an.A_RAMP, an.CAT_MID, an.LONG_CORNER] : [an.CT_B, an.B_RAMP_E, an.B_LOBBY];
    let bestSpot = staging[0];
    let bestD = Infinity;
    for (const s of staging) {
      const d = Math.hypot(s.x - c.pos.x, s.z - c.pos.z);
      if (d < bestD && game.rng.chance(0.8)) {
        bestD = d;
        bestSpot = s;
      }
    }
    const p = jitter(game, bestSpot, 1.5);
    const near = jitter(game, bombPos, 3);
    // group up at the staging spot, then everybody commits together when the fuse reaches ~26 s
    const commit = 25 + game.rng.range(0, 3);
    (c.brain as NonNullable<Character['brain']>).setPlan(
      [step(p.x, p.z, 0, { look: bombPos, waitBombLeft: commit }), step(near.x, near.z, 999, { look: bombPos })],
      [],
    );
  });
}
