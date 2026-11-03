#!/usr/bin/env bash
# Pull deployer (Docker image flow): runs on the droplet as cmmc (systemd timer). Finds the newest successful
# main build, resolves its GHCR digest, pulls by digest, smoke-tests it on 127.0.0.1:3100, switches the live
# container, health-checks :3000, and rolls back to the previous image on failure. It never runs migrations.
# WHY pull: the droplet has no inbound SSH from CI and no deploy key in GitHub; the repo (and package) is public.
# WHY no build here: the droplet has ~450 MB RAM and no swap.
set -euo pipefail

REPO="${REPO:-leotawee/water-gate-way}"
IMAGE="${IMAGE:-ghcr.io/leotawee/water-gate-way}"
RUNS_API="${RUNS_API:-https://api.github.com/repos/$REPO/actions/runs?branch=main&conclusion=success&per_page=1}"
ROOT="${WGW_ROOT:-$HOME/wgw}"
STATE="$ROOT/last-deployed"
STATE_DIGEST="$ROOT/last-deployed.digest"
ENV_FILE="${ENV_FILE:-$ROOT/app.env}"
SMOKE_PORT="${SMOKE_PORT:-3100}"
LIVE_PORT="${LIVE_PORT:-3000}"
KEEP_IMAGES="${KEEP_IMAGES:-3}"
HEALTH_TRIES="${HEALTH_TRIES:-30}"
LIVE_NAME="${LIVE_NAME:-wgw-live}"
CAND_NAME="${CAND_NAME:-wgw-candidate}"

