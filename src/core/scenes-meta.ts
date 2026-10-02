/** Scene catalogue (names only; drawing lives in src/game/scenes.ts so the core stays DOM-free). */
export const SCENES = [
  'Sailboat at Sunset',
  'Ginger Cat',
  'Neon Skyline',
  'Ringed Planet',
  'Lighthouse',
  'Hot-Air Balloon',
  'Mountain Lake',
  'Rocket Launch',
  'Desert Cactus',
  'Sunflower',
  'Night Owl',
  'Blue Whale',
  'Mushroom Grove',
  'Koi Pond',
] as const;
export const SCENE_COUNT = SCENES.length;

/**
 * Centres of round / radial features in each scene (unit coords): suns, ray bursts, ripple rings.
 * Twisting such a feature around its own centre barely changes it, and its rings look like a
 * whirlpool, so whirlpool eyes are kept away from them. Eyes then land on straight edges instead.
 */
export const DECOYS: readonly (readonly [number, number])[][] = [
  [[0.68, 0.44]], // sailboat: sun
  [[0.5, 0.56], [0.5, 0.7]], // cat: head, muzzle
  [],
  [[0.5, 0.52]], // planet
  [[0.5, 0.24]], // lighthouse: ray burst
  [],
  [],
  [],
  [[0.66, 0.34]], // cactus: ringed sun
  [[0.5, 0.44]], // sunflower: rays + seed spiral
  [],
  [],
  [],
  [[0.3, 0.3], [0.72, 0.7]], // koi pond: ripple rings
];
