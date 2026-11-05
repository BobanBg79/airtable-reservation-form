const GOLDEN_ANGLE = 137.508;
const START_HUE = 190; // first apartment lands in the teal range

/**
 * Stable hue (0-359) per apartment, shared by all clients so the same apartment always has
 * the same colour. Names are sorted alphabetically and hues are spread by the golden angle,
 * so any two apartments get clearly different colours regardless of row order.
 */
export function apartmentHues(names: readonly string[]): Map<string, number> {
  const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b, 'en'));
  return new Map(sorted.map((name, i) => [name, Math.round((START_HUE + i * GOLDEN_ANGLE) % 360)]));
}
