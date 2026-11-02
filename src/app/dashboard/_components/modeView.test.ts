import { describe, expect, it } from "vitest";
import { modeView } from "./modeView";

describe("modeView", () => {
  it("stale -> unknown even when mode is known", () => {
    expect(modeView("AUTO", true)).toEqual({ tone: "unknown", label: "ไม่ทราบโหมด" });
  });

  it("mode null -> unknown", () => {
    expect(modeView(null, false)).toEqual({ tone: "unknown", label: "ไม่ทราบโหมด" });
  });

  it('AUTO -> on / "อัตโนมัติ"', () => {
    expect(modeView("AUTO", false)).toEqual({ tone: "on", label: "อัตโนมัติ" });
  });

  it('MANUAL -> warn / "ควบคุมเอง"', () => {
    expect(modeView("MANUAL", false)).toEqual({ tone: "warn", label: "ควบคุมเอง" });
  });

  it('OFF -> off / "ปิดระบบ"', () => {
    expect(modeView("OFF", false)).toEqual({ tone: "off", label: "ปิดระบบ" });
  });
});
