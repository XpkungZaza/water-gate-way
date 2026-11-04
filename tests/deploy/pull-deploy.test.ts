import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// End-to-end tests for deploy/pull/pull-deploy.sh using a fake docker + fake curl on PATH.
// The fakes emulate the GHCR token + manifest HEAD, the Actions runs API, container lifecycle,
// and loopback health probes. Health codes are controlled per port via files in the sandbox.

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const DIGEST = "sha256:" + "c".repeat(64);
const SCRIPT = join(__dirname, "..", "..", "deploy", "pull", "pull-deploy.sh");
const COMPOSE = join(__dirname, "..", "..", "deploy", "pull", "docker-compose.yml");
const PREV = "ghcr.io/leotawee/water-gate-way@sha256:" + "d".repeat(64);
// Fake docker: records every call (with the compose variables) and emulates `compose up/down/logs`, `inspect`,
// `images`, `pull`, `rmi`. containers.txt maps compose project -> image reference.
const FAKE_DOCKER = String.raw`#!/usr/bin/env bash
S="$WGW_FAKE_STATE"
echo "docker $* [image=$WGW_IMAGE port=$WGW_PORT rec=$TELEMETRY_RECORD]" >>"$S/calls.log"
c="$S/containers.txt"
setp() { touch "$c"; grep -v "^$1 " "$c" >"$c.tmp" 2>/dev/null || true; mv "$c.tmp" "$c"; echo "$1 $2" >>"$c"; }
delp() { [ -f "$c" ] || return 0; grep -v "^$1 " "$c" >"$c.tmp" 2>/dev/null || true; mv "$c.tmp" "$c"; }
getp() { [ -f "$c" ] || return 1; while read -r p i; do [ "$p" = "$1" ] && { echo "$i"; return 0; }; done <"$c"; return 1; }
case "$1" in
  pull) exit 0 ;;
  compose)
    shift; proj=""
    while [ $# -gt 0 ]; do
      case "$1" in -p) proj="$2"; shift 2 ;; -f) shift 2 ;; *) break ;; esac
    done
    case "$1" in
      up) [ "$WGW_IMAGE" = "img-crash" ] && exit 1; setp "$proj" "$WGW_IMAGE"; exit 0 ;;
      down) delp "$proj"; exit 0 ;;
    esac
    exit 0 ;;
  inspect)
    if img="$(getp wgw-web)"; then
      case "$4" in *Config.Image*) echo "$img" ;; *) echo "img-prev" ;; esac
      exit 0
    fi
    exit 1 ;;
  images) [ -f "$S/images.txt" ] && cat "$S/images.txt"; exit 0 ;;
  *) exit 0 ;;
esac
`;
const FAKE_CURL_B64 = "IyEvdXNyL2Jpbi9lbnYgYmFzaApTPSIkV0dXX0ZBS0VfU1RBVEUiCnVybD0iJHtAOiAtMX0iCmNhc2UgIiR1cmwiIGluCiAgKiIvdG9rZW4/IiopIGVjaG8gJ3sidG9rZW4iOiJ0In0nOyBleGl0IDAgOzsKICAqImdoY3IuaW8vdjIvIiopIHByaW50ZiAnSFRUUC8xLjEgMjAwIE9LXHJcbkRvY2tlci1Db250ZW50LURpZ2VzdDogJXNcclxuXHJcbicgIiRXR1dfRkFLRV9ESUdFU1QiOyBleGl0IDAgOzsKICAqImFjdGlvbnMvcnVucyIqKSBwcmludGYgJ3sid29ya2Zsb3dfcnVucyI6W3siaGVhZF9zaGEiOiIlcyJ9XX0nICIkKGNhdCAiJFMvbmV3X3NoYSIpIjsgZXhpdCAwIDs7CmVzYWMKY29kZT0yMDAKY2FzZSAiJHVybCIgaW4KICAqIjozMTAwLyIqKSBbIC1mICIkUy9zbW9rZV9jb2RlIiBdICYmIGNvZGU9IiQoY2F0ICIkUy9zbW9rZV9jb2RlIikiIDs7CiAgKiI6MzAwMC8iKikgWyAtZiAiJFMvbGl2ZV9jb2RlIiBdICYmIGNvZGU9IiQoY2F0ICIkUy9saXZlX2NvZGUiKSIgOzsKZXNhYwplY2hvICIkY29kZSIKZXhpdCAw";

