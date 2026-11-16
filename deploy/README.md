# Deploying to a VPS

One Ubuntu 24.04 VPS runs the API and the web client. The app is live about a month a year, so the box is built from this directory each season and thrown away afterwards.

```
Internet -> Caddy (80/443, TLS) -+-> api container (web process + worker, SQLite in /srv/accord/data)
                                 +-> /srv/web/current (the web client's static files)
```

## Each season

1. **Create the VPS** (OVH, Ubuntu 24.04) with your SSH key. Note its IP address.
2. **DNS (Porkbun).** Set `A` (and `AAAA`) records for `rdk.api.jvmname.dev` and `rdk.jvmname.dev` to the IP. Lower the TTL to 300 s a day ahead when moving an existing host.
3. **Provision.**
   ```bash
   cd deploy/ansible
   cp inventory.example.ini inventory.ini    # the IP and the login user OVH made
   cp vars.example.yml vars.yml              # hostnames, ACME email, the keys, the heartbeat URL
   ansible-playbook -i inventory.ini -e @vars.yml site.yml
   ```
   The playbook needs `ansible` (it includes the `community.general` and `ansible.posix` collections). It installs Docker, locks down SSH (keys only), turns on the firewall (22, 80, 443), `fail2ban` and automatic security updates, creates the `deploy` user and `/srv/accord`, and schedules a nightly database backup. `.env` is written only if it does not exist yet; edit `/srv/accord/.env` by hand to change it later.
4. **Set the GitHub settings:** variables `VPS_HOST`, `VPS_KNOWN_HOSTS` (the output of `ssh-keyscan <ip>`) and optionally `VPS_USER`; secret `DEPLOY_SSH_KEY` (the private half of `deploy_ssh_public_key`).
5. **Deploy.** Bump `server/package.json` (API) and `app/gradle.properties` (web client) on `main`, or re-run the workflows. The first API deploy starts the stack, and Caddy gets its certificates once DNS points at the box.
6. **Monitoring.**
   - Create a dead-man's-switch check (healthchecks.io) that expects a request every minute, put its URL in `HEARTBEAT_URL` in `/srv/accord/.env`, and run `docker compose up -d` in `/srv/accord`.
   - Create uptime checks on `https://rdk.api.jvmname.dev/system/healthCheck` and on `https://rdk.jvmname.dev`, with TLS-expiry alerts, sent to email or SMS.
7. **Check with a real client:** run a debug build against it, `./gradlew :shared:run -Paccord.baseUrl=https://rdk.api.jvmname.dev`.

## Useful commands (on the box, in `/srv/accord`)

```bash
docker compose ps
docker compose logs -f api            # web process and worker
docker compose logs caddy
docker compose pull api && docker compose up -d     # redeploy the tag in .env
ls /srv/accord/backups                # nightly copies, kept a week
```

To roll the web client back, point `/srv/web/current` at an older directory in `/srv/web/releases` (`ln -sfn`). To roll the API back, set `API_TAG` in `.env` to an older version and `docker compose up -d`.

## Backups and the end of the season

The nightly copy lives on the box, so it is gone when the VPS is. Use OVH's snapshot option if you want one, and copy `/srv/accord/backups` somewhere else before cancelling. The database starts empty each season (`bin/migrate.ts` creates it on the first start).

Until DNS points somewhere else, installed apps and the web client fail to connect outside the season.

## Notes

- Renaming a host is a change to `API_HOST` / `WEB_HOST` in `.env` and in DNS. Installed release builds call `rdk.api.jvmname.dev`, so keep that name answering (add a second site block to the Caddyfile) until those builds are gone.
- The playbook has been syntax-checked and linted but not run against a real VPS; the first run on a fresh box is the real test.
