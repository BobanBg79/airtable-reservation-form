import { createApiClient } from '@delta/core';
import { API_BASE_URL } from './config';

/** The one API client of the app (base URL from `config.ts`). */
export const api = createApiClient({ baseUrl: API_BASE_URL });
