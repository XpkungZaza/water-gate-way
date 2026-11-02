import { describe, expect, it } from "vitest";
import { loginUrl } from "./loginUrl";

describe("loginUrl", () => {
  it("encodes a bare pathname", () => {
    expect(loginUrl("/dashboard", "")).toBe("/login?next=%2Fdashboard");
  });

  it("encodes pathname and search together", () => {
    expect(loginUrl("/dashboard", "?gate=gate-2")).toBe("/login?next=%2Fdashboard%3Fgate%3Dgate-2");
  });

  it("encodes the root path", () => {
    expect(loginUrl("/", "")).toBe("/login?next=%2F");
  });

  it("encodes reserved characters (&, #) in the search", () => {
    expect(loginUrl("/dashboard", "?a=1&b=2#top")).toBe("/login?next=%2Fdashboard%3Fa%3D1%26b%3D2%23top");
  });
});
