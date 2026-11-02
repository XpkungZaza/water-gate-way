// WHY: pure JS (node:crypto + bcryptjs, no native addon) — scripts/create-user.ts imports this under plain `node` (no `@/` alias).
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import bcrypt from "bcryptjs";

// WHY: legacy rows from the old app. Verify only; every successful login rewrites them to scrypt (see needsRehash).
const BCRYPT_RE = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/;
const BCRYPT_MIN_COST = 4;
const BCRYPT_MAX_COST = 12;

const N = 2 ** 17;
const R = 8;
const P = 1;
const SALT_LEN = 16;
const KEY_LEN = 64;
// scrypt needs ~128*N*r bytes (128 MiB); Node's default maxmem (32 MiB) would reject it.
const OPTS: ScryptOptions = { N, r: R, p: P, maxmem: 256 * 1024 * 1024 };

function derive(plain: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(plain.normalize("NFKC"), salt, KEY_LEN, OPTS, (e, k) => (e ? reject(e) : resolve(k))),
  );
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await derive(plain, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** True when the stored value is not a current scrypt hash (legacy bcrypt). */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith("scrypt$");
}

// WHY: rejection paths that skip scrypt must still pay for one, or the time they save shows which rows exist.
const DUMMY_SALT = Buffer.alloc(SALT_LEN);

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  let ok = false;
  let ranScrypt = false;
  try {
    if (stored.startsWith("$2")) {
      const m = BCRYPT_RE.exec(stored);
      const cost = m ? Number(m[1]) : NaN;
      // WHY: the cost comes from the row, so cap it: an attacker-written cost 31 would stall the login for hours.
      // WHY: bcrypt ignores bytes after 72, so a longer input would match on its prefix alone.
      if (m && cost >= BCRYPT_MIN_COST && cost <= BCRYPT_MAX_COST && Buffer.byteLength(plain, "utf8") <= 72) {
        ok = await bcrypt.compare(plain, stored);
      }
    } else {
      const [alg, n, r, p, saltB64, hashB64, extra] = stored.split("$");
      const salt = Buffer.from(saltB64 ?? "", "base64");
      const expected = Buffer.from(hashB64 ?? "", "base64");
      // WHY: only accept our fixed params so a tampered row cannot pick cost (DoS) or weaken hashing.
      if (
        extra === undefined &&
        alg === "scrypt" &&
        n === String(N) &&
        r === String(R) &&
        p === String(P) &&
        salt.length === SALT_LEN &&
        expected.length === KEY_LEN
      ) {
        const actual = await derive(plain, salt);
        ranScrypt = true;
        ok = timingSafeEqual(actual, expected);
      }
    }
  } catch {
    ok = false;
  }
  // shortcut: a legacy bcrypt row still costs bcrypt + scrypt, so it is slower than an unknown email until it is
  // rehashed on its next login; force-reset legacy rows to close that gap fully.
  if (!ranScrypt) await derive(plain, DUMMY_SALT).catch(() => undefined);
  return ok;
}
