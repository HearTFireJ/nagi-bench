/**
 * Master edit decision list (seconds). Shot boundaries, key events and the film
 * length live here so that shots, sound cues and overlays all agree.
 */
export const DURATION = 344;

export type Span = readonly [start: number, end: number];

export const T = {
  // 序
  p1: [0, 11] as Span,
  p2: [11, 17.4] as Span,
  title: [17.4, 22.0] as Span,

  // 一 · 胡同深处
  a1: [22.0, 26.0] as Span,
  a2: [26.0, 28.6] as Span,
  a3: [28.6, 34.2] as Span,
  a4: [34.2, 36.4] as Span,
  a5: [36.4, 42.0] as Span,
  a6: [42.0, 44.8] as Span,
  a7: [44.8, 47.4] as Span,
  a7b: [47.4, 50.2] as Span,
  a8: [50.2, 58.0] as Span,
  a9: [58.0, 62.0] as Span,
  a10: [62.0, 65.2] as Span,
  a10b: [65.2, 67.0] as Span,
  a11: [67.0, 70.0] as Span,
  a12: [70.0, 75.8] as Span,
  a13: [75.8, 81.0] as Span,
  a14: [81.0, 84.4] as Span,
  a15: [84.4, 87.2] as Span,
  a16: [87.2, 91.6] as Span,
  a17: [91.6, 96.0] as Span,
  a18: [96.0, 98.6] as Span,
  a19: [98.6, 101.4] as Span,
  a20: [101.4, 105.6] as Span,
  a21: [105.6, 110.0] as Span,

  // 二 · 车间与地下室
  b1: [110.0, 114.2] as Span,
  b2: [114.2, 119.4] as Span,
  b3: [119.4, 125.4] as Span,
  b4: [125.4, 130.4] as Span,
  b5: [130.4, 135.6] as Span,
  b6: [135.6, 138.6] as Span,
  c1: [138.6, 143.2] as Span,
  c2: [143.2, 149.2] as Span,
  c3: [149.2, 155.2] as Span,
  c4a: [155.2, 157.5] as Span,
  c4b: [157.5, 160.4] as Span,
  c5: [160.4, 164.0] as Span,
  c6a: [164.0, 166.8] as Span,
  c6b: [166.8, 170.2] as Span,
  c7: [170.2, 176.0] as Span,

  // 三 · 轨道，日落
  d1: [176.0, 179.6] as Span,
  d1b: [179.6, 183.0] as Span,
  d2: [183.0, 191.0] as Span,
  d3: [191.0, 203.0] as Span,
  d4: [203.0, 210.4] as Span,
  d4b: [210.4, 214.0] as Span,
  d5: [214.0, 217.8] as Span,
  d5b: [217.8, 223.0] as Span,
  d6a: [223.0, 227.6] as Span,
  d6b: [227.6, 233.0] as Span,
  d7a: [233.0, 239.2] as Span,
  d7b: [239.2, 241.4] as Span,
  d7c: [241.4, 244.2] as Span,
  d7d: [244.2, 248.0] as Span,
  d8: [248.0, 252.4] as Span,
  d8b: [252.4, 257.0] as Span,
  d8c: [257.0, 261.0] as Span,
  d9: [261.0, 264.2] as Span,
  d9r1: [264.2, 265.07] as Span,
  d9r2: [265.07, 265.93] as Span,
  d9r3: [265.93, 266.8] as Span,
  d9c: [266.8, 271.0] as Span,
  d10: [271.0, 274.6] as Span,
  d10b: [274.6, 278.0] as Span,
  d11a: [278.0, 280.6] as Span,
  d11b: [280.6, 281.4] as Span,
  d11c: [281.4, 283.3] as Span,
  d11d: [283.3, 284.0] as Span,
  d11e: [284.0, 285.6] as Span,
  d12a: [285.6, 287.2] as Span,
  d12b: [287.2, 288.4] as Span,
  d13a: [288.4, 291.6] as Span,
  d13b: [291.6, 293.4] as Span,
  d13c: [293.4, 296.2] as Span,
  d13d: [296.2, 299.4] as Span,
  d13e: [299.4, 302.0] as Span,
  d14a: [302.0, 308.8] as Span,
  d14b: [308.8, 314.6] as Span,
  d14c: [314.6, 318.0] as Span,

  // 尾声
  e1: [319.0, 330.0] as Span,
  e2: [330.0, 337.0] as Span,
  end: [337.0, 344.0] as Span,
};

/** Key events referenced by more than one system. */
export const EV = {
  knock1: 26.7,
  knock2: 27.4,
  knock3: 34.1,
  doorOpen: 36.7,
  payment: 97.0,
  // machine shop
  cutStart: 120.0,
  cutEnd: 125.0,
  // basement test shots
  testShots: [157.7, 157.98, 158.26, 158.54] as const,
  // orbit
  airlockOpen: 185.6,
  lampGreen: 224.4,
  doorSlide: [224.9, 227.6] as const,
  gloveOff: 262.2,
  /** Thirty shots: three magazines of ten. */
  fireStart: [278.5, 281.0, 283.5] as const,
  shotGap: 0.19,
  flight: 10.0,
};

/** All thirty muzzle-flash times. */
export const SHOT_TIMES: number[] = EV.fireStart.flatMap((s) => Array.from({ length: 10 }, (_, i) => s + i * EV.shotGap));
