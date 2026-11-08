import { handleApartments } from './_dataHandlers.js';
import { protect } from './_guard.js';

// GET /api/apartments. Needs can_view_apartment; owner contact and rent need their own permissions.
export default protect('can_view_apartment', handleApartments);