log() { printf '%s [deploy] %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "FAIL: $*"; exit 1; }

command -v curl jq docker >/dev/null || die "missing curl, jq or docker"

# WHY lock dir + pid: a slow deploy must not overlap the next timer tick; mkdir is atomic and works without flock.
# A lock whose pid is dead (crash, reboot mid-deploy) is stale and is taken over.
LOCK="$ROOT/.deploy.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if kill -0 "$(cat "$LOCK/pid" 2>/dev/null)" 2>/dev/null; then log "another deploy running, skip"; exit 0; fi
  log "stale lock, taking over"; rm -rf "$LOCK"; mkdir "$LOCK" || exit 0
fi
echo $$ >"$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

# Newest successful CI run on main: its head sha is the image tag sha-<full sha> pushed by the release job.
run_json="$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' "$RUNS_API")" || die "runs API unreachable"
sha="$(jq -r '.workflow_runs[0].head_sha // empty' <<<"$run_json")"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "no successful main run found"
tag="sha-$sha"
if [[ -f "$STATE" && "$(cat "$STATE")" == "$tag" ]]; then
  log "already deployed $tag"
  exit 0
fi

# Resolve the manifest digest anonymously (public package), then pull by digest: what was tested is exactly
# what runs, even if the tag were moved later.
tok="$(curl -fsS --max-time 20 "https://ghcr.io/token?scope=repository:$REPO:pull" | jq -r .token)" || die "ghcr token failed"
digest="$(curl -fsS --max-time 20 -I \
  -H "Authorization: Bearer $tok" \
  -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' \
  "https://ghcr.io/v2/$REPO/manifests/$tag" | tr -d '\r' | awk -F': ' 'tolower($1)=="docker-content-digest" {print $2}')" || die "manifest lookup failed for $tag"
[[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || die "no digest for $tag"

if [[ -f "$STATE_DIGEST" && "$(cat "$STATE_DIGEST")" == "$digest" ]]; then
  log "already deployed $digest"; printf '%s\n' "$tag" >"$STATE"; exit 0
fi

docker pull "$IMAGE@$digest" >/dev/null || die "docker pull failed for $digest"

# Hardening shared by candidate and live: loopback-only publish, read-only rootfs with a /tmp tmpfs,
# all capabilities dropped, no privilege escalation, 256 MB cap (droplet has ~450 MB, no swap).
# The server binds 0.0.0.0 INSIDE the container; only the publish maps it to 127.0.0.1 on the host.
# WHY host-gateway: the container is on the bridge network, so 127.0.0.1 inside it is NOT the host. If app.env
# reaches host services by loopback, the owner must point it at host.docker.internal (documented in the README).
# WHY $5 (optional KEY=VAL): the candidate shares the live DB, so it must not record water-level rows.
start_container() { # name port restart-policy image [env]
  docker run -d --name "$1" \
    --pull=never \
    --env-file "$ENV_FILE" \
    --publish "127.0.0.1:$2:3000" \
    --read-only --tmpfs /tmp \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --memory 256m \
    --add-host host.docker.internal:host-gateway \
    --restart "$3" \
    ${5:+--env} ${5:+"$5"} \
    "$4"
}

health() {
  local port="$1" code=000
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/login" || true)"
    [[ "$code" == 200 ]] && return 0
    sleep 1
  done
  return 1
}

# WHY host-gateway: the container is on the bridge network, so 127.0.0.1 inside it is NOT the host. If app.env
# reaches host services by loopback, the owner must point it at host.docker.internal (documented in the README).
prev_image=""
if docker inspect "$LIVE_NAME" >/dev/null 2>&1; then
  prev_image="$(docker inspect "$LIVE_NAME" --format '{{.Image}}')"
fi

# --- candidate on :3100 ---
docker rm -f "$CAND_NAME" >/dev/null 2>&1 || true
log "starting candidate $digest on 127.0.0.1:$SMOKE_PORT"
start_container "$CAND_NAME" "$SMOKE_PORT" no "$IMAGE@$digest" TELEMETRY_RECORD=0 >/dev/null || die "candidate run failed"
if ! health "$SMOKE_PORT"; then
  log "candidate unhealthy; log tail:"; docker logs --tail 20 "$CAND_NAME" >&2 || true
  docker rm -f "$CAND_NAME" >/dev/null 2>&1 || true
  die "candidate $digest rejected before switch; live container untouched"
fi
docker rm -f "$CAND_NAME" >/dev/null 2>&1 || true

# --- switch live on :3000 (restart policy keeps it up across reboots along with water-gate.service) ---
docker rm -f "$LIVE_NAME" >/dev/null 2>&1 || true
log "switching live to $digest"
if ! start_container "$LIVE_NAME" "$LIVE_PORT" unless-stopped "$IMAGE@$digest" >/dev/null; then
  log "live run failed; rolling back"
  if [[ -n "$prev_image" ]]; then
    start_container "$LIVE_NAME" "$LIVE_PORT" unless-stopped "$prev_image" >/dev/null || true
  fi
  die "live container failed to start from $digest"
fi

if ! health "$LIVE_PORT"; then
  log "live health failed after switch; rolling back"
  docker rm -f "$LIVE_NAME" >/dev/null 2>&1 || true
  if [[ -n "$prev_image" ]]; then
    start_container "$LIVE_NAME" "$LIVE_PORT" unless-stopped "$prev_image" >/dev/null || true
    if health "$LIVE_PORT"; then log "rolled back to $prev_image"; else log "rollback also unhealthy: check docker logs $LIVE_NAME"; fi
  else
    log "no previous image; nothing to roll back to"
  fi
  die "rolled back from $digest"
fi

printf '%s\n' "$digest" >"$STATE_DIGEST"
printf '%s\n' "$tag" >"$STATE"
log "live: $tag ($digest)"

# Keep the $KEEP_IMAGES newest local images of this repo plus the running one; remove the rest.
running="$(docker inspect "$LIVE_NAME" --format '{{.Image}}' 2>/dev/null || true)"
docker images "$IMAGE" --format '{{.CreatedAt}}|{{.ID}}' 2>/dev/null | sort -r | tail -n +"$((KEEP_IMAGES + 1))" | cut -d'|' -f2 |
  while read -r id; do
    [[ -z "$id" || "$id" == "$running" ]] && continue
    log "removing old image $id"
    docker rmi -f "$id" >/dev/null 2>&1 || true
  done
