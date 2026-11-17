#!/bin/sh
set -e
cd "$(dirname "$0")/.."
TARBALL=$(npm view gts dist.tarball)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -sL "$TARBALL" | tar -xz -C "$TMP" package/.prettierrc.json
node -e "
const fs = require('fs');
const gts = JSON.parse(fs.readFileSync('$TMP/package/.prettierrc.json'));
const ours = JSON.parse(fs.readFileSync('.prettierrc.json'));
const a = JSON.stringify(gts, Object.keys(gts).sort());
const b = JSON.stringify(ours, Object.keys(ours).sort());
if (a === b) {
  console.log('OK: .prettierrc.json, gts ' + '$TARBALL'.match(/gts-([\d.]+)\.tgz/)[1] + ' ile birebir aynı');
} else {
  console.log('DRIFT: gts prettier config değişmiş!');
  console.log('gts  :', a);
  console.log('bizim:', b);
  process.exit(1);
}
"
