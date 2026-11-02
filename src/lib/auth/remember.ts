import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export const REMEMBER_COOKIE = "wg_remember";
export const REMEMBER_TTL_MS = 30 * 24 * 3600 * 1000;
export const MAX_TOKENS_PER_USER = 5;

export function rememberCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

// WHY: strict shape check on the cookie — anything else (padding, wrong lengths, extra dot) is garbage or tampering.
const COOKIE_RE = /^([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/;

export function parseRememberCookie(raw: string | undefined): { selector: string; validator: string } | null {
  const m = COOKIE_RE.exec(raw ?? "");
  return m ? { selector: m[1], validator: m[2] } : null;
}

// WHY: store only sha256(validator) so a DB leak does not yield usable remember tokens (same as sessions).
const hashValidator = (validator: string) => createHash("sha256").update(validator).digest();

export async function issueRememberToken(
  userId: string,
  userAgent: string | null,
): Promise<{ value: string; expiresAt: Date }> {
  const selector = randomBytes(12).toString("base64url"); // 16 chars
  const validator = randomBytes(32).toString("base64url"); // 43 chars
  const expiresAt = new Date(Date.now() + REMEMBER_TTL_MS);
  await db.query(
    "insert into remember_tokens (user_id, selector, validator_hash, user_agent, expires_at) values ($1, $2, $3, $4, $5)",
    [userId, selector, hashValidator(validator), userAgent ? userAgent.slice(0, 200) : null, expiresAt],
  );
  await db.query("delete from remember_tokens where expires_at < now()");
  // WHY: cap devices per user; a leaked account cannot hide behind unlimited persistent tokens.
  await db.query(
    `delete from remember_tokens
      where user_id = $1 and id not in (
        select id from remember_tokens where user_id = $1 order by created_at desc, id desc limit $2
      )`,
    [userId, MAX_TOKENS_PER_USER],
  );
  return { value: `${selector}.${validator}`, expiresAt };
}

export type RedeemResult =
  | { ok: true; userId: string; next: { value: string; expiresAt: Date } }
  | { ok: false; reason: "malformed" | "unknown" | "expired" | "mismatch" | "disabled" };

/**
 * Consume a remember cookie and mint a fresh one (rotation) on success.
 * WHY: the match is one atomic delete ... using users, so two parallel requests can never both succeed —
 * the second one finds no row and must not overwrite the winner's fresh cookie (handled in the route).
 */
export async function redeemRememberToken(raw: string | undefined, userAgent: string | null = null): Promise<RedeemResult> {
  const parsed = parseRememberCookie(raw);
  if (!parsed) return { ok: false, reason: "malformed" };

  const { rows } = await db.query(
    `delete from remember_tokens t using users u
      where t.selector = $1 and t.validator_hash = $2 and t.expires_at > now() and u.id = t.user_id
      returning t.user_id, u.disabled`,
    [parsed.selector, hashValidator(parsed.validator)],
  );
  if (rows.length > 0) {
    const { user_id, disabled } = rows[0] as { user_id: string; disabled: boolean };
    if (disabled) {
      await revokeAllRememberTokens(user_id);
      return { ok: false, reason: "disabled" };
    }
    const next = await issueRememberToken(user_id, userAgent);
    return { ok: true, userId: user_id, next };
  }

  const { rows: found } = await db.query("select user_id, expires_at from remember_tokens where selector = $1", [
    parsed.selector,
  ]);
  const row = found[0] as { user_id: string; expires_at: Date } | undefined;
  if (!row) return { ok: false, reason: "unknown" };
  if (row.expires_at <= new Date()) {
    await db.query("delete from remember_tokens where selector = $1", [parsed.selector]);
    return { ok: false, reason: "expired" };
  }
  // WHY: selector valid but validator wrong means a copied/stolen cookie — revoke every remembered device.
  await revokeAllRememberTokens(row.user_id);
  return { ok: false, reason: "mismatch" };
}

export async function revokeRememberToken(raw: string | undefined): Promise<void> {
  const parsed = parseRememberCookie(raw);
  if (!parsed) return;
  // WHY: only a holder of the real validator may delete the row; hash equality is checked in SQL.
  await db.query("delete from remember_tokens where selector = $1 and validator_hash = $2", [
    parsed.selector,
    hashValidator(parsed.validator),
  ]);
}

export async function revokeAllRememberTokens(userId: string): Promise<void> {
  await db.query("delete from remember_tokens where user_id = $1", [userId]);
}
