# Pull deploy (CD, Docker image + Compose flow)

```
push to main -> GitHub Actions: test, typecheck, lint, build, audit -> release job
   builds linux/amd64 image, smoke-runs it (GET /login = 200), pushes
   ghcr.io/leotawee/water-gate-way:{sha-<full sha>, main}, prunes GHCR to the 10 newest sha-* versions
droplet timer (every 5 min) -> pull-deploy.sh:
   newest successful main run -> sha-<sha> -> resolve GHCR digest -> docker pull by digest
   -> docker compose project `wgw-candidate` (docker-compose.yml) on 127.0.0.1:3100, TELEMETRY_RECORD=0, GET /login = 200
   -> docker compose project `wgw-web` on 127.0.0.1:3000 (same file, new image digest), GET /login = 200,
      else `compose up` the previous image again
   -> keep the 3 newest local images + the running one, remove the rest
```

Why pull: the droplet is Tailscale-only (a GitHub runner cannot reach it) and has ~450 MB RAM and no swap, so it
neither accepts pushes nor builds. The repo — and therefore the GHCR package — is public, so the droplet pulls
without any GitHub login and there is no deploy key in GitHub.

Not automated, by design: database migrations (`db/migrations/*.sql`). Run them by hand before merging code that
needs them, with `psql -1` and `PGOPTIONS='-c search_path=wgw,public'`. The deployer never touches the database.

## One-time GHCR step (owner)

GHCR creates new packages **private**. After the first `release` run on `main`, open GitHub -> your profile ->
Packages -> `water-gate-way` -> Package settings -> Change visibility -> Public. Until then the droplet gets 401
on the anonymous token/pull and the deployer logs `FAIL`.

## One-time droplet setup (owner, needs sudo)

1. Install Docker and `jq` + `curl` (`sudo apt install docker.io jq curl`, then `sudo usermod -aG docker cmmc`
   and re-login).
   **Security note:** membership in the `docker` group is root-equivalent — any container mount gives root.
   Rootless Docker is the safer option and works here (the container is non-root already); decide for yourself.
2. If the droplet has less than ~10 GB free on `/`, prune old images once: `docker image prune -a`.
3. Copy the script and the compose file together (the script looks for `docker-compose.yml` next to itself):
   `mkdir -p ~/wgw/deploy && cp pull-deploy.sh docker-compose.yml ~/wgw/deploy/ && chmod +x ~/wgw/deploy/pull-deploy.sh`.
   Needs the `docker compose` plugin (`docker compose version`).
   The deployer runs entirely as `cmmc`; no sudoers entry is needed anymore (the old `systemctl restart`
   sudoers rule can be removed).
4. Install the units: copy `water-gate.service`, `water-gate-deploy.service` and `water-gate-deploy.timer` to
   `/etc/systemd/system/` (disable/remove the old `water-gate` unit that ran `next start`), then
   `sudo systemctl daemon-reload && sudo systemctl enable --now water-gate.service water-gate-deploy.timer`.
   `water-gate.service` is a oneshot that starts the live container after a reboot (the container is also
   created with `restart: unless-stopped`, so the Docker daemon normally restores it first).
5. Check: `systemctl list-timers | grep water-gate-deploy`, `journalctl -u water-gate-deploy -n 30`,
   `docker ps` (live container publishes 127.0.0.1:3000->3000 only), and `curl -s -o /dev/null -w '%{http_code}' \
   http://127.0.0.1:3000/login` prints 200.

**Networking:** the compose file uses `network_mode: host` with `HOSTNAME=127.0.0.1`, so `app.env` keeps
reaching Postgres (docker-published on 127.0.0.1:5432) and Mosquitto by loopback and nothing needs editing. The
app listens on loopback only (verified: the same image with the default `HOSTNAME=0.0.0.0` also answers on its
non-loopback address; with `127.0.0.1` only loopback answers). Trade-off: the container shares the host network
namespace, so it can reach every loopback-only host service; the filesystem, capability and memory limits still apply.

**First cutover:** the old `next start` unit (`water-gate`) holds 127.0.0.1:3000, so the first compose deploy
cannot bind it. Stop and disable that unit right before the first deploy (owner, sudo):
`sudo systemctl disable --now water-gate` (then step 4's new `water-gate.service` takes its name), and keep
nginx pointing at 127.0.0.1:3000.

## Push deploy (Actions over Tailscale), optional

The `deploy` job in `ci.yml` runs after `release`: it joins the tailnet (`tag:cicd`), then runs
`ssh cmmc@<droplet> <commit sha>`. The droplet key is restricted to `pull-deploy.sh`, which validates the sha
and deploys that exact commit. The 5-minute timer stays as a fallback; the lock file stops them overlapping.
Without the secrets the job logs a notice and skips; it does not fail.

Owner setup (once):

1. Tailscale admin: create an OAuth client with scope `auth_keys` for `tag:cicd`; in the ACL allow
   `tag:cicd` -> the droplet on port 22 (and define `tag:cicd` in `tagOwners`).
2. `ssh-keygen -t ed25519 -f deploy_key -N ''`. On the droplet add to `~cmmc/.ssh/authorized_keys`, on one line:
   `command="/home/cmmc/wgw/deploy/pull-deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA...`
3. `ssh-keyscan -t ed25519 <droplet tailnet ip>` -> this line is `DEPLOY_KNOWN_HOSTS`.
4. GitHub repo -> Settings -> Secrets and variables -> Actions: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`,
   `DEPLOY_HOST` (droplet tailnet IP), `DEPLOY_USER` (`cmmc`), `DEPLOY_SSH_KEY` (private key), `DEPLOY_KNOWN_HOSTS`.

## Rollback and pause

- Rollback one version, by hand (the container is `wgw-web-app-1`; `docker inspect wgw-web-app-1 --format '{{.Config.Image}}'`
  shows what runs now):
  `cd ~/wgw/deploy && WGW_IMAGE=ghcr.io/leotawee/water-gate-way@sha256:<previous digest> WGW_PORT=3000 \
  TELEMETRY_RECORD=1 ENV_FILE=$HOME/wgw/app.env docker compose -p wgw-web up -d --pull never`
  (the previous image must still be local; the deployer keeps the 3 newest). Then `rm ~/wgw/last-deployed*` so the
  timer does not immediately redeploy the newest build.
- List what ran when: `docker inspect wgw-web-app-1 --format '{{.Config.Image}} {{.State.StartedAt}}'`.
- Pause deploys: `sudo systemctl stop water-gate-deploy.timer`.
- A crashed run leaves `~/wgw/.deploy.lock`; the next run takes over when its pid is dead.

## Known limits

- The deployer trusts the runs API + GHCR over HTTPS and branch protection on `main`; it does not pin by
  signature. Tags are never pulled by name after digest resolution, so a moved tag cannot change what runs.
- Every green push to `main` deploys within ~5 minutes. Add a protected `deploy` environment or trigger on tags
  if that is too fast.
- Candidate and live run sequentially on one small droplet; deploys overlap is prevented by the lock file.
- The image is built for linux/amd64. Confirm the droplet is x64 (`uname -m`) and Docker >= 20.10
  (`host-gateway`) before the first run.
