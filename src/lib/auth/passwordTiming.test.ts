import { describe, it, expect, vi, beforeEach } from "vitest";

// WHY: timing assertions are flaky; instead count scrypt runs. Every rejection must cost one scrypt,
// like the unknown-email path (DUMMY_HASH), so response time does not reveal which accounts exist.
const scryptSpy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  return {
    ...real,
    scrypt: ((...args: Parameters<typeof real.scrypt>) => {
      scryptSpy.calls++;
      return (real.scrypt as (...a: unknown[]) => void)(...args);
    }) as typeof real.scrypt,
  };
});

import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "./password";

beforeEach(() => {
  scryptSpy.calls = 0;
});

describe("verifyPassword runs scrypt on every path (no timing oracle)", () => {
  it.each([
    ["a placeholder value", "x"],
    ["an empty value", ""],
    ["scrypt with foreign params", "scrypt$1024$8$1$AAAA$BBBB"],
    ["a bcrypt row with a tampered cost", "$2b$31$" + "a".repeat(53)],
  ])("%s", async (_name, stored) => {
    expect(await verifyPassword("whatever-password", stored)).toBe(false);
    expect(scryptSpy.calls).toBe(1);
  });

  it("a legacy bcrypt row also runs one scrypt, so it is never faster than an unknown email", async () => {
    const stored = await bcrypt.hash("right-password", 4);
    expect(await verifyPassword("right-password", stored)).toBe(true);
    expect(scryptSpy.calls).toBe(1);
  });

  it("a current scrypt row runs exactly one scrypt", async () => {
    const stored = await hashPassword("right-password");
    scryptSpy.calls = 0;
    expect(await verifyPassword("right-password", stored)).toBe(true);
    expect(scryptSpy.calls).toBe(1);
  });
});
