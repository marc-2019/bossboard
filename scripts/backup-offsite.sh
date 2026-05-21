#!/usr/bin/env bash
# BossBoard — encrypted offsite backup via restic + rclone + OneDrive.
# Mirrors MOSS + MC patterns. NB: BB has TWO local databases (dev + staging) —
# both are backed up since each carries different test data.
#
# Setup: ~/.config/bossboard/restic.env supplies RESTIC_PASSWORD + RESTIC_REPOSITORY.
# Schedule: systemd user timer bossboard-backup.timer (daily 03:15 NZST).
#
# Repo path note: the on-disk dir was historically `trademate-nz` (renamed to
# /home/marc/projects/bossboard 2026-05-18). The product is BossBoard.
# Backup config + scripts use the BossBoard name to match the brand.

set -euo pipefail

RESTIC_ENV="${RESTIC_ENV:-/home/marc/.config/bossboard/restic.env}"
if [[ ! -f "$RESTIC_ENV" ]]; then
    echo "ERROR: $RESTIC_ENV not found" >&2
    exit 1
fi
set -a
# shellcheck disable=SC1090
source "$RESTIC_ENV"
set +a

RESTIC=/home/marc/bin/restic
export PATH=/home/marc/bin:$PATH

BACKUP_ROOT=/home/marc/backups/bossboard
DB_DIR="$BACKUP_ROOT/db"
LOG_DIR="$BACKUP_ROOT/logs"
mkdir -p "$DB_DIR" "$LOG_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/backup_$TIMESTAMP.log"
HEARTBEAT_FILE="$BACKUP_ROOT/last-restic-status.json"

log() {
    local msg="$(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo "$msg" | tee -a "$LOG_FILE"
}

heartbeat() {
    local status="$1" detail="$2"
    /usr/bin/python3 - "$status" "$detail" "$HEARTBEAT_FILE" <<'PY'
import json, sys, datetime
status, detail, path = sys.argv[1], sys.argv[2], sys.argv[3]
data = {
    "status": status,
    "detail": detail,
    "timestamp": datetime.datetime.now().isoformat(),
    "host": "spark",
    "source": "bossboard/backup-offsite.sh",
}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
PY
}

cleanup_on_failure() {
    local rc=$?
    if [[ $rc -ne 0 ]]; then
        log "FAILED with exit code $rc"
        heartbeat "fail" "BB offsite backup failed exit=$rc — see $LOG_FILE"
    fi
}
trap cleanup_on_failure EXIT

log "=== BossBoard offsite backup START ==="
log "Repo: $RESTIC_REPOSITORY"

# Dump both local DBs (dev + staging carry different test data)
DEV_DUMP="$DB_DIR/bb_dev_$TIMESTAMP.dump"
log "Dumping bossboard_dev (bossboard-local-postgres) → $DEV_DUMP"
docker exec bossboard-local-postgres pg_dump -U bossboard -d bossboard_dev -F c \
    > "$DEV_DUMP" 2>>"$LOG_FILE"
DEV_SIZE=$(stat -c %s "$DEV_DUMP")
log "bossboard_dev dump: $DEV_SIZE bytes"

STAGING_DUMP="$DB_DIR/bb_staging_$TIMESTAMP.dump"
log "Dumping bossboard_staging (bossboard-staging-postgres) → $STAGING_DUMP"
docker exec bossboard-staging-postgres pg_dump -U bossboard -d bossboard_staging -F c \
    > "$STAGING_DUMP" 2>>"$LOG_FILE"
STAGING_SIZE=$(stat -c %s "$STAGING_DUMP")
log "bossboard_staging dump: $STAGING_SIZE bytes"

PROD_DUMP=""
if [[ -n "${DATABASE_URL_BB_PROD:-}" ]]; then
    PROD_DUMP="$DB_DIR/bb_prod_$TIMESTAMP.dump"
    log "Dumping bossboard prod → $PROD_DUMP"
    pg_dump "$DATABASE_URL_BB_PROD" -F c > "$PROD_DUMP" 2>>"$LOG_FILE"
    PROD_SIZE=$(stat -c %s "$PROD_DUMP")
    log "bossboard prod dump: $PROD_SIZE bytes"
else
    log "DATABASE_URL_BB_PROD not set — skipping prod dump"
fi

log "Restic backup..."
$RESTIC backup \
    --tag scheduled --tag spark --tag bossboard \
    --host spark \
    --exclude '*.log' \
    "$DB_DIR" \
    2>&1 | tee -a "$LOG_FILE"

log "Applying retention policy..."
$RESTIC forget \
    --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --keep-yearly 2 \
    --prune \
    2>&1 | tee -a "$LOG_FILE"

log "Listing snapshots..."
$RESTIC snapshots --compact 2>&1 | tee -a "$LOG_FILE" | tail -10

find "$DB_DIR" -name 'bb_*.dump' -mtime +7 -delete
find "$LOG_DIR" -name 'backup_*.log' -mtime +30 -delete

log "=== BossBoard offsite backup OK ==="
heartbeat "ok" "BB backup completed; dev_size=$DEV_SIZE staging_size=$STAGING_SIZE${PROD_DUMP:+ prod_dumped}"
