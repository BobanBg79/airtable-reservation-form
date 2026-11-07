/** Date-only value in `YYYY-MM-DD` format (Europe/Belgrade calendar day). Never a timestamp. */
export type ISODate = string & { readonly __brand: 'ISODate' };

/** Calendar month in `YYYY-MM` format. */
export type YearMonth = string & { readonly __brand: 'YearMonth' };

export type ReservationStatus = 'active' | 'cancelled';

export interface Apartment {
  id: string;
  name: string;
  note?: string;
}

/** Everything the apartment list and the detail screen show (read-only for now). */
export interface ApartmentDetails extends Apartment {
  address: string;
  /** e.g. "12A" */
  apartmentNumber: string;
  /** 0 = ground floor */
  floor: number;
  /** e.g. "Mimoza" */
  buildingName: string;
  areaM2: number;
  ownerName: string;
  ownerPhone: string;
  /** EUR */
  monthlyRentEur: number;
  hasBathtub: boolean;
  hasTerrace: boolean;
  hasDishwasher: boolean;
  /** Optional, e.g. "P12". */
  parkingSpot: string | null;
}

export interface Reservation {
  id: string;
  apartmentId: string;
  guest: string;
  checkIn: ISODate;
  checkOut: ISODate;
  status: ReservationStatus;
  phone?: string;
  /** EUR */
  amount?: number;
  note?: string;
}
