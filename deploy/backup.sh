#!/bin/sh
# Nightly consistent copy of the database, kept for a week. Installed by the Ansible playbook.
set -eu
DATA=/srv/accord/data/accord.sqlite
DEST=/srv/accord/backups
[ -f "$DATA" ] || exit 0
sqlite3 "$DATA" ".backup '$DEST/accord-$(date +%F).sqlite'"
find "$DEST" -name 'accord-*.sqlite' -mtime +7 -delete
