# Design: Water Gate Way

Mode: **Operate**. World: a field engineering instrument panel — calm, light, legible in sunlight, trustworthy like a well-made government utility tool. Not a sci-fi console, not a SaaS template.

## Type
- One family: **LINE Seed Sans TH** (self-hosted, `src/app/fonts/LINESeedSansTH_Rg.otf` 400, `LINESeedSansTH_Bd.otf` 700) via `next/font/local`, CSS var `--font-line-seed`, wired as `--font-sans`.
- Fixed rem scale, ratio ~1.2: 12 / 14 / 16 (body) / 18 / 22 / 28.
- Every number: `font-variant-numeric: tabular-nums`. No monospace font.

## Color (light only)
| token | hex | use |
|---|---|---|
| bg | #f4f5f2 | page |
| surface | #ffffff | panels |
| surface-2 | #eceee9 | toolbars, table header, inactive segment |
| border | #e1e4df | 1px panel edges |
| rule | #eef0ec | row dividers inside panels |
| control | #c9cec6 | input and outlined-button borders |
| fg | #142029 | text |
| muted | #55606a | secondary text (≥4.5:1 on white) |
| accent | #0a58a3 | water data only (gauge fill, chart line) and the focus ring; never chrome |
| on | #136b35 / on-soft #e3f3e8 | device running (darkened from #157f3c for 4.5:1 on on-soft) |
| off | #3f4b57 / off-soft #e6e9ec | device stopped |
| warn | #a35207 / warn-soft #fdf0dc | warnings, light |
| danger | #b4231b / danger-soft #fbe7e5 | alarm, errors, destructive |
| unknown | #7b858e | stale / no data (dashed outline pill + hollow dot + text) |

Color never carries meaning alone: every state has a word and an icon.

## Device state vocabulary (Thai)
- ON: "ทำงาน" — filled green dot + green-soft background.
- OFF: "ปิดอยู่" — filled slate dot + off-soft background.
- UNKNOWN: "ไม่ทราบสถานะ" — hollow dot + dashed outline, no fill.
- SENDING: "กำลังส่งคำสั่ง…"; WAITING: "ส่งแล้ว รออุปกรณ์ยืนยัน"; FAILED: error text + retry.

## Device control pattern
One row per device: icon + Thai name, a large state readout, and a two-segment switch `[ ปิด | เปิด ]`. The segment matching the current state is filled (on → green, off → slate) with `aria-pressed="true"` and a check icon; the other segment is outlined and is the action. Unknown state: neither segment filled. Both segments ≥ 48px tall.

## Layout
- App bar 48px (`AppHeader`, one component everywhere): staff-gauge mark + "Water Gate Way" (mark only on a phone), nav as a neutral grey pill for the current section (แผนที่, ผู้ดูแลระบบ for admin), ออกจากระบบ. The product name is not an h1; each page has one h1.
- Primary button is near-black ink (`btn-primary`), one per screen. Chrome carries no brand colour.
- Dashboard: title row (gate name h1, link state, the device's own `receivedAt`), then one grid — water level panel (staff gauge + 24-row history chart + CSV), readings (2 columns), cameras (3 across from 640px) — and a 384px sticky control rail on desktop. Phone: title → water level → controls → readings → cameras.
- Water thresholds (warn 3 m, danger 5 m, scale 8 m) live in `src/app/dashboard/_components/levels.ts`; gauge and chart both read them.
- Readings are grouped definition lists inside one panel, not a grid of same-size cards.

## Shape and depth
Radius 8px (controls 6px). Depth by 1px borders only; a shadow only on what floats (the map popup).

## Motion
150–200ms color/background transitions, a 1px press on buttons, a chevron nudge on row links. No entrances. Respect prefers-reduced-motion.
