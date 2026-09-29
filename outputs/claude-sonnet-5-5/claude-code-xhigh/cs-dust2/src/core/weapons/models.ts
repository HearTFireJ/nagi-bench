// Procedural weapon model specs. Pure data: the renderer turns these into meshes
// (both for the first-person viewmodel and the weapon in a bot's hands), so adding a
// weapon never requires touching render code. Model space: +X right, +Y up, -Z forward
// (muzzle points to -Z), origin ~ where the shooting hand holds the grip. Units: metres.

export interface ModelPart {
  shape: 'box' | 'cyl';
  /** box: [w,h,d]; cyl: [radius, length, _] with the axis along Z */
  size: [number, number, number];
  pos: [number, number, number];
  color: number;
  /** euler XYZ, radians */
  rot?: [number, number, number];
  /** tag used by animation code: 'mag' | 'slide' | 'bolt' | 'blade' | 'lens' */
  tag?: string;
  emissive?: boolean;
}

export type HoldStyle = 'rifle' | 'sniper' | 'pistol' | 'knife';

export interface WeaponModelSpec {
  parts: ModelPart[];
  /** muzzle position (flash / tracer origin) */
  muzzle: [number, number, number];
  hold: HoldStyle;
  /** viewmodel placement relative to the camera */
  view: { pos: [number, number, number]; scale: number };
}

const box = (size: [number, number, number], pos: [number, number, number], color: number, extra: Partial<ModelPart> = {}): ModelPart => ({ shape: 'box', size, pos, color, ...extra });
const cyl = (radius: number, length: number, pos: [number, number, number], color: number, extra: Partial<ModelPart> = {}): ModelPart => ({ shape: 'cyl', size: [radius, length, 0], pos, color, ...extra });

const WOOD = 0x8a4b1f;
const WOOD_DARK = 0x6b3a18;
const GUNMETAL = 0x2b2b2e;
const DARK = 0x1b1b1d;
const STEEL = 0x9da1a8;

export const MODEL_AK47: WeaponModelSpec = {
  hold: 'rifle',
  muzzle: [0, 0.02, -0.82],
  view: { pos: [0.16, -0.19, -0.42], scale: 0.85 },
  parts: [
    box([0.06, 0.09, 0.34], [0, 0, -0.05], GUNMETAL),
    box([0.05, 0.02, 0.3], [0, 0.055, -0.06], 0x3a3a3d),
    box([0.072, 0.07, 0.24], [0, -0.005, -0.34], WOOD),
    box([0.055, 0.03, 0.22], [0, 0.047, -0.34], WOOD_DARK),
    cyl(0.012, 0.3, [0, 0.02, -0.62], 0x1e1e20),
    cyl(0.008, 0.3, [0, 0.055, -0.5], 0x2a2a2c),
    box([0.01, 0.045, 0.012], [0, 0.05, -0.74], DARK),
    cyl(0.017, 0.05, [0, 0.02, -0.79], DARK),
    box([0.05, 0.11, 0.26], [0, -0.03, 0.26], WOOD, { rot: [0.08, 0, 0] }),
    box([0.04, 0.12, 0.05], [0, -0.11, 0.07], DARK, { rot: [0.32, 0, 0] }),
    box([0.046, 0.15, 0.06], [0, -0.13, -0.09], DARK, { rot: [0.12, 0, 0], tag: 'mag' }),
    box([0.046, 0.1, 0.06], [0, -0.245, -0.05], DARK, { rot: [0.5, 0, 0], tag: 'mag' }),
  ],
};

export const MODEL_M4A4: WeaponModelSpec = {
  hold: 'rifle',
  muzzle: [0, 0.006, -0.74],
  view: { pos: [0.16, -0.19, -0.4], scale: 0.85 },
  parts: [
    box([0.055, 0.1, 0.3], [0, 0, -0.05], GUNMETAL),
    box([0.04, 0.02, 0.32], [0, 0.06, -0.05], 0x18181a),
    box([0.03, 0.05, 0.04], [0, 0.088, 0.05], DARK),
    box([0.012, 0.03, 0.012], [0, 0.085, -0.28], DARK),
    box([0.066, 0.066, 0.28], [0, 0, -0.34], 0x37373c),
    cyl(0.011, 0.2, [0, 0.006, -0.58], 0x1e1e20),
    cyl(0.018, 0.06, [0, 0.006, -0.7], DARK),
    box([0.03, 0.03, 0.13], [0, 0.012, 0.19], 0x232326),
    box([0.046, 0.085, 0.16], [0, -0.012, 0.29], 0x2c2c30),
    box([0.04, 0.11, 0.05], [0, -0.1, 0.08], DARK, { rot: [0.3, 0, 0] }),
    box([0.04, 0.16, 0.062], [0, -0.13, -0.05], 0x1a1a1c, { rot: [0.08, 0, 0], tag: 'mag' }),
  ],
};

