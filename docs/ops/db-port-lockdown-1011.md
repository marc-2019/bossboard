# DB port lockdown 2026-10-11 — BossBoard Postgres

Bind the published dev database port to localhost. Do not run this against the live stack until Marc is with Ace. Apply moss-dev first, then this repo, then GARA. Modular Compliance is a separate, blocked step.

## Change

`docker-compose.yml` service `bossboard-postgres` `ports` only:

```yaml
- "127.0.0.1:29432:5432"
```

`docker-compose.production.yml` uses `expose: ["5432"]`. It does not publish a host port. It is not part of this diff.

## What is running

| | |
|---|---|
| Container | `bossboard-postgres` |
| Compose project | `bossboard` |
| Service | `bossboard-postgres` |
| Live file | `<repo-root>/docker-compose.yml` on the Spark host |
| Volume | `bossboard_postgres_data` (keep it; do not pass `-v`) |
| Runtime bind before this change | `0.0.0.0:29432` and `[::]:29432` |
| Same-network peers | `bossboard-api` (healthy), `bossboard-redis` |

`bossboard-api` uses hostname `bossboard-postgres` port `5432`. That path does not use the host publish. The offsite backup timer runs `docker exec` `pg_dump`. That path does not use the host publish.

Host `DATABASE_URL` in the live `.env` and `apps/api/.env` uses host `localhost` port `29432` (key names and host class only). `/etc/hosts` maps `localhost` to `127.0.0.1` and has no `::1` line, so those host clients keep working.

The live checkout may track another upstream. On 2026-10-11 this compose file's bytes matched `origin/master`. Patch the one port line. Do not checkout, reset, or pull the live tree.

## Who connects

Established TCP to port 29432 was empty during 2026-10-11 samples. No config pointed at 29432 via the LAN address, the Tailscale address, `172.17.0.1`, or the host name.

Marc's Mac had no connection that evening. Off-box access:

```bash
ssh -L 29432:127.0.0.1:29432 <spark-host>
```

## Apply

Pre-check. Stop if any peer is not `127.0.0.1` or `::1`:

```bash
ss -tn state established '( sport = :29432 )'
```

Edit only the `bossboard-postgres` ports line in `<repo-root>/docker-compose.yml` on the Spark host. From that directory:

```bash
docker compose -f docker-compose.yml up -d --no-deps bossboard-postgres
```

Short outage while Postgres restarts. Named volume stays. Do not `down -v`. Do not recreate redis or the whole stack.

After postgres is healthy, reconnect the API without a rebuild (the running API publish is already `29000:29000`):

```bash
docker restart bossboard-api
```

## Verify

```bash
ss -tln sport = :29432
docker exec bossboard-postgres pg_isready -U bossboard -d bossboard
docker inspect -f '{{.State.Health.Status}}' bossboard-postgres bossboard-api
curl -fsS http://127.0.0.1:29000/health
```

`ss` must show `127.0.0.1:29432` only. From a Tailscale peer, port 29432 on the Spark host's Tailscale address must be closed.

## Rollback

Put the line back to `"29432:5432"` and run the same `up -d --no-deps bossboard-postgres`. Restart `bossboard-api` again.
