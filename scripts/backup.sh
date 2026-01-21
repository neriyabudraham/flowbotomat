#!/bin/bash

# FlowBotomat Database Backup Script
# Runs daily via cron to backup PostgreSQL database

BACKUP_DIR="/backups"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="flowbotomat_backup_${DATE}.sql"

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}

echo "[Backup] Starting backup at $(date)"

# Create backup using pg_dump
PGPASSWORD=${POSTGRES_PASSWORD} pg_dump \
  -h ${POSTGRES_HOST:-db} \
  -U ${POSTGRES_USER:-flowbotomat} \
  -d ${POSTGRES_DB:-flowbotomat} \
  --clean \
  --if-exists \
  > ${BACKUP_DIR}/${BACKUP_FILE}

if [ $? -eq 0 ]; then
  # Compress the backup
  gzip ${BACKUP_DIR}/${BACKUP_FILE}
  echo "[Backup] Backup created: ${BACKUP_FILE}.gz"
  
  # Remove old backups
  echo "[Backup] Removing backups older than ${RETENTION_DAYS} days"
  find ${BACKUP_DIR} -name "flowbotomat_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
  
  # List remaining backups
  echo "[Backup] Current backups:"
  ls -lh ${BACKUP_DIR}/*.gz 2>/dev/null || echo "No backups found"
else
  echo "[Backup] ERROR: Backup failed!"
  exit 1
fi

echo "[Backup] Completed at $(date)"
