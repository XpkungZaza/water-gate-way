import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";

const h = vi.hoisted(() => ({
  users: [] as { id: string; disabled: boolean }[],
  tokens: [] as {
    id: number;
    user_id: string;
    selector: string;
    validator_hash: Buffer;
    user_agent: string | null;
    created_at: Date;
    expires_at: Date;
  }[],
  seq: 0,
  query: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

// In-memory stand-in for pg, dispatching on the SQL shape used by remember.ts.
vi.mock("@/lib/db", () => {
  h.query = vi.fn(async (sql: string, p: unknown[]) => {
    const q = sql.trim().toLowerCase().replace(/\s+/g, " ");
    if (q.startsWith("insert into remember_tokens")) {
      h.tokens.push({
        id: ++h.seq,
        user_id: p[0] as string,
        selector: p[1] as string,
        validator_hash: p[2] as Buffer,
        user_agent: p[3] as string | null,
        created_at: new Date(),
        expires_at: p[4] as Date,
      });
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("delete from remember_tokens t using users u")) {
      const now = new Date();
      const hit = h.tokens.find(
        (t) =>
          t.selector === p[0] &&
          (t.validator_hash as Buffer).equals(p[1] as Buffer) &&
          t.expires_at > now &&
          h.users.some((u) => u.id === t.user_id),
      );
      if (hit) h.tokens = h.tokens.filter((t) => t !== hit);
      return { rows: hit ? [{ user_id: hit.user_id, disabled: h.users.find((u) => u.id === hit.user_id)!.disabled }] : [] };
    }
    if (q.includes("not in")) {
      const keep = h.tokens
        .filter((t) => t.user_id === p[0])
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, p[1] as number)
        .map((t) => t.id);
      h.tokens = h.tokens.filter((t) => !(t.user_id === p[0] && !keep.includes(t.id)));
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("delete from remember_tokens where expires_at")) {
      const now = new Date();
      h.tokens = h.tokens.filter((t) => t.expires_at >= now);
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("select user_id, expires_at from remember_tokens")) {
      const t = h.tokens.find((x) => x.selector === p[0]);
      return { rows: t ? [{ user_id: t.user_id, expires_at: t.expires_at }] : [] };
    }
    if (q.startsWith("delete from remember_tokens where selector") && q.includes("validator_hash")) {
      h.tokens = h.tokens.filter((t) => !(t.selector === p[0] && (t.validator_hash as Buffer).equals(p[1] as Buffer)));
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("delete from remember_tokens where selector")) {
      h.tokens = h.tokens.filter((t) => t.selector !== p[0]);
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("delete from remember_tokens where user_id")) {
      h.tokens = h.tokens.filter((t) => t.user_id !== p[0]);
      return { rows: [], rowCount: 1 };
    }
    throw new Error("unexpected sql: " + sql);
  });
  return { db: { query: h.query } };
});

import {
  parseRememberCookie,
  issueRememberToken,
  redeemRememberToken,
  revokeRememberToken,
  REMEMBER_TTL_MS,
  MAX_TOKENS_PER_USER,
} from "./remember";

const VALID_RE = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/;
const sha = (s: string) => createHash("sha256").update(s).digest();
const mkRaw = () => `${randomBytes(12).toString("base64url")}.${randomBytes(32).toString("base64url")}`;

/** Insert a token row the way the real insert would, from a raw cookie value. */
function seed(userId: string, raw: string, opts: { expiresAt?: Date } = {}) {
  const [selector, validator] = raw.split(".");
  h.tokens.push({
    id: ++h.seq,
    user_id: userId,
    selector,
    validator_hash: sha(validator),
    user_agent: null,
    created_at: new Date(),
    expires_at: opts.expiresAt ?? new Date(Date.now() + REMEMBER_TTL_MS),
  });
  return raw;
}

beforeEach(() => {
  h.users = [{ id: "u1", disabled: false }, { id: "u2", disabled: false }];
  h.tokens = [];
  h.seq = 0;
  vi.clearAllMocks();
});

describe("parseRememberCookie", () => {
  it("accepts selector.validator in the exact format", () => {
    const raw = mkRaw();
    expect(parseRememberCookie(raw)).toEqual({ selector: raw.slice(0, 16), validator: raw.slice(17) });
  });
  it.each([
    ["wrong selector length", `${"a".repeat(15)}.${"b".repeat(43)}`],
    ["wrong validator length", `${"a".repeat(16)}.${"b".repeat(44)}`],
    ["bad character (+)", `A+AAAAAAAAAAAAAAAA.${"b".repeat(43)}`],
    ["no dot", "a".repeat(59)],
    ["two dots", `a.b.${"c".repeat(41)}`],
    ["empty", ""],
  ])("rejects %s", (_n, raw) => {
    expect(parseRememberCookie(raw)).toBeNull();
  });
  it("rejects undefined", () => {
    expect(parseRememberCookie(undefined)).toBeNull();
  });
});

describe("issueRememberToken", () => {
  it("returns a cookie value in the strict format and expires in ~30 days", async () => {
    const { value, expiresAt } = await issueRememberToken("u1", "UA");
    expect(value).toMatch(VALID_RE);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + REMEMBER_TTL_MS - 5000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + REMEMBER_TTL_MS);
  });

  it("stores a 32-byte sha256 hash and never sends the raw validator to SQL", async () => {
    const { value } = await issueRememberToken("u1", null);
    const validator = value.slice(17);
    const insert = h.query.mock.calls.find(([sql]) => String(sql).startsWith("insert into remember_tokens"));
    const params = insert![1] as unknown[];
    expect((params[2] as Buffer).byteLength).toBe(32);
    expect((params[2] as Buffer).equals(sha(validator))).toBe(true);
    expect(params[3]).toBeNull();
    // WHY: the raw validator must not be recoverable from any SQL parameter or log.
    expect(JSON.stringify(h.query.mock.calls)).not.toContain(validator);
  });

  it("truncates user_agent to 200 chars", async () => {
    await issueRememberToken("u1", "A".repeat(300));
    expect(h.tokens[0].user_agent).toHaveLength(200);
  });

  it("keeps only the newest MAX_TOKENS_PER_USER tokens of the user (oldest deleted)", async () => {
    const values: string[] = [];
    for (let i = 0; i < MAX_TOKENS_PER_USER; i++) values.push((await issueRememberToken("u1", null)).value);
    // WHY: backdate the existing rows so the next issue's prune has deterministic "oldest" ordering.
    h.tokens.forEach((t, k) => (t.created_at = new Date(Date.now() - (MAX_TOKENS_PER_USER - k) * 1000)));
    const newest = (await issueRememberToken("u1", null)).value;
    expect(h.tokens).toHaveLength(MAX_TOKENS_PER_USER);
    expect(h.tokens.every((t) => t.user_id === "u1")).toBe(true);
    // the just-issued token survives, the oldest of the previous five is pruned
    expect(h.tokens.map((t) => t.selector)).toContain(newest.slice(0, 16));
    expect(h.tokens.map((t) => t.selector)).not.toContain(values[0].slice(0, 16));
  });
});

describe("redeemRememberToken", () => {
  it("success: consumes the row, rotates, returns a new value for the same user", async () => {
    const raw = seed("u1", mkRaw());
    const r = await redeemRememberToken(raw, "UA");
    expect(r).toMatchObject({ ok: true, userId: "u1" });
    if (r.ok) {
      expect(r.next.value).toMatch(VALID_RE);
      expect(r.next.value).not.toBe(raw);
    }
    expect(h.tokens).toHaveLength(1);
    expect(h.tokens[0].selector).not.toBe(raw.slice(0, 16));
    expect(h.tokens[0].user_id).toBe("u1");
    expect(h.tokens[0].user_agent).toBe("UA");
  });

  it("malformed -> malformed, nothing touches the DB", async () => {
    expect(await redeemRememberToken("garbage")).toEqual({ ok: false, reason: "malformed" });
    expect(h.query).not.toHaveBeenCalled();
  });

  it("unknown selector -> unknown, row store untouched", async () => {
    const raw = mkRaw();
    expect(await redeemRememberToken(raw)).toEqual({ ok: false, reason: "unknown" });
    expect(h.tokens).toHaveLength(0);
  });

  it("expired row -> expired, row deleted", async () => {
    const raw = seed("u1", mkRaw(), { expiresAt: new Date(Date.now() - 1000) });
    expect(await redeemRememberToken(raw)).toEqual({ ok: false, reason: "expired" });
    expect(h.tokens).toHaveLength(0);
  });

  it("validator mismatch -> revokes ALL tokens of that user (theft signal), others keep theirs", async () => {
    seed("u1", mkRaw());
    seed("u1", mkRaw());
    const otherRaw = seed("u2", mkRaw());
    const [, wrong] = mkRaw().split(".");
    expect(await redeemRememberToken(`${h.tokens[0].selector}.${wrong}`)).toEqual({ ok: false, reason: "mismatch" });
    expect(h.tokens.map((t) => t.user_id)).toEqual(["u2"]);
    expect(h.tokens[0].selector).toBe(otherRaw.slice(0, 16));
  });

  it("disabled user -> tokens deleted, returns disabled", async () => {
    h.users[0].disabled = true;
    const raw = seed("u1", mkRaw());
    seed("u1", mkRaw());
    expect(await redeemRememberToken(raw)).toEqual({ ok: false, reason: "disabled" });
    expect(h.tokens).toHaveLength(0);
  });
});

describe("revokeRememberToken", () => {
  it("a holder of the real validator deletes exactly that row", async () => {
    const raw = seed("u1", mkRaw());
    const other = seed("u1", mkRaw());
    await revokeRememberToken(raw);
    expect(h.tokens.map((t) => t.selector)).toEqual([other.slice(0, 16)]);
  });

  it("bad cookie: does nothing and does not throw", async () => {
    await expect(revokeRememberToken("garbage")).resolves.toBeUndefined();
    await expect(revokeRememberToken(undefined)).resolves.toBeUndefined();
    expect(h.query).not.toHaveBeenCalled();
  });

  it("valid format but wrong validator: no match, row stays", async () => {
    const raw = seed("u1", mkRaw());
    const [, wrong] = mkRaw().split(".");
    await revokeRememberToken(`${raw.slice(0, 16)}.${wrong}`);
    expect(h.tokens).toHaveLength(1);
  });
});
