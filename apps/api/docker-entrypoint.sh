#!/bin/sh
set -e

# Docker creates a missing bind-mount source root-owned. Start as root only to
# hand the storage directory to the node user, then re-run as that user.
if [ "$(id -u)" = '0' ]; then
  find /app/storage \! -user node -exec chown node:node '{}' +
  exec su-exec node "$0" "$@"
fi

# Seed the storage directory with the image's default files, never overwriting
# one already there (user data). BusyBox `cp -n` skips an existing directory
# whole, so each default file is checked on its own.
if [ -d /app/storage.default ]; then
  (
    cd /app/storage.default
    find . -type d | while read -r dir; do mkdir -p "/app/storage/$dir"; done
    find . -type f | while read -r file; do
      [ -e "/app/storage/$file" ] || cp "$file" "/app/storage/$file"
    done
  )
fi

# The bundle lives outside the workspace and the image has no .git, so the
# build-time stamp is the only version source.
[ -f /app/.revision ] && export APP_VERSION="$(cat /app/.revision)"

exec "$@"
