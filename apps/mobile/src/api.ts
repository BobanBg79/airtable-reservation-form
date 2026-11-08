import { createApiClient } from '@delta/core';
import { API_BASE_URL } from './config';
import { getToken } from './session';

let unauthorizedHandler: (() => void) | null = null;

/** The auth provider registers here what to do when the server says the session is over (401). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

/** The one API client of the app (base URL from `config.ts`); sends the session token on every call. */
export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getToken,
  onUnauthorized: () => unauthorizedHandler?.(),
});
