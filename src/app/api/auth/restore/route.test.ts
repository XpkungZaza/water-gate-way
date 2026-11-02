import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";

const APP = "http://localhost:3000";

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
  sessions: [] as { user_id: string; token_hash: Buffer; expires_at: Date }[],
  seq: 0,
  cookieJar: new Map<string, string>(),
  set: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  del: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  query: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

const sha = (s: string) => createHash("sha256").update(s).digest();
const mkRaw = () => `${randomBytes(12).toString("base64url")}.${randomBytes(32).toString("base64url")}`;

function seed(userId: string, raw: string, opts: { expiresAt?: Date } = {}) {
  const [selector, validator] = raw.split(".");
  h.tokens.push({
    id: ++h.seq,
    user_id: userId,
    selector,
    validator_hash: sha(validator),
    user_agent: null,
    created_at: new Date(),
    expires_at: opts.expiresAt ?? new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });
  return raw;
}

// Combined in-memory pg: the SQL shapes of session.ts and remember.ts (same approach as dal.test.ts).
vi.mock("@/lib/db", () => {
  h.query = vi.fn(async (sql: string, p: unknown[]) => {
    const q = sql.trim().toLowerCase().replace(/\s+/g, " ");
    if (q.startsWith("insert into sessions")) {
      h.sessions.push({ user_id: p[0] as string, token_hash: p[1] as Buffer, expires_at: p[2] as Date });
      return { rows: [], rowCount: 1 };
    }
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
      return {
        rows: hit ? [{ user_id: hit.user_id, disabled: h.users.find((u) => u.id === hit.user_id)!.disabled }] : [],
      };
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
    if (q.startsWith("delete from remember_tokens where selector")) {
      h.tokens = h.tokens.filter((t) => t.selector !== p[0]);
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("delete from remember_tokens where user_id")) {
      h.tokens = h.tokens.filter((t) => t.user_id !== p[0]);
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("delete from sessions")) return { rows: [], rowCount: 1 };
    throw new Error("unexpected sql: " + sql);
  });
  return { db: { query: h.query } };
});

vi.mock("next/headers", () => {
  h.set = vi.fn((name: string, value: string) => h.cookieJar.set(name, value));
  h.del = vi.fn((name: string) => h.cookieJar.delete(name));
  return {
    cookies: async () => ({
      get: (name: string) => (h.cookieJar.has(name) ? { name, value: h.cookieJar.get(name) } : undefined),
      set: h.set,
      delete: h.del,
    }),
  };
});

import { GET } from "./route";

let ipSeq = 0;

function req(next = "/dashboard", headers: Record<string, string> = {}) {
  const url = new URL("/api/auth/restore", APP);
  url.searchParams.set("next", next);
  // WHY: restoreByIp is a module singleton; a fresh IP per test keeps buckets independent.
  return new Request(url, {
    headers: { "x-forwarded-for": `10.7.0.${++ipSeq}`, "sec-fetch-dest": "document", ...headers },
  });
}

const location = (res: Response) => {
  const l = res.headers.get("location");
  return l ? new URL(l, APP) : null;
};

beforeEach(() => {
  h.users = [{ id: "u1", disabled: false }];
  h.tokens = [];
  h.sessions = [];
  h.seq = 0;
  h.cookieJar.clear();
  vi.clearAllMocks();
});

