import * as SecureStore from 'expo-secure-store';

// The session token lives in SecureStore (Android Keystore / iOS Keychain) so it survives app restarts, and in
// a variable so the API client can read it synchronously on every call. Never logged, never in AsyncStorage.
const KEY = 'delta.session.token';

let memoryToken: string | null = null;

/** The token for the API client (`getToken`). Empty until `loadToken` has run or someone signs in. */
export function getToken(): string | null {
  return memoryToken;
}

/** Reads the saved token at app start. A SecureStore failure just means "not signed in". */
export async function loadToken(): Promise<string | null> {
  try {
    memoryToken = await SecureStore.getItemAsync(KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export async function saveToken(token: string): Promise<void> {
  memoryToken = token; // the session works for this run even if the secure store refuses the write
  try {
    await SecureStore.setItemAsync(KEY, token);
  } catch {
    /* kept in memory only: the user signs in again next time */
  }
}

export async function clearToken(): Promise<void> {
  memoryToken = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* nothing more to do */
  }
}
