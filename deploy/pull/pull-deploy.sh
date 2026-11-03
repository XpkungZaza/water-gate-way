#!/usr/bin/env bash
# Pull deployer (Docker Compose): runs on the droplet as cmmc (systemd timer). Finds the newest successful
# main build, resolves its GHCR digest, pulls by digest, smoke-tests it with `docker compose` on
# 127.0.0.1:3100, switches the live compose project, health-checks :3000, and rolls back to the previous image
# on failure. It never runs migrations.
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
# WHY not COMPOSE_FILE: docker compose reads that variable itself.
WGW_COMPOSE="${WGW_COMPOSE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/docker-compose.yml}"
SMOKE_PORT="${SMOKE_PORT:-3100}"
LIVE_PORT="${LIVE_PORT:-3000}"
KEEP_IMAGES="${KEEP_IMAGES:-3}"
HEALTH_TRIES="${HEALTH_TRIES:-30}"
LIVE_PROJECT="${LIVE_PROJECT:-wgw}"
CAND_PROJECT="${CAND_PROJECT:-wgw-candidate}"
LIVE_CONTAINER="$LIVE_PROJECT-app-1"

log() { printf '%s [deploy] %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "FAIL: $*"; exit 1; }

command -v curl jq docker >/dev/null || die "missing curl, jq or docker"
[[ -f "$WGW_COMPOSE" ]] || die "compose file not found: $WGW_COMPOSE"

# WHY lock dir + pid: a slow deploy must not overlap the next timer tick; mkdir is atomic and works without flock.
# A lock whose pid is dead (crash, reboot mid-deploy) is stale and is taken over.
LOCK="$ROOT/.deploy.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if kill -0 "$(cat "$LOCK/pid" 2>/dev/null)" 2>/dev/null; then log "another deploy running, skip"; exit 0; fi
  log "stale lock, taking over"; rm -rf "$LOCK"; mkdir "$LOCK" || exit 0
fi
echo $$ >"$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

# A push deploy (Actions over Tailscale) names the exact commit: via the forced SSH command (SSH_ORIGINAL_COMMAND)
# or $1. Otherwise (timer) take the newest successful CI run on main. Either way the image tag is sha-<full sha>,
# pushed by the release job. WHY validate: the value comes from the network and is used in a URL.
req="${SSH_ORIGINAL_COMMAND:-${1:-}}"
if [[ -n "$req" ]]; then
  [[ "$req" =~ ^[0-9a-f]{40}$ ]] || die "argument is not a 40-char commit sha"
  sha="$req"
else
  run_json="$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' "$RUNS_API")" || die "runs API unreachable"
  sha="$(jq -r '.workflow_runs[0].head_sha // empty' <<<"$run_json")"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "no successful main run found"
fi
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

new_ref="$IMAGE@$digest"
docker pull "$new_ref" >/dev/null || die "docker pull failed for $digest"

# dc <project> <image> <host port> <record telemetry 0|1> <compose args...>
# Hardening (loopback-only publish, read-only rootfs, cap_drop ALL, no-new-privileges, 256 MB) lives in the compose file.
# --pull never on `up`: the image was just pulled by digest, and a rollback target must come from the local cache.
dc() {
  local project="$1" image="$2" port="$3" record="$4"
  shift 4
  WGW_IMAGE="$image" WGW_PORT="$port" TELEMETRY_RECORD="$record" ENV_FILE="$ENV_FILE" \
    docker compose -p "$project" -f "$WGW_COMPOSE" "$@"
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

# The image the live container runs now; the rollback target. Empty on the first deploy.
prev_ref="$(docker inspect "$LIVE_CONTAINER" --format '{{.Config.Image}}' 2>/dev/null || true)"

# --- candidate on :3100 (shares the live DB, so it must not record water-level rows) ---
log "starting candidate $digest on 127.0.0.1:$SMOKE_PORT"
if ! dc "$CAND_PROJECT" "$new_ref" "$SMOKE_PORT" 0 up -d --pull never >/dev/null || ! health "$SMOKE_PORT"; then
  log "candidate unhealthy; log tail:"; dc "$CAND_PROJECT" "$new_ref" "$SMOKE_PORT" 0 logs --tail 20 >&2 || true
  dc "$CAND_PROJECT" "$new_ref" "$SMOKE_PORT" 0 down >/dev/null 2>&1 || true
  die "candidate $digest rejected before switch; live container untouched"
fi
dc "$CAND_PROJECT" "$new_ref" "$SMOKE_PORT" 0 down >/dev/null 2>&1 || true

# --- switch live on :3000: compose recreates the container only because the image reference changed ---
log "switching live to $digest"
if ! dc "$LIVE_PROJECT" "$new_ref" "$LIVE_PORT" 1 up -d --pull never >/dev/null || ! health "$LIVE_PORT"; then
  log "live failed after switch; rolling back"
  if [[ -n "$prev_ref" ]]; then
    dc "$LIVE_PROJECT" "$prev_ref" "$LIVE_PORT" 1 up -d --pull never >/dev/null || true
    if health "$LIVE_PORT"; then log "rolled back to $prev_ref"; else log "rollback also unhealthy: check docker logs $LIVE_CONTAINER"; fi
  else
    dc "$LIVE_PROJECT" "$new_ref" "$LIVE_PORT" 1 down >/dev/null 2>&1 || true
    log "no previous image; nothing to roll back to"
  fi
  die "rolled back from $digest"
fi

printf '%s\n' "$digest" >"$STATE_DIGEST"
printf '%s\n' "$tag" >"$STATE"
log "live: $tag ($digest)"

# Keep the $KEEP_IMAGES newest local images of this repo plus the running one; remove the rest.
running="$(docker inspect "$LIVE_CONTAINER" --format '{{.Image}}' 2>/dev/null || true)"
docker images "$IMAGE" --format '{{.CreatedAt}}|{{.ID}}' 2>/dev/null | sort -r | tail -n +"$((KEEP_IMAGES + 1))" | cut -d'|' -f2 |
  while read -r id; do
    [[ -z "$id" || "$id" == "$running" ]] && continue
    log "removing old image $id"
    docker rmi -f "$id" >/dev/null 2>&1 || true
  done