let sandbox = "";
const sandboxes: string[] = [];

function writeInSandbox(rel: string, content: string) {
  writeFileSync(join(sandbox, rel), content);
}

const IMAGES_FIXTURE = [
  "2026-01-05 00:00:00 +0000 UTC|img-new1",
  "2026-01-04 00:00:00 +0000 UTC|img-new2",
  "2026-01-03 00:00:00 +0000 UTC|img-prev",
  "2026-01-02 00:00:00 +0000 UTC|img-old4",
  "2026-01-01 00:00:00 +0000 UTC|img-old5",
].join("\n");

type Opts = { newSha: string; liveCode?: string; smokeCode?: string; preLive?: string; images?: string; stateSha?: string };

function setupSandbox(o: Opts) {
  sandbox = mkdtempSync(join(tmpdir(), "wgw-deploy-"));
  sandboxes.push(sandbox);
  mkdirSync(join(sandbox, "bin"));
  writeFileSync(join(sandbox, "bin", "docker"), FAKE_DOCKER, { mode: 0o755 });
  writeFileSync(join(sandbox, "bin", "curl"), Buffer.from(FAKE_CURL_B64, "base64"), { mode: 0o755 });
  writeInSandbox("new_sha", o.newSha);
  writeInSandbox("calls.log", "");
  if (o.liveCode) writeInSandbox("live_code", o.liveCode);
  if (o.smokeCode) writeInSandbox("smoke_code", o.smokeCode);
  if (o.preLive) writeInSandbox("containers.txt", "wgw-web " + o.preLive + "\n");
  if (o.images) writeInSandbox("images.txt", o.images);
  mkdirSync(join(sandbox, "wgw"));
  writeInSandbox("wgw/app.env", "PGHOST=x\n");
  if (o.stateSha) writeInSandbox("wgw/last-deployed", "sha-" + o.stateSha + "\n");
}

