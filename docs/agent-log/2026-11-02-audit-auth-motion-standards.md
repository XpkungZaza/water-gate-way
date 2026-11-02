# 2026-11-02 audit: auth UX, remember-me, motion, web standards

## Summary
- Changed: 4 GLM-5.3-Flash agents (opencode, isolated worktrees) → reviewed and integrated by hand.
  - 1a: `PasswordField` (show/hide + Caps Lock), Login/Register forms, `capsLock.ts`.
  - 1b: remember-me (`remember.ts`, `/api/auth/restore`, migration 003, proxy/dal/login/admin revocation).
  - 2: motion tokens + classes, reduced motion, `template.tsx`, `<details>` disclosure.
  - 3: error/not-found/loading, metadata/viewport, robots/manifest, CSP + Permissions-Policy + COOP, skip link.
  - Assistant: rounded favicon/icon/apple-icon; integration fixes below.
- Integration fixes found by review/e2e (not by the agents):
  1. Caps Lock keydown toggled `!caps` (could invert) → use `getModifierState` on every key event.
  2. Title template doubled the suffix on login/register → page titles drop the suffix.
  3. `.page-enter` fill-mode `both` left a transform on the route wrapper → `backwards`.
  4. Restore redirect used `request.url` (server hostname = localhost) → relative `Location`.
  5. Proxy matcher sent `manifest.webmanifest`/`robots.txt` to /login → exempted.
  6. `/login` with a live session and a remember cookie rotated the token for nothing → skipped.
- Not done: commit, push, migration 003 on prod, deploy.

## Lessons
1. 📌 GENERAL: a Route Handler's `request.url` carries the configured host, not the browser's Host; redirect relatively.
2. 📌 GENERAL: anonymous-fetched assets (manifest, robots) must be excluded from an auth proxy matcher.
3. 📌 GENERAL: an animation fill-mode that keeps `transform` after the end makes the element a containing block.

## Mistakes & dead ends
- ImageMagick intermediate PNG lost colour (Gray); built the ICO by hand.
- First e2e run hit per-email/IP login limits → one account and source IP per section.
- Symlinked node_modules breaks Turbopack builds in a worktree → `cp -Rc`.
