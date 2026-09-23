#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: ensure-image.sh URL ALGORITHM:DIGEST DESTINATION" >&2
  exit 64
fi
url=$1
expected=$2
destination=$3
algorithm=${expected%%:*}
digest=${expected#*:}
case "$algorithm" in
md5) checker=md5sum ;;
sha512) checker=sha512sum ;;
*)
  echo "unsupported image digest" >&2
  exit 64
  ;;
esac
mkdir -p "$(dirname "$destination")"
chmod 700 "$(dirname "$destination")"
if [[ -f "$destination" ]] && printf '%s  %s\n' "$digest" "$destination" | "$checker" --check --status; then
  exit 0
fi
temporary=$(mktemp "${destination}.partial.XXXXXX")
trap 'rm -f "$temporary"' EXIT
curl --fail --location --silent --show-error --output "$temporary" "$url"
printf '%s  %s\n' "$digest" "$temporary" | "$checker" --check --status
chmod 600 "$temporary"
mv -f "$temporary" "$destination"
trap - EXIT