function runDeployer(extraEnv: Record<string, string> = {}): { code: number; log: string; out: string } {
  let out = "";
  let code = 0;
  try {
    out = execFileSync("bash", [SCRIPT], {
      env: {
        ...process.env,
        PATH: join(sandbox, "bin") + ":" + process.env.PATH,
        WGW_ROOT: join(sandbox, "wgw"),
        ENV_FILE: join(sandbox, "wgw", "app.env"),
        WGW_COMPOSE: COMPOSE,
        RUNS_API: "http://fake.local/actions/runs",
        IMAGE: "ghcr.io/leotawee/water-gate-way",
        HEALTH_TRIES: "2",
        KEEP_IMAGES: "3",
        WGW_FAKE_STATE: sandbox,
        WGW_FAKE_DIGEST: DIGEST,
        ...extraEnv,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    code = err.status ?? 1;
    out = (err.stdout ?? "") + (err.stderr ?? "");
  }
  const log = readFileSync(join(sandbox, "calls.log"), "utf8");
  return { code, log, out };
}

afterAll(() => {
  for (const s of sandboxes) rmSync(s, { recursive: true, force: true });
});

const REF = "ghcr.io/leotawee/water-gate-way@" + DIGEST;
const composeCalls = (log: string, project: string) =>
  log.split("\n").filter((l) => l.startsWith("docker compose -p " + project + " "));

describe("deploy/pull/pull-deploy.sh (fake docker compose)", () => {
  it("deploys a new tag: candidate ok, live switched, state written, old images pruned", () => {
    setupSandbox({ newSha: SHA_A, preLive: PREV, images: IMAGES_FIXTURE });
    const r = runDeployer();
    expect(r.code).toBe(0);
    expect(r.log).toContain("docker pull " + REF);
    // candidate: port 3100, must not record rows, then torn down
    const cand = composeCalls(r.log, "wgw-candidate");
    const candUp = cand.find((l) => l.includes(" up -d"));
    expect(candUp).toContain("up -d --pull never");
    expect(candUp).toContain("image=" + REF + " port=3100 rec=0");
    expect(cand.some((l) => l.includes(" down"))).toBe(true);
    // live: port 3000, records rows, same pinned digest
    const live = composeCalls(r.log, "wgw-web");
    expect(live[0]).toContain("image=" + REF + " port=3000 rec=1");
    expect(readFileSync(join(sandbox, "wgw", "last-deployed"), "utf8")).toBe("sha-" + SHA_A + "\n");
    expect(readFileSync(join(sandbox, "wgw", "last-deployed.digest"), "utf8")).toBe(DIGEST + "\n");
    // cleanup runs BEFORE the pull: only the newest image + the running one (img-prev) survive it
    const lines = r.log.split("\n");
    const pullAt = lines.findIndex((l) => l.startsWith("docker pull"));
    const rmiBefore = lines.slice(0, pullAt).filter((l) => l.startsWith("docker rmi"));
    expect(rmiBefore).toEqual(["docker rmi -f img-new2 [image= port= rec=]", "docker rmi -f img-old4 [image= port= rec=]", "docker rmi -f img-old5 [image= port= rec=]"]);
    // after the deploy: keep 3 newest (KEEP_IMAGES=3 in this test) + the running one
    expect(r.log).not.toContain("docker rmi -f img-prev");
    expect(r.log).not.toContain("docker rmi -f img-new1");
  });

  it("is a no-op when the tag is already deployed", () => {
    setupSandbox({ newSha: SHA_A, stateSha: SHA_A });
    const r = runDeployer();
    expect(r.code).toBe(0);
    expect(r.log).not.toContain("docker compose");
    expect(r.log).not.toContain("docker pull");
  });

  it("leaves live untouched when the candidate is unhealthy", () => {
    setupSandbox({ newSha: SHA_B, smokeCode: "000", preLive: PREV });
    const r = runDeployer();
    expect(r.code).not.toBe(0);
    expect(composeCalls(r.log, "wgw-candidate").length).toBeGreaterThan(0);
    expect(composeCalls(r.log, "wgw-web")).toHaveLength(0);
    expect(r.out).toContain("live container untouched");
    expect(existsSync(join(sandbox, "wgw", "last-deployed"))).toBe(false);
  });

  it("rolls back to the previous image when live is unhealthy after the switch", () => {
    setupSandbox({ newSha: SHA_B, liveCode: "000", preLive: PREV });
    const r = runDeployer();
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("rolled back");
    const live = composeCalls(r.log, "wgw-web");
    expect(live[0]).toContain("image=" + REF);
    expect(live[1]).toContain("image=" + PREV);
    expect(readFileSync(join(sandbox, "containers.txt"), "utf8")).toContain("wgw-web " + PREV);
    expect(existsSync(join(sandbox, "wgw", "last-deployed"))).toBe(false);
  });

  it("push deploy: uses the sha from SSH_ORIGINAL_COMMAND instead of the runs API", () => {
    setupSandbox({ newSha: SHA_A }); // the runs API would say A
    const r = runDeployer({ SSH_ORIGINAL_COMMAND: SHA_B });
    expect(r.code).toBe(0);
    expect(readFileSync(join(sandbox, "wgw", "last-deployed"), "utf8")).toBe("sha-" + SHA_B + "\n");
  });

  it("push deploy: rejects anything that is not a 40-char sha, before touching docker", () => {
    setupSandbox({ newSha: SHA_A });
    const r = runDeployer({ SSH_ORIGINAL_COMMAND: "abc; rm -rf ~" });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("not a 40-char commit sha");
    expect(r.log).not.toContain("docker");
  });
});
