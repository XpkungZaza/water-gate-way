# UI redesign: achromatic ledger + staff gauge (2026-11-02)

Visual and markup only. No server actions, API routes, `src/lib`, hooks or form field names change.
Review before this (critique, inspector numbers) is in the session; screenshots in `.taste-skill/before/`.

## [--:--] Review and local test rig
- **Action:** read every page/component; ran tasteskill lint + inspect (`--app`) on 7 screens at 1440/768/390.
  Local Postgres in Docker (`wgw-design-pg`, port 55432) seeded from `db/migrations/*.sql` plus 4 sample gates,
  24 sample water levels and 3 test users with sessions; a scratchpad proxy adds the session cookie per role.
- **Why:** pages are behind auth and the dev DB was not running; the inspector cannot send cookies.
- **Result:** 0 source FAIL; inspector FAIL on the `hatch` gradient; WARN many-h1 (admin), contrast 4.4:1 on
  green pills, heavy borders 1.45:1, tiny text >50%, voids on admin overview, gates page 2.4 screens.
  Found: `StatusStrip` labels the wall clock as "อัปเดตล่าสุด" instead of `status.receivedAt`.
- **Lesson:** a freshness stamp must come from the data, not the clock; a ticking clock reads as live even when the feed is dead.
- **Dead end:** inspector timed out ("Chrome did not start within 20s"): only Chrome Dev is installed; `CHROME_PATH` fixed it.

## [--:--] Style decision (mini-ADR)
- **Chosen:** `achromatic-ledger` (seed 1020810353), brand palette and LINE Seed kept. Chrome in ink, near-black primary,
  brand blue only on water data (gauge fill, chart line). Shell redrawn from "open plane sidebar" to a 48px top bar:
  the product has two destinations and the map needs the width.
- **Rejected:** `framed-sheet` (adds a tinted frame for a 2-link nav), `accent-ladder` (puts brand tints on chrome,
  which competes with the on/warn/danger state colours that must stay the loudest thing).
- **Signature element:** a vertical staff gauge (ไม้วัดระดับน้ำ) with the warning 3 m / danger 5 m marks, the largest figure on the dashboard.

## [--:--] Tokens, shell, dashboard
- **Action:** globals.css (ink primary, lighter border + `rule` + `control` tokens, `on` darkened for 4.5:1, `hatch`
  replaced by `pill-unknown`); AppHeader.tsx rewritten (BrandMark staff-gauge SVG, grey-pill nav, no h1, usable from
  the client dashboard); DashboardClient.tsx rewritten (title row with receivedAt, one grid, 384px control rail);
  new LevelGauge.tsx, levels.ts (+ levels.test.ts), components/StatePill.tsx; readings cards, WaterLevelChart,
  CameraGrid, ControlPanel, DeviceSwitch, Go2RTCPlayer (spinner/dot classes only) restyled.
  Deleted DashboardHeaderClient.tsx (merged into AppHeader) and RadarCard.tsx (the gauge shows liquid + air gap).
- **Why:** the screen's question is "how high is the water, is it safe": the biggest figure must answer it.
  Thresholds moved to one module so the gauge and chart cannot disagree. CSV link moved next to the chart it exports.
- **Result:** tsc clean. Inspector: 0 FAIL (was 1). Readings at 4 columns broke Thai labels mid-word → 2 columns.
- **Lesson:** a sibling column of fixed width (the 384px rail) shrinks the main column more than the viewport suggests;
  size inner grids to the column, not to the window.
- **Test rig:** local mosquitto container (`wgw-design-mqtt`, 51883) publishing a Format B sample every 3 s.

## [--:--] Map, admin, login
- **Action:** page.tsx (map list with h1 + counts, 360px list, StatePill); admin/_components/AdminShell.tsx (new,
  one header/tabs/h1 frame), AdminNav (ink underline), admin/page.tsx (role and gate counts from a count-only query),
  users/page.tsx (table without header band, reset password folded into `<details>`, disable as a red text action),
  gates/page.tsx (one row per gate, edit form opens in place, create form below), login/page.tsx (mark + name).
- **Why:** admin overview was two links on an empty page; gates was 2.4 screens of open forms for 4 gates.
- **Result:** form field names and server actions unchanged; vitest 303/303; tsc clean; eslint clean.
- **Lesson:** `<details>/<summary>` gives a keyboard-accessible disclosure with zero JS, which suits server components.

## [--:--] Verification
- **Action:** `next build` + `next start` behind the cookie proxy; inspector `--app` on 8 screens; Browser pane look.
- **Result:** build OK. Inspector: 1 FAIL left on map = Leaflet/OSM attribution 5px from the edge (third-party credit,
  kept). WARN kept: hero-void on admin overview / no-device / login (short screens), ragged-row on the dashboard
  (sticky rail vs main column), no-poster on camera clips.
- **Dead end:** dev server behind the proxy never hydrated (Next 16 blocks cross-origin dev resources; HMR socket
  refused), so client data never loaded in screenshots. Production build behind the same proxy works.
- **Dead end:** threshold labels at insideTopRight sat on the line; moved to insideTopLeft (still data-dependent).

## Summary
- Changed: globals.css, layout unchanged; AppHeader, StatePill (new), DeviceSwitch, Go2RTCPlayer (classes), WaterGateMapLoader;
  dashboard DashboardClient + _components (LevelGauge, levels(.test), readings, chart, cameras, controls); map page;
  admin pages + AdminShell (new) + AdminNav; login page; DESIGN.md; .gitignore (/.taste-skill/).
