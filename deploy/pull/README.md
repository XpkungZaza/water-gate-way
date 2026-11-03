# Pull deploy (CD, Docker image flow)

```
push to main -> GitHub Actions: test, typecheck, lint, build, audit -> release job
   builds linux/amd64 image, smoke-runs it (GET /login = 200), pushes
   ghcr.io/leotawee/water-gate-way:{sha-<full sha>, main}, prunes GHCR to the 10 newest sha-* versions
droplet timer (every 5 min) -> pull-deploy.sh:
   newest successful main run -> sha-<sha> -> resolve GHCR digest -> docker pull by digest
   -> candidate on 127.0.0.1:3100 with --env-file ~/wgw/app.env, GET /login = 200
   -> switch live container on 127.0.0.1:3000, GET /login = 200, else roll back to the previous image
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
3. Copy the script: `mkdir -p ~/wgw/deploy && cp pull-deploy.sh ~/wgw/deploy/ && chmod +x ~/wgw/deploy/pull-deploy.sh`.
   The deployer runs entirely as `cmmc`; no sudoers entry is needed anymore (the old `systemctl restart`
   sudoers rule can be removed).
4. Install the units: copy `water-gate.service`, `water-gate-deploy.service` and `water-gate-deploy.timer` to
   `/etc/systemd/system/` (disable/remove the old `water-gate` unit that ran `next start`), then
   `sudo systemctl daemon-reload && sudo systemctl enable --now water-gate.service water-gate-deploy.timer`.
   `water-gate.service` is a oneshot that starts the live container after a reboot (the container is also
   created with `--restart unless-stopped`, so the Docker daemon normally restores it first).
5. Check: `systemctl list-timers | grep water-gate-deploy`, `journalctl -u water-gate-deploy -n 30`,
   `docker ps` (live container publishes 127.0.0.1:3000->3000 only), and `curl -s -o /dev/null -w '%{http_code}' \
   http://127.0.0.1:3000/login` prints 200.

**Host loopback services:** inside the bridge network, 127.0.0.1 is the container itself, not the host. The
deployer adds `--add-host host.docker.internal:host-gateway`; if `~/wgw/app.env` reaches Postgres, the MQTT
broker, or go2rtc by loopback, change those hosts to `host.docker.internal` (or the docker bridge IP). Do not
publish Postgres or Mosquitto on 0.0.0.0 to "fix" this.

## Rollback and pause

- Rollback one version: rerun the deployer with the previous digest pinned, or by hand:
  `docker rm -f wgw-live && docker run -d --name wgw-live --restart unless-stopped -p 127.0.0.1:3000:3000 \
  --env-file ~/wgw/app.env --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  --memory 256m ghcr.io/leotawee/water-gate-way@sha256:<digest of the previous version>`, then remove the
  \`last-deployed\` files so the timer does not immediately redeploy (`rm ~/wgw/last-deployed*\`).
- List what ran when: `docker inspect wgw-live --format '{{.Config.Image}} {{.State.StartedAt}}'`.
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
