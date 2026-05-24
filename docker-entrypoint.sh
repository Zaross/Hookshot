#!/bin/sh
set -e
mkdir -p /app/data
chown -R webhook:webhook /app/data
exec su-exec webhook ./hookshot
