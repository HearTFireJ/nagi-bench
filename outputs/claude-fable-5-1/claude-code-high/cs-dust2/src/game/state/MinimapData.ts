import type { Team } from '../weapons/WeaponDefs';

export interface MinimapEntity {
  x: number;
  z: number;
  yaw: number;
  alive: boolean;
  name: string;
  isViewer: boolean;
}

export interface MinimapData {
  team: Team;
  viewer: MinimapEntity | null;
  allies: MinimapEntity[];
  /** Enemy positions currently (or very recently) seen by any teammate. */
  enemies: { x: number; z: number; fresh: boolean }[];
  c4: { x: number; z: number; state: 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded'; carriedByViewerTeam: boolean } | null;
  time: number;
}
