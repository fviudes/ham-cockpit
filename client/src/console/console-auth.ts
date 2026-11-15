export const AUTH_KEY = "hamcockpit.auth";
export const AUTH_USER_KEY = "hamcockpit.user";
export const POST_LOGIN_KEY = "hamcockpit.postLogin";
const SESSION_EXPIRED = "hc-session-expired";

export function expireConsoleSession(): void {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(POST_LOGIN_KEY);
  window.dispatchEvent(new Event(SESSION_EXPIRED));
}

export function onConsoleSessionExpired(fn: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED, fn);
  return () => window.removeEventListener(SESSION_EXPIRED, fn);
}
