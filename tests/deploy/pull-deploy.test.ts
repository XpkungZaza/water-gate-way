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
const FAKE_DOCKER_B64 = "IyEvdXNyL2Jpbi9lbnYgYmFzaApTPSIkV0dXX0ZBS0VfU1RBVEUiCmVjaG8gImRvY2tlciAkKiIgPj4gIiRTL2NhbGxzLmxvZyIKY21kPSIkMSIKY29udGFpbmVycz0iJFMvY29udGFpbmVycy50eHQiCmdldF9pbWcoKSB7CiAgWyAtZiAiJGNvbnRhaW5lcnMiIF0gfHwgcmV0dXJuIDEKICB3aGlsZSByZWFkIC1yIG4gaW1nOyBkbyBbICIkbiIgPSAiJDEiIF0gJiYgeyBlY2hvICIkaW1nIjsgcmV0dXJuIDA7IH07IGRvbmUgPCIkY29udGFpbmVycyIKICByZXR1cm4gMQp9CnNldF9pbWcoKSB7CiAgdG91Y2ggIiRjb250YWluZXJzIgogIGdyZXAgLXYgIl4kMSAiICIkY29udGFpbmVycyIgPiIkY29udGFpbmVycy50bXAiIDI+L2Rldi9udWxsIHx8IHRydWUKICBtdiAiJGNvbnRhaW5lcnMudG1wIiAiJGNvbnRhaW5lcnMiCiAgZWNobyAiJDEgJDIiID4+IiRjb250YWluZXJzIgp9CmRlbF9pbWcoKSB7CiAgWyAtZiAiJGNvbnRhaW5lcnMiIF0gfHwgcmV0dXJuIDAKICBncmVwIC12ICJeJDEgIiAiJGNvbnRhaW5lcnMiID4iJGNvbnRhaW5lcnMudG1wIiAyPi9kZXYvbnVsbCB8fCB0cnVlCiAgbXYgIiRjb250YWluZXJzLnRtcCIgIiRjb250YWluZXJzIgp9CmNhc2UgIiRjbWQiIGluCiAgcHVsbCkgZXhpdCAwIDs7CiAgcnVuKQogICAgc2hpZnQ7IG5hbWU9IiI7IGltZz0iIgogICAgd2hpbGUgWyAkIyAtZ3QgMCBdOyBkbwogICAgICBjYXNlICIkMSIgaW4KICAgICAgICAtLW5hbWUpIG5hbWU9IiQyIjsgc2hpZnQgMiA7OwogICAgICAgIC1kKSBzaGlmdCA7OwogICAgICAgIC0tcHVsbD1uZXZlcnwtLXJlYWQtb25seXwtLXJlc3RhcnR8LS1yZXN0YXJ0PW5vfC0tcmVzdGFydD11bmxlc3Mtc3RvcHBlZCkgc2hpZnQgOzsKICAgICAgICAtLWVudi1maWxlfC0tdG1wZnN8LS1jYXAtZHJvcHwtLXNlY3VyaXR5LW9wdHwtLW1lbW9yeXwtLXB1Ymxpc2h8LS1hZGQtaG9zdCkgc2hpZnQgMiA7OwogICAgICAgICopIGltZz0iJDEiOyBzaGlmdCA7OwogICAgICBlc2FjCiAgICBkb25lCiAgICBbIC1uICIkbmFtZSIgXSB8fCBleGl0IDEKICAgIFsgIiRpbWciID0gImltZy1jcmFzaCIgXSAmJiBleGl0IDEKICAgIHNldF9pbWcgIiRuYW1lIiAiJGltZyIKICAgIGVjaG8gImlkLSRuYW1lIgogICAgOzsKICBybSkgZGVsX2ltZyAiJDQiOyBleGl0IDAgOzsKICBzdGFydCkgZXhpdCAwIDs7CiAgbG9ncykgZXhpdCAwIDs7CiAgaW5zcGVjdCkKICAgIG5hbWU9IiQyIgogICAgaWYgaW1nPSIkKGdldF9pbWcgIiRuYW1lIikiOyB0aGVuCiAgICAgIGNhc2UgIiQ0IiBpbiAqSW1hZ2UqKSBlY2hvICIkaW1nIiA7OyAqKSBlY2hvICJpZC0kbmFtZSIgOzsgZXNhYwogICAgICBleGl0IDAKICAgIGZpCiAgICBleGl0IDEgOzsKICBpbWFnZXMpIFsgLWYgIiRTL2ltYWdlcy50eHQiIF0gJiYgY2F0ICIkUy9pbWFnZXMudHh0IjsgZXhpdCAwIDs7CiAgcm1pKSBleGl0IDAgOzsKICAqKSBleGl0IDAgOzsKZXNhYw==";
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
  writeFileSync(join(sandbox, "bin", "docker"), Buffer.from(FAKE_DOCKER_B64, "base64"), { mode: 0o755 });
  writeFileSync(join(sandbox, "bin", "curl"), Buffer.from(FAKE_CURL_B64, "base64"), { mode: 0o755 });
  writeInSandbox("new_sha", o.newSha);
  writeInSandbox("calls.log", "");
  if (o.liveCode) writeInSandbox("live_code", o.liveCode);
  if (o.smokeCode) writeInSandbox("smoke_code", o.smokeCode);
  if (o.preLive) writeInSandbox("containers.txt", "wgw-live " + o.preLive + "\n");
  if (o.images) writeInSandbox("images.txt", o.images);
  mkdirSync(join(sandbox, "wgw"));
  writeInSandbox("wgw/app.env", "PGHOST=x\n");
  if (o.stateSha) writeInSandbox("wgw/last-deployed", "sha-" + o.stateSha + "\n");
}

