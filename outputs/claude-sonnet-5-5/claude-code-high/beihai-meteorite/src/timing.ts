/** Key absolute times (seconds) shared by sets, actors, sound and shots. */
export const T = {
  duration: 356,

  // prologue / title
  titleIn: 19.6,
  titleOut: 24.4,

  // alley + house entrance
  alley0: 25,
  house0: 37,
  doorOpen0: 37.2,
  doorOpen1: 38.4,

  // conversation
  talk0: 47,
  safeOpen0: 78.4,
  safeOpen1: 79.6,
  talk1: 118,

  // workshop
  shop0: 118,
  shopLight: 121.2,
  shopDoor0: 125.2,
  shopDoor1: 126.0,
  shopClose0: 128.6,
  shopClose1: 129.4,
  drill0: 129.9,
  drill1: 134.4,
  saw0: 134.8,
  saw1: 140.0,
  shopOpen0: 140.8,
  shopOpen1: 141.6,
  toolOut: 144.0,
  shopDark: 146.2,

  basement0: 148,
  bDoor: 150.0,
  bPliers0: 155.0,
  bPliers1: 160.4,
  bGlue0: 161.2,
  bGlue1: 166.4,
  bLoad0: 167.2,
  bLoad1: 171.6,
  bShots: [176.8, 177.5, 178.2, 179.0],
  bInspect: 182.0,
  bExit0: 196.6,
  bExit1: 197.6,
  space0: 198,
} as const;
