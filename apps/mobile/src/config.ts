import { Platform } from 'react-native';

const PRODUCTION_API_URL = 'https://airtable-reservation-form.vercel.app';

/**
 * Where the app finds `/api/*`.
 * - Web: same origin. In dev, Metro proxies `/api/*` (see metro.config.js); in production the
 *   web app is served from the same Vercel domain as the API.
 * - Native: `EXPO_PUBLIC_API_URL` (e.g. a `vercel dev` URL on your LAN), else production.
 */
export const API_BASE_URL: string =
  Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_API_URL ?? PRODUCTION_API_URL);
