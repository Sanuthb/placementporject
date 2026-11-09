import { createHash, randomBytes } from "node:crypto";

/** 256 random bits, URL-safe. Only the hash is stored, so a database leak cannot be turned into working links. */
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const looksLikeToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

/**
 * The token travels in the URL fragment (#t=...). Browsers never send a fragment to a server, so it stays out of access logs,
 * proxies, Referer headers and server-side analytics. The invite page reads it, removes it from the address bar, and posts it in a body.
 */
export const inviteLink = (token: string) => `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/invite#t=${token}`;

export const maskEmail = (email: string) => {
  const [user, domain = ""] = email.split("@");
  return `${user.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
};
