// Team-level tactics: which routes T take at the start of a round and where CT hold. Everything refers to named map anchors
// (map/layout.ts), which are snapped to the nav grid, so plans automatically follow the real Dust2 lanes.
import type { Rng } from '../../core/math';
import type { SiteId, Team } from '../types';

/** Ordered anchors a bot walks through. The last anchor is inside / next to a bombsite or a CT position. */
export const ROUTES = {
  LONG_A: ['T_EAST_EXIT', 'OUTSIDE_LONG', 'LONG_DOORS', 'LONG_MID', 'LONG_CORNER', 'LONG_TOP', 'A_SITE'],
  SHORT_A: ['T_RAMP', 'LOWER_MID', 'MID', 'TOP_MID', 'CATWALK', 'SHORT_BOTTOM', 'SHORT_TOP', 'A_SITE'],
  B_TUNNELS: ['TUNNEL_COURT', 'B_TUNNEL_UPPER', 'B_TUNNEL_LOWER', 'B_TUNNEL_EXIT', 'B_SITE'],
  MID_TO_B: ['T_RAMP', 'LOWER_MID', 'MID', 'TOP_MID', 'MID_TO_B', 'MID_TO_B_TURN', 'B_SITE'],
  MID_PUSH: ['T_RAMP', 'LOWER_MID', 'MID', 'TOP_MID', 'MID_DOORS_T', 'MID_DOORS_CT'],
} as const;

export type RouteName = keyof typeof ROUTES;

export interface HoldSpot {
  anchor: string;
  /** Anchor the bot keeps facing while holding. */
  look: string;
}

export interface BotPlan {
  team: Team;
  route: readonly string[];
  routeName: string;
  /** T: the site this bot's group is heading for. */
  site: SiteId | null;
  /** CT: static hold position. */
  hold: HoldSpot | null;
  lurker: boolean;
}

interface Strategy {
  name: string;
  site: SiteId;
  groups: { route: RouteName; count: number }[];
  weight: number;
}

const STRATEGIES: Strategy[] = [
  { name: 'rush A long', site: 'A', groups: [{ route: 'LONG_A', count: 3 }, { route: 'SHORT_A', count: 2 }], weight: 3 },
  { name: 'split A', site: 'A', groups: [{ route: 'LONG_A', count: 2 }, { route: 'SHORT_A', count: 2 }, { route: 'MID_PUSH', count: 1 }], weight: 2 },
  { name: 'rush B tunnels', site: 'B', groups: [{ route: 'B_TUNNELS', count: 3 }, { route: 'MID_TO_B', count: 2 }], weight: 3 },
  { name: 'default B', site: 'B', groups: [{ route: 'B_TUNNELS', count: 2 }, { route: 'MID_TO_B', count: 2 }, { route: 'MID_PUSH', count: 1 }], weight: 2 },
  { name: 'mid to A', site: 'A', groups: [{ route: 'SHORT_A', count: 3 }, { route: 'LONG_A', count: 2 }], weight: 2 },
];

const CT_SETUPS: HoldSpot[][] = [
  // 2 A / 2 B / 1 mid
  [
    { anchor: 'A_SITE', look: 'LONG_TOP' },
    { anchor: 'LONG_TOP', look: 'LONG_MID' },
    { anchor: 'B_SITE', look: 'B_TUNNEL_EXIT' },
    { anchor: 'B_TUNNEL_EXIT', look: 'B_TUNNEL_LOWER' },
    { anchor: 'MID_DOORS_CT', look: 'MID_DOORS_T' },
  ],
  // 3 A / 1 B / 1 mid
  [
    { anchor: 'A_SITE', look: 'SHORT_BOTTOM' },
    { anchor: 'LONG_TOP', look: 'LONG_MID' },
    { anchor: 'A_RAMP_TOP', look: 'SHORT_TOP' },
    { anchor: 'B_SITE', look: 'B_TUNNEL_EXIT' },
    { anchor: 'MID_DOORS_CT', look: 'MID_DOORS_T' },
  ],
  // 1 A / 3 B / 1 mid
  [
    { anchor: 'A_SITE', look: 'LONG_TOP' },
    { anchor: 'B_SITE', look: 'B_TUNNEL_EXIT' },
    { anchor: 'B_TUNNEL_EXIT', look: 'B_TUNNEL_LOWER' },
    { anchor: 'B_WINDOW', look: 'MID_TO_B_TURN' },
    { anchor: 'MID_DOORS_CT', look: 'MID_DOORS_T' },
  ],
  // stacked mid + A
  [
    { anchor: 'A_SITE', look: 'SHORT_TOP' },
    { anchor: 'LONG_TOP', look: 'LONG_MID' },
    { anchor: 'MID_DOORS_CT', look: 'MID_DOORS_T' },
    { anchor: 'B_SITE', look: 'B_TUNNEL_EXIT' },
    { anchor: 'B_DOORS_CT', look: 'B_DOORS' },
  ],
];

/** Where T guard after planting: hold spot + what to look at. */
export const POST_PLANT: Record<SiteId, HoldSpot[]> = {
  A: [
    { anchor: 'LONG_TOP', look: 'LONG_MID' },
    { anchor: 'SHORT_TOP', look: 'SHORT_BOTTOM' },
    { anchor: 'A_RAMP_TOP', look: 'CT_RAMP' },
    { anchor: 'A_BACK', look: 'A_RAMP_TOP' },
    { anchor: 'A_SITE', look: 'A_RAMP_TOP' },
  ],
  B: [
    { anchor: 'B_TUNNEL_EXIT', look: 'B_TUNNEL_LOWER' },
    { anchor: 'B_WINDOW', look: 'MID_TO_B_TURN' },
    { anchor: 'B_DOORS', look: 'B_DOORS_CT' },
    { anchor: 'B_BACK', look: 'B_DOORS' },
    { anchor: 'B_SITE', look: 'B_DOORS' },
  ],
};

export const PLANT_ANCHOR: Record<SiteId, string> = { A: 'A_PLANT', B: 'B_PLANT' };

export interface TeamTactic {
  name: string;
  plans: BotPlan[];
}

/** Choose the T strategy for a round and hand each bot a route. `order` lists the actor ids (carrier first). */
export const planTerrorists = (rng: Rng, count: number): TeamTactic => {
  const total = STRATEGIES.reduce((s, x) => s + x.weight, 0);
  let roll = rng.next() * total;
  let strat = STRATEGIES[0];
  for (const s of STRATEGIES) {
    roll -= s.weight;
    if (roll <= 0) {
      strat = s;
      break;
    }
  }
  const plans: BotPlan[] = [];
  for (const g of strat.groups) {
    for (let i = 0; i < g.count; i++) {
      plans.push({ team: 'T', route: ROUTES[g.route], routeName: g.route, site: strat.site, hold: null, lurker: g.route === 'MID_PUSH' });
    }
  }
  while (plans.length < count) plans.push({ ...plans[0] });
  plans.length = count;
  return { name: strat.name, plans };
};

export const planCounterTerrorists = (rng: Rng, count: number): TeamTactic => {
  const setup = CT_SETUPS[rng.int(CT_SETUPS.length)];
  const spots = setup.slice(0, count);
  const plans: BotPlan[] = spots.map((hold) => ({ team: 'CT', route: [hold.anchor], routeName: 'HOLD', site: null, hold, lurker: false }));
  return { name: 'CT setup', plans };
};
