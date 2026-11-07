import { describe, expect, it } from 'vitest';
import { apartmentAmenities, apartmentLocationLine, apartmentSubtitle, findApartment, formatFloor } from './apartment';
import type { ApartmentDetails } from './types';

const atlas: ApartmentDetails = {
  id: '2',
  name: 'Atlas',
  address: 'Test Street 1, Belgrade',
  apartmentNumber: '1A',
  floor: 0,
  buildingName: 'Mimoza',
  areaM2: 38,
  ownerName: 'Test Owner One',
  ownerPhone: '+38160000001',
  monthlyRentEur: 350,
  hasBathtub: false,
  hasTerrace: true,
  hasDishwasher: false,
  parkingSpot: null,
};

describe('formatFloor', () => {
  it('names the ground floor and basements', () => {
    expect(formatFloor(0)).toBe('Ground floor');
    expect(formatFloor(-1)).toBe('Basement');
    expect(formatFloor(-2)).toBe('Basement 2');
  });

  it('uses English ordinals', () => {
    expect(formatFloor(1)).toBe('1st floor');
    expect(formatFloor(2)).toBe('2nd floor');
    expect(formatFloor(3)).toBe('3rd floor');
    expect(formatFloor(4)).toBe('4th floor');
    expect(formatFloor(11)).toBe('11th floor');
    expect(formatFloor(12)).toBe('12th floor');
    expect(formatFloor(13)).toBe('13th floor');
    expect(formatFloor(21)).toBe('21st floor');
    expect(formatFloor(22)).toBe('22nd floor');
    expect(formatFloor(101)).toBe('101st floor');
    expect(formatFloor(111)).toBe('111th floor');
  });
});

describe('apartmentLocationLine', () => {
  it('joins building and floor only', () => {
    expect(apartmentLocationLine(atlas)).toBe('Mimoza · Ground floor');
    expect(apartmentLocationLine({ ...atlas, buildingName: 'Suncokret', floor: 5 })).toBe('Suncokret · 5th floor');
  });
});

describe('apartmentSubtitle', () => {
  it('joins building, floor and area', () => {
    expect(apartmentSubtitle(atlas)).toBe('Mimoza · Ground floor · 38 m²');
    expect(apartmentSubtitle({ ...atlas, buildingName: 'Suncokret', floor: 3, areaM2: 52 })).toBe('Suncokret · 3rd floor · 52 m²');
  });
});

describe('apartmentAmenities', () => {
  it('lists the four amenities in a fixed order with their availability', () => {
    expect(apartmentAmenities(atlas)).toEqual([
      { key: 'bathtub', label: 'Bathtub', available: false },
      { key: 'terrace', label: 'Terrace', available: true },
      { key: 'dishwasher', label: 'Dishwasher', available: false },
      { key: 'parking', label: 'Parking', available: false },
    ]);
  });

  it('shows the parking spot when there is one', () => {
    const parking = apartmentAmenities({ ...atlas, parkingSpot: 'P12' }).find((a) => a.key === 'parking');
    expect(parking).toEqual({ key: 'parking', label: 'Parking', available: true, detail: 'Spot P12' });
  });
});

describe('findApartment', () => {
  it('finds by id and returns undefined when missing', () => {
    expect(findApartment([atlas], '2')).toBe(atlas);
    expect(findApartment([atlas], '99')).toBeUndefined();
    expect(findApartment([], '2')).toBeUndefined();
  });
});
