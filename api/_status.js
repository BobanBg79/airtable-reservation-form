// Which reservation statuses free their dates. Files starting with "_" in api/ are not exposed as
// routes by Vercel.
//
// PostgreSQL enum `reservation_status` (db/schema.ts). Written as a deny-list on purpose: any other
// status, including `inquiry` once it is added to the enum, blocks the dates without touching this
// file, so an unknown status fails safe (blocks) instead of silently allowing a double booking.
export const PG_FREES_DATES = Object.freeze(['cancelled', 'no_show']);
