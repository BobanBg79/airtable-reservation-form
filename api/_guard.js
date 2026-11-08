// The guards wired to the real database. Route files import from here; see _guardCore.js for the rules.
import { getSql } from './_db.js';
import { makeGuards } from './_guardCore.js';

export const { protect, authenticated, publicRoute } = makeGuards(getSql);
