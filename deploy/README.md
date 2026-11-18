# Deploying to a VPS

One Ubuntu 24.04 VPS runs the API and the web client with Docker Compose and Caddy (TLS). The app is live about a month a year, so the box is built from this directory each season and thrown away afterwards.

## Each season

1. **Create the VPS** with your SSH key.
2. **DNS (Porkbun):** `A`/`AAAA` records for `rdk.api.jvmname.dev` and `rdk.jvmname.dev` pointing at the VPS.
3. **Provision.** Fill in `ansible/vars.yml`, then (needs `ansible`):
   ```bash
   ansible-playbook -i <ip>, -u <login user> -e @ansible/vars.yml ansible/site.yml
   ```
   It installs Docker, allows SSH keys only, sets up the firewall, `fail2ban`, automatic security updates, the `deploy` user, and a nightly database backup.
4. **GitHub:** variables `VPS_HOST`, `VPS_KNOWN_HOSTS` (`ssh-keyscan <ip>`), optional `VPS_USER`; secret `DEPLOY_SSH_KEY`. Deploys only run while `VPS_HOST` is set.
5. **Deploy:** bump the version in `server/package.json` (API) and `app/gradle.properties` (web client) on `main`.
6. **Monitor:** one-minute checks (UptimeRobot or similar) on `https://rdk.api.jvmname.dev/system/healthCheck` and `https://rdk.jvmname.dev`, alerting by email or SMS. The health check answers 503 when the worker is not connected.
7. **Try a client:** `./gradlew :shared:run -Paccord.baseUrl=https://rdk.api.jvmname.dev`

## On the box (`/srv/accord`)

```bash
docker compose ps
docker compose logs -f api      # web process and worker
docker compose logs caddy
```

- Roll the API back: set `API_TAG` in `.env` to an older version, then `docker compose up -d`.
- Roll the web client back: `ln -sfn /srv/web/releases/<older> /srv/web/current`.

## Notes

- The nightly copy in `/srv/accord/backups` (7 days) is lost with the VPS. Use OVH snapshots, and copy it elsewhere before cancelling. The database starts empty each season.
- Outside the season, installed apps and the web client cannot connect.
- Installed release builds call `rdk.api.jvmname.dev`. To rename it, keep that name answering with a second site block in `Caddyfile`.
- The playbook is syntax-checked and linted but has not run on a real VPS.
