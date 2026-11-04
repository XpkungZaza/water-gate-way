import { describe, expect, it } from "vitest";
import { levelBand } from "./levels";

describe("levelBand", () => {
  it("is normal below the warning mark", () => {
    expect(levelBand(0)).toBe("normal");
    expect(levelBand(2.99)).toBe("normal");
  });
  it("warns from 3 m up to the danger mark", () => {
    expect(levelBand(3)).toBe("warn");
    expect(levelBand(4.99)).toBe("warn");
  });
  it("is danger from 5 m", () => {
    expect(levelBand(5)).toBe("danger");
    expect(levelBand(9)).toBe("danger");
  });
});
