import { handleCalendar } from './_dataHandlers.js';
import { protect } from './_guard.js';

// GET /api/calendar?month=YYYY-MM. Needs can_view_reservation.
export default protect('can_view_reservation', handleCalendar);
