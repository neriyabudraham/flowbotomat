FROM postgres:15-alpine

# Install cron
RUN apk add --no-cache dcron

# Copy backup script
COPY ../scripts/backup.sh /backup.sh
RUN chmod +x /backup.sh

# Create cron job - runs at 3:00 AM every day
RUN echo "0 3 * * * /backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root

# Create backup directory
RUN mkdir -p /backups

# Start cron daemon
CMD ["crond", "-f", "-l", "2"]
