#!/usr/bin/env bash
# Qualify a digest-verified OpenSSH client in job storage before publishing PATH.
set -euo pipefail
umask 077

for path_name in RUNNER_TEMP GITHUB_PATH; do
  path_value="${!path_name:-}"
  if [[ "$path_value" != /* || "$path_value" == *$'\n'* || "$path_value" == *$'\r'* ]]; then
    echo "$path_name must be an absolute path without newlines" >&2
    exit 1
  fi
done
for required in curl sha256sum dpkg-deb python3 mktemp rm uname; do
  command -v "$required" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $required" >&2
    exit 1
  }
done
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo "CI OpenSSH qualification requires the Ubuntu amd64 runner" >&2
  exit 1
fi

# Published by Ubuntu noble-security's signed package index.
package_name=openssh-client_9.6p1-3ubuntu13.20_amd64.deb
expected_sha256=5fb4429e9eff60a5b4ddb68ccf0c46ee67066b445794ede5fe181e64c4a8b795
install_root=$(mktemp -d "${RUNNER_TEMP%/}/openssh-9.6p1.XXXXXX")
published=false
cleanup() {
  if [[ "$published" != true ]]; then
    rm -rf -- "$install_root"
  fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
archive_path="$install_root/$package_name"
curl --fail --location --proto '=https' --proto-redir '=https' \
  --show-error --silent --tlsv1.2 --retry 3 --connect-timeout 30 --max-time 180 \
  --output "$archive_path" "https://security.ubuntu.com/ubuntu/pool/main/o/openssh/$package_name"
printf '%s  %s\n' "$expected_sha256" "$archive_path" | sha256sum --check --status
dpkg-deb --extract "$archive_path" "$install_root"
ssh_bin="$install_root/usr/bin/ssh"
keygen_bin="$install_root/usr/bin/ssh-keygen"
if [[ ! -x "$ssh_bin" || ! -x "$keygen_bin" ]]; then
  echo "Extracted OpenSSH executables are unavailable" >&2
  exit 1
fi
actual_version=$("$ssh_bin" -V 2>&1)
if [[ "$actual_version" != "OpenSSH_9.6p1 "* ]]; then
  echo "Expected OpenSSH 9.6p1, got $actual_version" >&2
  exit 1
fi

key_path="$install_root/qualification-key"
"$keygen_bin" -t rsa -b 4096 -N '' -C 'ci-qualification' -f "$key_path" -q
parsed_key=$("$keygen_bin" -l -f "$key_path.pub" -E sha256)
python3 - "$key_path.pub" "$parsed_key" <<'PY'
import base64
import hashlib
import pathlib
import struct
import sys

parts = pathlib.Path(sys.argv[1]).read_text(encoding="ascii").split()
if len(parts) not in (2, 3) or parts[0] != "ssh-rsa":
    raise ValueError("Expected one RSA public key")
blob = base64.b64decode(parts[1], validate=True)
offset = 0


def field():
    global offset
    if offset + 4 > len(blob):
        raise ValueError("Truncated RSA public key")
    size = struct.unpack_from(">I", blob, offset)[0]
    offset += 4
    if size == 0 or offset + size > len(blob):
        raise ValueError("Invalid RSA field")
    value = blob[offset:offset + size]
    offset += size
    return value


if field() != b"ssh-rsa":
    raise ValueError("Wrong public key algorithm")
exponent = field()
modulus = field()
if offset != len(blob) or exponent != b"\x01\x00\x01":
    raise ValueError("Invalid RSA public key encoding")
if len(modulus) != 513 or modulus[0] != 0 or not modulus[1] & 0x80:
    raise ValueError("Expected canonical positive RSA4096 modulus")
if int.from_bytes(modulus, "big").bit_length() != 4096:
    raise ValueError("Expected RSA4096")
fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode("ascii").rstrip("=")
parsed = sys.argv[2].split()
if len(parsed) < 3 or parsed[:2] != ["4096", fingerprint] or parsed[-1] != "(RSA)":
    raise ValueError("Independent OpenSSH fingerprint did not match")
PY

# Retire temporary credentials and downloaded archive before exposing executables.
rm -f -- "$key_path" "$key_path.pub" "$archive_path"
printf '%s\n' "$install_root/usr/bin" >>"$GITHUB_PATH"
published=true
printf 'Installed verified OpenSSH 9.6p1 in runner temporary storage\n'
