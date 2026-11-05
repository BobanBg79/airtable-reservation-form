import { describe, expect, it } from 'vitest';
import { apartmentHues } from './colors';

const NAMES = ['Atlas', 'Berlin', 'Devetka', 'Egzotik', 'Eli', 'Kapiten', 'Karuzo', 'Luna', 'Margareta', 'Mimoza', 'Modena', 'Mona', 'Neva', 'Neven', 'Onyx'];

const hueDistance = (a: number, b: number) => {
  const x = Math.abs(a - b) % 360;
  return x > 180 ? 360 - x : x;
};

describe('apartmentHues', () => {
  it('assigns a hue to every apartment', () => {
    const hues = apartmentHues(NAMES);
    expect(hues.size).toBe(15);
    for (const h of hues.values()) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it('is independent of input order', () => {
    expect(apartmentHues([...NAMES].reverse())).toEqual(apartmentHues(NAMES));
  });

  it('keeps all 15 hues distinguishable', () => {
    const hues = [...apartmentHues(NAMES).values()];
    for (let i = 0; i < hues.length; i++)
      for (let j = i + 1; j < hues.length; j++) expect(hueDistance(hues[i]!, hues[j]!)).toBeGreaterThanOrEqual(10);
  });
});
