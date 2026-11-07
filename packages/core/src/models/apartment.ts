import { formatArea } from './format';
import type { ApartmentDetails } from './types';

/** "Ground floor", "1st floor", "2nd floor", "11th floor", "Basement", "Basement 2". */
export function formatFloor(floor: number): string {
  if (floor === 0) return 'Ground floor';
  if (floor < 0) return floor === -1 ? 'Basement' : `Basement ${-floor}`;
  const lastTwo = floor % 100;
  const last = floor % 10;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th';
  return `${floor}${suffix} floor`;
}

/** Short line for list rows: "Mimoza · Ground floor". */
export function apartmentLocationLine(a: ApartmentDetails): string {
  return `${a.buildingName} · ${formatFloor(a.floor)}`;
}

/** Full description line: "Mimoza · Ground floor · 38 m²". */
export function apartmentSubtitle(a: ApartmentDetails): string {
  return `${a.buildingName} · ${formatFloor(a.floor)} · ${formatArea(a.areaM2)}`;
}

export type AmenityKey = 'bathtub' | 'terrace' | 'dishwasher' | 'parking';

export interface Amenity {
  key: AmenityKey;
  label: string;
  available: boolean;
  /** Extra text when available, e.g. the parking spot. */
  detail?: string;
}

/** The amenities an apartment can have, in a fixed order, each marked available or not. */
export function apartmentAmenities(a: ApartmentDetails): Amenity[] {
  return [
    { key: 'bathtub', label: 'Bathtub', available: a.hasBathtub },
    { key: 'terrace', label: 'Terrace', available: a.hasTerrace },
    { key: 'dishwasher', label: 'Dishwasher', available: a.hasDishwasher },
    a.parkingSpot
      ? { key: 'parking', label: 'Parking', available: true, detail: `Spot ${a.parkingSpot}` }
      : { key: 'parking', label: 'Parking', available: false },
  ];
}

export function findApartment(list: readonly ApartmentDetails[], id: string): ApartmentDetails | undefined {
  return list.find((a) => a.id === id);
}
