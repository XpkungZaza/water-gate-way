import { describe, expect, it } from "vitest";
import { isCapsLockOn } from "./capsLock";

describe("isCapsLockOn", () => {
  it("returns true when CapsLock modifier state is true", () => {
    expect(isCapsLockOn({ getModifierState: (key) => key === "CapsLock" })).toBe(true);
  });

  it("returns false when CapsLock modifier state is false", () => {
    expect(isCapsLockOn({ getModifierState: () => false })).toBe(false);
  });

  it("returns false when getModifierState is missing", () => {
    expect(isCapsLockOn({})).toBe(false);
  });

  it("returns false when getModifierState throws", () => {
    expect(
      isCapsLockOn({
        getModifierState: () => {
          throw new Error("boom");
        },
      }),
    ).toBe(false);
  });
});
