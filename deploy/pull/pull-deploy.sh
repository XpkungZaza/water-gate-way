#!/usr/bin/env bash
# Pull deployer: runs on the droplet as cmmc (systemd timer). Fetches the newest build release from GitHub,
# verifies its checksum, smoke-tests it on loopback, switches `current`, restarts water-gate, and rolls back
# on a failed health check. It never runs migrations (db/migrations stay a manual, approved step).
# WHY pull: the droplet has no inbound SSH from CI and no deploy key in GitHub secrets.
# WHY no build here: the droplet has ~450 MB free and no swap; `npm ci` was OOM-killed before (see deploy runbook).
set -euo pipefail

REPO="${REPO:-leotawee/water-gate-way}"
API="${RELEASE_API:-https://api.github.com/repos/$REPO/releases/latest}"
ROOT="${WGW_ROOT:-$HOME/wgw}"
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
STATE="$ROOT/last-deployed"
ENV_FILE="${ENV_FILE:-$ROOT/app.env}"
SMOKE_PORT="${SMOKE_PORT:-3100}"
LIVE_PORT="${LIVE_PORT:-3000}"
KEEP=5
# WHY overridable: tests replace these with a fake app and fake release.
START_CMD="${START_CMD:-node_modules/.bin/next start -H 127.0.0.1}"
RESTART_CMD="${RESTART_CMD:-sudo -n /usr/bin/systemctl restart water-gate}"

log() { printf '%s [deploy] %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "FAIL: $*"; exit 1; }

command -v curl >/dev/null && command -v jq >/dev/null && command -v sha256sum >/dev/null || die "missing curl, jq or sha256sum"
mkdir -p "$RELEASES"

# WHY lock dir + pid: a slow deploy must not overlap the next timer tick; mkdir is atomic and works without flock.
# A lock whose pid is dead (crash, reboot mid-deploy) is stale and is taken over, so one crash cannot stop deploys.
LOCK="$ROOT/.deploy.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if kill -0 "$(cat "$LOCK/pid" 2>/dev/null)" 2>/dev/null; then log "another deploy running, skip"; exit 0; fi
  log "stale lock, taking over"; rm -rf "$LOCK"; mkdir "$LOCK" || exit 0
fi
echo $$ >"$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

release_json="$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' "$API")" || die "release API unreachable"
tag="$(jq -r '.tag_name' <<<"$release_json")"
[[ "$tag" =~ ^build-[0-9a-f]{40}$ ]] || die "unexpected tag: $tag"
sha="${tag#build-}"

if [[ -f "$STATE" && "$(cat "$STATE")" == "$tag" ]]; then
  log "already deployed $tag"
  exit 0
fi

url_of() { jq -r --arg n "$1" '.assets[] | select(.name == $n) | .browser_download_url' <<<"$release_json"; }
tar_url="$(url_of "wgw-$sha.tar.gz")"
sum_url="$(url_of "wgw-$sha.tar.gz.sha256")"
[[ -n "$tar_url" && -n "$sum_url" ]] || die "release $tag has no artifact pair"

dir="$RELEASES/$tag"
# A dir for this tag that is not live is a partial extract from a crashed run: discard it.
[[ -e "$dir" && "$(readlink -f "$CURRENT")" == "$(readlink -f "$dir")" ]] && die "$tag is current but state file differs; fix by hand"
rm -rf "$dir"
stage="$RELEASES/.incoming-$tag"
rm -rf "$stage" && mkdir -p "$stage"
trap 'rm -rf "$stage" "$LOCK"' EXIT

log "download $tag"
curl -fsS --max-time 300 -o "$stage/wgw.tar.gz" "$tar_url"
curl -fsS --max-time 20 -o "$stage/wgw.sha256" "$sum_url"
# WHY: checksum from the same release is integrity only (a compromised release defeats it); GitHub release
# assets over HTTPS are the trust root here. Verify before anything is extracted or executed.
(cd "$stage" && sha256sum -c wgw.sha256 --quiet) || die "checksum mismatch for $tag"

mkdir "$stage/app"
tar -xzf "$stage/wgw.tar.gz" -C "$stage/app"
mv "$stage/app" "$dir"

# Health probe on loopback. Starts the new build on SMOKE_PORT with the real env, checks /login, stops it.
probe() {
  local pid
  ( cd "$1" && set -a && . "$ENV_FILE" && set +a && PORT="$SMOKE_PORT" exec $START_CMD -p "$SMOKE_PORT" ) >"$stage/smoke.log" 2>&1 &
  pid=$!
  local code=000
  for _ in $(seq 1 30); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$SMOKE_PORT/login" || true)"
    [[ "$code" == 200 ]] && break
    sleep 1
  done
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  [[ "$code" == 200 ]]
}

if ! probe "$dir"; then
  log "smoke failed; log tail:"; tail -20 "$stage/smoke.log" >&2 || true
  rm -rf "$dir"
  die "release $tag rejected before switch; live app untouched"
fi

previous=""
[[ -L "$CURRENT" ]] && previous="$(readlink -f "$CURRENT")"

# shortcut: ln -sfn is unlink+symlink, not a rename, so a reader can briefly see no `current`; systemd restarts right after.
switch() { ln -sfn "$1" "$CURRENT"; }

switch "$dir"
log "switched current -> $tag, restarting"
$RESTART_CMD || { log "restart command failed"; }

health_live() {
  for _ in $(seq 1 20); do
    [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$LIVE_PORT/login" || true)" == 200 ]] && return 0
    sleep 1
  done
  return 1
}

if ! health_live; then
  log "live health failed after switch; rolling back"
  if [[ -n "$previous" ]]; then
    switch "$previous"
    $RESTART_CMD || true
    health_live || log "rollback also unhealthy: check systemctl status water-gate"
  fi
  die "rolled back from $tag"
fi

printf '%s\n' "$tag" >"$STATE"
log "live: $tag"

# Keep the newest $KEEP releases plus the live one (rollback is one symlink away).
ls -1dt "$RELEASES"/build-* 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  [[ "$(readlink -f "$CURRENT")" == "$(readlink -f "$old")" ]] && continue
  rm -rf "$old"
done