export const MODEL_AWP: WeaponModelSpec = {
  hold: 'sniper',
  muzzle: [0, 0.02, -1.03],
  view: { pos: [0.15, -0.2, -0.46], scale: 0.8 },
  parts: [
    box([0.06, 0.1, 0.56], [0, 0, -0.1], 0x4a5a38),
    cyl(0.014, 0.6, [0, 0.022, -0.68], 0x2a2a2c),
    cyl(0.021, 0.08, [0, 0.022, -0.98], DARK),
    box([0.056, 0.125, 0.34], [0, -0.02, 0.36], 0x4a5a38, { rot: [0.05, 0, 0] }),
    box([0.05, 0.03, 0.16], [0, 0.065, 0.38], 0x3c4a2d),
    // scope
    cyl(0.03, 0.34, [0, 0.118, -0.1], 0x121214),
    cyl(0.04, 0.07, [0, 0.118, -0.3], 0x18181a),
    cyl(0.034, 0.05, [0, 0.118, 0.09], 0x18181a),
    cyl(0.028, 0.004, [0, 0.118, -0.337], 0x2a4a80, { tag: 'lens', emissive: true }),
    box([0.03, 0.03, 0.03], [0, 0.082, -0.02], DARK),
    box([0.03, 0.03, 0.03], [0, 0.082, -0.22], DARK),
    // bolt handle
    box([0.06, 0.016, 0.016], [0.045, 0.045, 0.03], STEEL, { tag: 'bolt' }),
    box([0.02, 0.02, 0.02], [0.08, 0.045, 0.03], DARK, { tag: 'bolt' }),
    box([0.04, 0.07, 0.09], [0, -0.09, -0.05], DARK, { tag: 'mag' }),
    box([0.04, 0.11, 0.05], [0, -0.09, 0.16], DARK, { rot: [0.35, 0, 0] }),
  ],
};

export const MODEL_GLOCK: WeaponModelSpec = {
  hold: 'pistol',
  muzzle: [0, 0.022, -0.15],
  view: { pos: [0.13, -0.15, -0.34], scale: 1 },
  parts: [
    box([0.032, 0.036, 0.19], [0, 0.022, -0.03], 0x222226, { tag: 'slide' }),
    box([0.03, 0.006, 0.006], [0, 0.043, -0.12], 0xffffff, { tag: 'slide' }),
    box([0.034, 0.03, 0.17], [0, -0.008, -0.02], 0x3a3a40),
    box([0.032, 0.1, 0.05], [0, -0.075, 0.045], 0x2c2c31, { rot: [0.2, 0, 0] }),
    box([0.014, 0.014, 0.03], [0, 0.022, -0.135], DARK),
    box([0.03, 0.03, 0.02], [0, -0.03, -0.01], 0x2c2c31),
  ],
};

export const MODEL_USP: WeaponModelSpec = {
  hold: 'pistol',
  muzzle: [0, 0.022, -0.3],
  view: { pos: [0.13, -0.15, -0.36], scale: 1 },
  parts: [
    box([0.034, 0.04, 0.2], [0, 0.024, -0.03], 0xa2a2a8, { tag: 'slide' }),
    box([0.036, 0.03, 0.18], [0, -0.008, -0.02], 0x2b2b2f),
    cyl(0.018, 0.17, [0, 0.022, -0.2], 0x1d1d20),
    box([0.034, 0.1, 0.055], [0, -0.075, 0.05], 0x222225, { rot: [0.2, 0, 0] }),
    box([0.03, 0.03, 0.02], [0, -0.03, -0.01], 0x2b2b2f),
  ],
};

export const MODEL_DEAGLE: WeaponModelSpec = {
  hold: 'pistol',
  muzzle: [0, 0.032, -0.27],
  view: { pos: [0.13, -0.15, -0.36], scale: 1 },
  parts: [
    box([0.042, 0.052, 0.27], [0, 0.03, -0.05], 0xcfcfd5, { tag: 'slide' }),
    box([0.044, 0.04, 0.23], [0, -0.008, -0.04], 0x8d8d92),
    box([0.03, 0.032, 0.08], [0, 0.03, -0.22], 0xb8b8be),
    box([0.014, 0.01, 0.23], [0, 0.062, -0.05], 0x333336),
    box([0.044, 0.11, 0.062], [0, -0.08, 0.06], 0x1d1d1f, { rot: [0.2, 0, 0] }),
    box([0.03, 0.03, 0.02], [0, -0.03, -0.02], 0x8d8d92),
  ],
};

export const MODEL_KNIFE: WeaponModelSpec = {
  hold: 'knife',
  muzzle: [0, 0, -0.3],
  view: { pos: [0.15, -0.16, -0.36], scale: 1.1 },
  parts: [
    box([0.006, 0.04, 0.21], [0, -0.004, -0.15], 0xc9cdd3, { tag: 'blade' }),
    box([0.009, 0.012, 0.2], [0, 0.02, -0.15], 0x8a8f96, { tag: 'blade' }),
    box([0.008, 0.02, 0.05], [0, -0.006, -0.275], 0xc9cdd3, { rot: [0.5, 0, 0], tag: 'blade' }),
    box([0.032, 0.055, 0.012], [0, 0, -0.035], 0x232326),
    box([0.026, 0.032, 0.11], [0, 0, 0.03], 0x2a2a2d),
    box([0.03, 0.036, 0.02], [0, 0, 0.09], 0x232326),
  ],
};
