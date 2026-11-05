// Single source of truth for reservation status names in Airtable (field `Status`, single select).
// Files starting with "_" in api/ are not exposed as routes by Vercel.

export const STATUS = Object.freeze({
  ACTIVE: 'Active', // default for every new reservation
  INQUIRY: 'Inquiry', // short-term hold: blocks the calendar until confirmed or released
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No show',
});

export const DEFAULT_STATUS = STATUS.ACTIVE;

// These free the dates. Everything else (Active, Inquiry and a blank status) blocks them.
// Written as a deny-list on purpose: a blank or unknown status fails safe (blocks) instead of
// silently allowing a double booking.
const FREES_DATES = [STATUS.CANCELLED, STATUS.NO_SHOW];

// Airtable formula fragment: true when the reservation blocks its dates.
export const BLOCKING_FORMULA = `AND(${FREES_DATES.map((s) => `{Status}!='${s}'`).join(', ')})`;