describe("GET /api/auth/restore", () => {
  it("success: sets both cookies and 303-redirects to the next path", async () => {
    const raw = seed("u1", mkRaw());
    h.cookieJar.set("wg_remember", raw);
    const res = await GET(req("/dashboard?gate=gate-2"));
    expect(res.status).toBe(303);
    expect(location(res)!.origin).toBe(APP);
    expect(location(res)!.pathname + location(res)!.search).toBe("/dashboard?gate=gate-2");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const sessionCookie = h.set.mock.calls.find(([n]) => n === "wg_session");
    const rememberCookie = h.set.mock.calls.find(([n]) => n === "wg_remember");
    expect(sessionCookie).toBeDefined();
    expect(rememberCookie![1]).not.toBe(raw);
    expect(rememberCookie![1]).toMatch(/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/);
    expect(h.sessions).toHaveLength(1);
    expect(h.sessions[0].user_id).toBe("u1");
    // rotation: the old row is gone, exactly one new one exists
    expect(h.tokens).toHaveLength(1);
    expect(h.tokens[0].selector).not.toBe(raw.slice(0, 16));
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil"])("open redirect via %j lands on the safe fallback", async (next) => {
    h.cookieJar.set("wg_remember", seed("u1", mkRaw()));
    const res = await GET(req(next));
    expect(res.status).toBe(303);
    const l = location(res)!;
    expect(l.origin).toBe(APP);
    expect(l.pathname).toBe("/dashboard");
  });

  it("Sec-Fetch-Dest: image -> 400, redeem never runs", async () => {
    const res = await GET(req("/dashboard", { "sec-fetch-dest": "image" }));
    expect(res.status).toBe(400);
    expect(h.query).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("malformed cookie -> failure redirect, cookie deleted", async () => {
    h.cookieJar.set("wg_remember", "garbage");
    const res = await GET(req());
    expect(res.status).toBe(303);
    expect(location(res)!.pathname + location(res)!.search).toBe("/login?next=%2Fdashboard&r=0");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(h.del).toHaveBeenCalledWith("wg_remember");
    expect(h.cookieJar.has("wg_remember")).toBe(false);
  });

  it("unknown selector -> failure redirect, cookie kept (a parallel request may have rotated it)", async () => {
    h.cookieJar.set("wg_remember", mkRaw());
    const res = await GET(req());
    expect(res.status).toBe(303);
    expect(location(res)!.pathname + location(res)!.search).toBe("/login?next=%2Fdashboard&r=0");
    expect(h.del).not.toHaveBeenCalled();
    expect(h.cookieJar.has("wg_remember")).toBe(true);
  });

  it("expired -> failure redirect, cookie deleted, row removed", async () => {
    h.cookieJar.set("wg_remember", seed("u1", mkRaw(), { expiresAt: new Date(Date.now() - 1000) }));
    const res = await GET(req());
    expect(res.status).toBe(303);
    expect(h.del).toHaveBeenCalledWith("wg_remember");
    expect(h.tokens).toHaveLength(0);
  });

  it("mismatch -> failure redirect, cookie deleted, all tokens of the user revoked", async () => {
    const raw = seed("u1", mkRaw());
    seed("u1", mkRaw());
    const [, wrong] = mkRaw().split(".");
    h.cookieJar.set("wg_remember", `${raw.slice(0, 16)}.${wrong}`);
    const res = await GET(req());
    expect(res.status).toBe(303);
    expect(h.del).toHaveBeenCalledWith("wg_remember");
    expect(h.tokens).toHaveLength(0);
  });

  it("disabled user -> failure redirect, cookie deleted, tokens revoked", async () => {
    h.users[0].disabled = true;
    h.cookieJar.set("wg_remember", seed("u1", mkRaw()));
    const res = await GET(req());
    expect(res.status).toBe(303);
    expect(h.del).toHaveBeenCalledWith("wg_remember");
    expect(h.tokens).toHaveLength(0);
    expect(h.sessions).toHaveLength(0);
  });

  it("an exception -> failure redirect (never a 500), logged without a stack", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.cookieJar.set("wg_remember", mkRaw());
    h.query.mockRejectedValue(new Error("relation does not exist"));
    const res = await GET(req("/dashboard"));
    expect(res.status).toBe(303);
    expect(location(res)!.pathname + location(res)!.search).toBe("/login?next=%2Fdashboard&r=0");
    expect(err).toHaveBeenCalledWith("[auth/restore] failed:", "relation does not exist");
    err.mockRestore();
  });
});
