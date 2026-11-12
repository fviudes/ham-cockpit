/**
 * `true` só no build do portal público (vite.config.portal.ts → Cloudflare Pages).
 * No aparelho (Pi) fica `false`: o site abre o console e o manual do console.
 */
export const IS_PORTAL = import.meta.env.VITE_PORTAL === "1";
