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
