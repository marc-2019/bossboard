# DB port lockdown 2026-10-11 — BossBoard

Bind every host-published dev port to localhost. Do not run this against the live stack until Marc is with Ace. Apply moss-dev first, then this repo, then GARA. Modular Compliance is a separate, blocked step.

Recreating the API, redis, and web containers is part of the same Marc window as postgres. `docker restart` does not change a published bind. A recreate does.

## Change

`docker-compose.yml` host publishes:

```yaml
- "127.0.0.1:29000:29000"  # bossboard-api
- "127.0.0.1:29432:5432"   # bossboard-postgres
- "127.0.0.1:29379:6379"   # bossboard-redis
- "127.0.0.1:29080:80"     # bossboard-web
```

`POSTGRES_PASSWORD`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` have no default. Compose stops if any of them is unset. Set them in the environment or the env file on the Spark host. Do not put a fallback in the compose file.

`POSTGRES_PASSWORD` is applied by the postgres image only when the data volume is created empty. An existing volume keeps the password already stored in it. Changing the env value does not rotate that password. When an existing volume needs a new password, Marc sets it with interactive psql `\password <role>` so it never reaches shell history, psql history, or logs. Do not put the password in this file.

`docker-compose.production.yml` uses `expose` for the API, postgres, and redis. Its nginx service still publishes host ports 80 and 443. That file is not part of this diff.

## What is running

| | |
|---|---|
| Database container | `bossboard-postgres` |
| Compose project | `bossboard` |
| Live file | `<repo-root>/docker-compose.yml` on the Spark host |
| Volume | `bossboard_postgres_data` (keep it; do not pass `-v`) |
| Same-network peers | `bossboard-api`, `bossboard-redis` |

`bossboard-api` reaches postgres by the service hostname, not the host publish. The offsite backup uses `docker exec`. Host `DATABASE_URL` uses `localhost` port `29432`. That keeps working when the host name `localhost` resolves to `127.0.0.1`.

The live checkout may track another upstream. Patch the compose file in place. Do not checkout, reset, or pull the live tree.

## Who connects

Established TCP to port 29432 was empty during 2026-10-11 samples. No config pointed at 29432 via a LAN address, a Tailscale address, or `172.17.0.1`.

Off-box access after the bind:

```bash
ssh -L 29432:127.0.0.1:29432 <spark-host>
ssh -L 29000:127.0.0.1:29000 <spark-host>
ssh -L 29379:127.0.0.1:29379 <spark-host>
ssh -L 29080:127.0.0.1:29080 <spark-host>
```

## Apply

Pre-check. Stop if any peer is not `127.0.0.1` or `::1`:

```bash
ss -tn state established '( sport = :29432 or sport = :29000 or sport = :29379 or sport = :29080 )'
```

Confirm `POSTGRES_PASSWORD`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` are set. From `<repo-root>` on the Spark host, recreate only services that are already running. On 2026-10-11 that was postgres, redis, and the API. Web was not running; do not start it just to apply the bind. The next start uses `127.0.0.1`.

```bash
docker compose -f docker-compose.yml up -d --no-deps --no-build bossboard-postgres bossboard-redis bossboard-api
```

Short outage. Named volumes stay. Do not `down -v`. Do not `up` the whole file.

## Verify

```bash
ss -tln sport = :29432
ss -tln sport = :29379
ss -tln sport = :29000
docker exec bossboard-postgres pg_isready -U bossboard -d bossboard
docker inspect -f '{{.State.Health.Status}}' bossboard-postgres bossboard-api bossboard-redis
curl -fsS http://127.0.0.1:29000/health
```

Each `ss` line must show `127.0.0.1` only. From a Tailscale peer, those ports on the Spark host must be closed.

## Rollback

Restore the previous port lines and the previous env fallbacks from git, then run the same `up -d --no-deps --no-build` for the services that were recreated.
