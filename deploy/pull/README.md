# Pull deploy (CD)

```
push to main -> GitHub Actions: test, typecheck, lint, build, audit -> `release` job
   builds, prunes to prod deps, smoke-boots, publishes  build-<sha>  (tar.gz + sha256) as the latest GitHub Release
droplet timer (every 5 min) -> pull-deploy.sh: fetch latest release -> verify sha256 -> unpack to releases/build-<sha>
   -> boot on 127.0.0.1:3100, GET /login = 200 -> switch `current` -> systemctl restart water-gate
   -> GET :3000/login = 200, else roll back to the previous release
```

Why pull: the droplet is Tailscale-only (a GitHub runner cannot reach it) and has ~450 MB RAM, so it neither accepts
pushes nor builds. The repo is public, so the droplet needs no GitHub credentials.

Not automated, by design: database migrations (`db/migrations/*.sql`). Run them by hand before merging code that needs
them, with `psql -1` and `PGOPTIONS='-c search_path=wgw,public'`. The deployer never touches the database.

## One-time droplet setup (owner, needs sudo)

1. `jq`, `curl`, `sha256sum`, `tar` installed (`sudo apt install jq curl`).
2. Copy the script: `mkdir -p ~/wgw/deploy && cp pull-deploy.sh ~/wgw/deploy/ && chmod +x ~/wgw/deploy/pull-deploy.sh`.
3. Allow exactly one command without a password (`sudo visudo -f /etc/sudoers.d/wgw-deploy`):
   `cmmc ALL=(root) NOPASSWD: /usr/bin/systemctl restart water-gate`
4. Install the timer: copy `water-gate-deploy.service` and `.timer` to `/etc/systemd/system/`, then
   `sudo systemctl daemon-reload && sudo systemctl enable --now water-gate-deploy.timer`.
5. Check: `systemctl list-timers | grep water-gate-deploy`, `journalctl -u water-gate-deploy -n 30`.

The unit `water-gate` must run `~/wgw/current` (see `docs/superpowers/plans/2026-10-30-deploy-droplet.md`, R5).

## Rollback and pause

- Rollback: `ln -sfn ~/wgw/releases/<older build-sha> ~/wgw/current && sudo systemctl restart water-gate`, then
  `echo <that tag> > ~/wgw/last-deployed` so the timer does not redeploy the newer one. Pause with
  `sudo systemctl stop water-gate-deploy.timer`.
- A crashed run leaves `~/wgw/.deploy.lock`; the next run takes over when its pid is dead.

## Known limits

- Integrity is the SHA-256 published next to the artifact, from the same release: it catches corruption, not a
  compromised release or repo account. Branch protection on `main` is the real control.
- Every green push to `main` deploys within ~5 minutes. Add a protected `deploy` environment or switch the release
  trigger to tags if that is too fast.
- The runner builds for linux x64. Confirm the droplet is x64 (`uname -m`) before the first run.
