import { isValidISODate } from './date';

export interface ReservationInput {
  guest: string;
  apartmentId: string;
  checkIn: string;
  checkOut: string;
  phone?: string;
  /** EUR */
  amount?: number | null;
  note?: string;
}

export type ReservationField = 'guest' | 'apartmentId' | 'checkIn' | 'checkOut' | 'amount';

export type ValidationErrors = Partial<Record<ReservationField, string>>;

export interface ValidationResult {
  valid: boolean;
  errors: ValidationErrors;
}

export function validateReservationInput(input: ReservationInput): ValidationResult {
  const errors: ValidationErrors = {};

  if (!input.guest?.trim()) errors.guest = 'Guest name is required.';
  if (!input.apartmentId?.trim()) errors.apartmentId = 'Apartment is required.';

  if (!input.checkIn) errors.checkIn = 'Check-in is required.';
  else if (!isValidISODate(input.checkIn)) errors.checkIn = 'Check-in is not a valid date.';

  if (!input.checkOut) errors.checkOut = 'Check-out is required.';
  else if (!isValidISODate(input.checkOut)) errors.checkOut = 'Check-out is not a valid date.';

  if (!errors.checkIn && !errors.checkOut && input.checkOut <= input.checkIn) {
    errors.checkOut = 'Check-out must be after check-in.';
  }

  if (input.amount !== undefined && input.amount !== null) {
    if (!Number.isFinite(input.amount) || input.amount < 0) {
      errors.amount = 'Amount must be a positive number.';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