- Deleted: src/components/DashboardHeaderClient.tsx, src/app/dashboard/_components/RadarCard.tsx.
- Unchanged: src/lib, src/hooks, src/app/api, server actions, form field names, proxy.ts.
- Remaining: confirm radar `liquid` and DB `water_height` share one datum (gauge vs chart); real-device look on site.
- Top 3 lessons:
  1. 📌 GENERAL: a "last updated" label must come from the data's timestamp, never the wall clock.
  2. 📌 GENERAL: put a threshold in one module when two views draw it; drift between them is a silent safety bug.
  3. 📌 GENERAL: Next dev behind a proxy on another origin will not hydrate; test client UI on `next start`.
- Mistakes & dead ends: inspector Chrome path; dev-mode hydration behind proxy; 4-column readings broke Thai labels.

## [--:--] Self sign-up (/register) — new task, same session
- **Decision (Leo):** sign-up gives instant `viewer` access, no admin approval; no migration.
- **Threat model (fast):** who: anyone on the internet. Worst: role escalation via a crafted field; email
  enumeration; scrypt (128 MiB/hash) memory DoS by sign-up spam; users-table flooding; strangers seeing cameras
  (accepted by Leo). Controls: role hard-coded server-side; same redirect + same scrypt work for new and existing
  emails (`on conflict do nothing`); per-IP 5/h + global 50/h limit before scrypt; parameterised SQL; audit row
  `user.register` with id + ip only.
- **Action:** src/app/register/{page,RegisterForm,actions,actions.test}.tsx/ts (new), rateLimit.ts (2 limiters),
  proxy.ts (/register public), login/page.tsx (link + "registered" notice).
- **Result:** vitest 314/314 (11 new), tsc + eslint clean.
- **Dead end:** first SQLi test used an email with spaces; the shape check rejected it before the DB, so the test
  asserted on a query that never ran. Rewrote it with a space-free payload that reaches the insert.
- **Lesson:** a validation test must prove the input reached the layer it claims to test.
- **Rejected:** auto sign-in after sign-up (would reveal which emails already exist: those cannot sign in).

## [--:--] QA, Haiku security tests, scrutinize
- **QA (browser, prod build):** mismatch error shown; bug found: React 19 reset the whole form after the action,
  so the email had to be retyped → email input made controlled. Sign-up → `/login?registered=1` → sign-in →
  viewer dashboard (read-only panel, no admin link). DB row role=viewer, audit `user.register` with id + ip.
- **Haiku agents (2, local rig only):** no SQLi/XSS/CRLF/open-redirect/mass-assignment/enumeration on /register;
  role field ignored; viewer gets 404 on /admin and 403 on /api/control; CSRF origin check holds.
- **Bug in this change (fixed):** limiter array evaluated both `hit()` before checking, so a client already refused
  per IP still spent the global quota. Now sequential; regression test fails on the old code, passes on the fix.
- **Pre-existing, not fixed (reported):** `clientIp` trusts the first X-Forwarded-For → per-IP limits (login and
  sign-up) bypassable unless `CLIENT_IP_HEADER=cf-connecting-ip` and the port is localhost-only; login timing
  differs for legacy bcrypt / malformed hashes vs unknown email (dummy scrypt); camera route caps 6 streams per
  user but has no global cap, which self sign-up makes reachable by anyone.
- **Wording:** the post-sign-up notice now holds for both new and existing emails.
- **Lesson:** 📌 GENERAL: `[a(), b()]` evaluates both calls before any check; rate limiters must short-circuit.
- **Lesson:** a test only proves a fix when it fails on the unfixed code; run it red first.

## [--:--] Fix the 3 remaining risks (TDD: each test red first)
- **Camera (route.ts):** global cap 12 streams + a 6-stream pool for viewers, both `429 camera_busy`; slots
  released on every exit path. Why: sign-up lets anyone open streams; operators must never be starved.
- **clientIp.ts:** default mode now takes the LAST X-Forwarded-For entry (the hop the proxy appended), not the
  first (client-chosen). `cf-connecting-ip` mode unchanged. Control route fixture reordered to the new contract.
  Next only fills XFF when absent (`base-server.js` `??=`), so direct access is still spoofable: the app must
  listen on loopback (`next start -H 127.0.0.1`), which the 2026-10-31 cutover log says the droplet does.
- **password.ts:** every rejection path runs one scrypt (malformed rows, foreign params, bad bcrypt cost,
  >72-byte bcrypt input); bcrypt rows run bcrypt + one scrypt. Tested by counting scrypt calls, not timing.
- **Result:** vitest 324/324, tsc + eslint clean, build OK. Rig re-test: timing 0.21–0.28 s both sides (was
  0.005 vs 0.200); spoofed first XFF entry no longer resets the bucket (6th sign-up limited).
- **Residual:** legacy bcrypt rows are ~bcrypt-cost slower than unknown emails until rehashed on next login.
  Rig server now bound to 127.0.0.1 (the agent saw it reachable on the LAN).
- **Lesson:** 📌 GENERAL: test timing defences by counting the expensive call, not by measuring wall time.
- **Lesson:** 📌 GENERAL: in X-Forwarded-For only the rightmost hop your own proxy appended is trustworthy.
