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