function runDeployer(): { code: number; log: string; out: string } {
  let out = "";
  let code = 0;
  try {
    out = execFileSync("bash", [SCRIPT], {
      env: {
        ...process.env,
        PATH: join(sandbox, "bin") + ":" + process.env.PATH,
        WGW_ROOT: join(sandbox, "wgw"),
        ENV_FILE: join(sandbox, "wgw", "app.env"),
        RUNS_API: "http://fake.local/actions/runs",
        IMAGE: "ghcr.io/leotawee/water-gate-way",
        HEALTH_TRIES: "2",
        KEEP_IMAGES: "3",
        WGW_FAKE_STATE: sandbox,
        WGW_FAKE_DIGEST: DIGEST,
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

describe("deploy/pull/pull-deploy.sh (fake docker)", () => {
  it("deploys a new tag: candidate ok, live switched, state written, old images pruned", () => {
    setupSandbox({ newSha: SHA_A, preLive: "img-prev", images: IMAGES_FIXTURE });
    const r = runDeployer();
    expect(r.code).toBe(0);
    expect(r.log).toContain("docker run -d --name wgw-candidate");
    expect(r.log).toContain("docker run -d --name wgw-live");
    expect(r.log).toContain("docker pull ghcr.io/leotawee/water-gate-way@" + DIGEST);
    expect(r.log).not.toContain("img-prev ");
    // publish is loopback-only and the container is hardened
    expect(r.log).toContain("--publish 127.0.0.1:3000:3000");
    expect(r.log).not.toMatch(/--publish 0\.0\.0\.0/);
    expect(r.log).toContain("--read-only");
    expect(r.log).toContain("--cap-drop ALL");
    expect(r.log).toContain("--memory 256m");
    expect(readFileSync(join(sandbox, "wgw", "last-deployed"), "utf8")).toBe("sha-" + SHA_A + "\n");
    // prune: keep 3 newest + the running image; the two oldest go
    expect(r.log).toContain("docker rmi -f img-old4");
    expect(r.log).toContain("docker rmi -f img-old5");
    expect(r.log).not.toContain("docker rmi -f img-prev");
    expect(r.log).not.toContain("docker rmi -f img-new1");
  });

  it("is a no-op when the tag is already deployed", () => {
    setupSandbox({ newSha: SHA_A, stateSha: SHA_A });
    const r = runDeployer();
    expect(r.code).toBe(0);
    expect(r.log).not.toContain("docker run");
    expect(r.log).not.toContain("docker pull");
  });

  it("leaves live untouched when the candidate is unhealthy", () => {
    setupSandbox({ newSha: SHA_B, smokeCode: "000", preLive: "img-prev" });
    const r = runDeployer();
    expect(r.code).not.toBe(0);
    expect(r.log).toContain("docker run -d --name wgw-candidate");
    expect(r.log).not.toContain("docker run -d --name wgw-live");
    expect(r.out).toContain("live container untouched");
    expect(existsSync(join(sandbox, "wgw", "last-deployed"))).toBe(false);
  });

  it("rolls back to the previous image when live is unhealthy after the switch", () => {
    setupSandbox({ newSha: SHA_B, liveCode: "000", preLive: "img-prev" });
    const r = runDeployer();
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("rolled back");
    expect(readFileSync(join(sandbox, "containers.txt"), "utf8")).toContain("wgw-live img-prev");
    expect(existsSync(join(sandbox, "wgw", "last-deployed"))).toBe(false);
  });
});