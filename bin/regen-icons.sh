#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
Regenerate non-Apple icons from an SVG glyph plus a background color.

Usage:
  bin/regen-icons.sh --svg <path> --bg <hex> [options]

Required:
  --svg <path>          Path to source glyph SVG (transparent background expected)
  --bg <hex>            Background color in #RRGGBB (or RRGGBB)

Options:
  --out <dir>           Output directory for icons (default: resources/icons)
  --update-bloom-icon   Also update bloom.icon automatic-gradient value
  --no-bloom-compensation
                        Disable compensation for Apple's darker icon rendering
  --bloom-icon <path>   Path to bloom icon json
                        (default: resources/branding/bloom.icon/icon.json)
  -h, --help            Show this help

Outputs:
  favicon.svg
  favicon-96x96.png
  favicon.ico
  web-app-manifest-192x192.png
  web-app-manifest-512x512.png
  sprouter-standard.svg
  sprouter-standard.png
  sprouter-on-white.png
EOF
}

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

normalize_hex() {
    local input="$1"
    local raw="${input#\#}"
    if [[ ! "$raw" =~ ^[0-9A-Fa-f]{6}$ ]]; then
        echo "Invalid hex color: $input (expected #RRGGBB)" >&2
        exit 1
    fi
    printf '#%s\n' "$(echo "$raw" | tr '[:lower:]' '[:upper:]')"
}

hex_to_display_p3() {
    local hex="$1"
    python3 - "$hex" <<'PY'
import sys

hex_color = sys.argv[1].lstrip('#')
r = int(hex_color[0:2], 16) / 255.0
g = int(hex_color[2:4], 16) / 255.0
b = int(hex_color[4:6], 16) / 255.0

# D65 matrices
M_SRGB_TO_XYZ = [
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.0721750],
    [0.0193339, 0.1191920, 0.9503041],
]
M_XYZ_TO_P3 = [
    [ 2.4934969, -0.9313836, -0.4027108],
    [-0.8294890,  1.7626640,  0.0236247],
    [ 0.0358458, -0.0761724,  0.9568845],
]

def dot(m, v):
    return [sum(m[row][col] * v[col] for col in range(3)) for row in range(3)]

def srgb_to_linear(c):
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4

srgb_linear = [srgb_to_linear(c) for c in (r, g, b)]
xyz = dot(M_SRGB_TO_XYZ, srgb_linear)
p3_linear = dot(M_XYZ_TO_P3, xyz)
p3_linear = [max(0.0, min(1.0, c)) for c in p3_linear]

print("display-p3:{:.5f},{:.5f},{:.5f},1.00000".format(*p3_linear))
PY
}

compensate_hex_for_apple_render() {
    local hex="$1"
    python3 - "$hex" <<'PY'
import sys

# Empirical channel darkening observed in apple-touch-icon output vs target bg.
# This is used so bloom.icon can render closer to the requested brand color.
DARKEN = [0.6022727272727273, 0.4375, 0.7962962962962963]

hex_color = sys.argv[1].lstrip('#')
rgb = [int(hex_color[i:i+2], 16) for i in (0, 2, 4)]
comp = [min(255, max(0, round(rgb[i] / DARKEN[i]))) for i in range(3)]
print("#{:02X}{:02X}{:02X}".format(*comp))
PY
}

SOURCE_SVG=""
BG_COLOR=""
OUT_DIR="resources/icons"
UPDATE_BLOOM_ICON="0"
BLOOM_ICON_JSON="resources/branding/bloom.icon/icon.json"
BLOOM_COMPENSATION="1"

while [[ $# -gt 0 ]]; do
    case "$1" in
    --svg)
        SOURCE_SVG="${2:-}"
        shift 2
        ;;
    --bg)
        BG_COLOR="${2:-}"
        shift 2
        ;;
    --out)
        OUT_DIR="${2:-}"
        shift 2
        ;;
    --update-bloom-icon)
        UPDATE_BLOOM_ICON="1"
        shift
        ;;
    --no-bloom-compensation)
        BLOOM_COMPENSATION="0"
        shift
        ;;
    --bloom-icon)
        BLOOM_ICON_JSON="${2:-}"
        shift 2
        ;;
    -h | --help)
        usage
        exit 0
        ;;
    *)
        echo "Unknown argument: $1" >&2
        usage
        exit 1
        ;;
    esac
done

if [[ -z "$SOURCE_SVG" || -z "$BG_COLOR" ]]; then
    usage
    exit 1
fi

require_cmd magick
require_cmd python3

if [[ ! -f "$SOURCE_SVG" ]]; then
    echo "Source SVG not found: $SOURCE_SVG" >&2
    exit 1
fi

BG_COLOR="$(normalize_hex "$BG_COLOR")"
mkdir -p "$OUT_DIR"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

STANDARD_SVG="$TMP_DIR/standard.svg"
ON_WHITE_SVG="$TMP_DIR/on-white.svg"

python3 - "$SOURCE_SVG" "$BG_COLOR" "$STANDARD_SVG" "$ON_WHITE_SVG" <<'PY'
import re
import sys
from pathlib import Path

src, bg, out_standard, out_on_white = sys.argv[1:5]
text = Path(src).read_text(encoding='utf-8')

match = re.search(r'<svg\b([^>]*)>(.*)</svg>', text, flags=re.S | re.I)
if not match:
    raise SystemExit(f"Unable to parse SVG file: {src}")

attrs = match.group(1)
inner = match.group(2).strip()
viewbox_match = re.search(r'viewBox="([^"]+)"', attrs, flags=re.I)
viewbox = viewbox_match.group(1) if viewbox_match else '0 0 1200 1200'

standard = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="{viewbox}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="1200" height="1200" fill="{bg}"/>
  {inner}
</svg>
'''

on_white = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="{viewbox}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="1200" height="1200" fill="#FFFFFF"/>
  {inner}
</svg>
'''

Path(out_standard).write_text(standard, encoding='utf-8')
Path(out_on_white).write_text(on_white, encoding='utf-8')
PY

cp "$STANDARD_SVG" "$OUT_DIR/favicon.svg"
cp "$STANDARD_SVG" "$OUT_DIR/sprouter-standard.svg"

magick "$STANDARD_SVG" -resize 96x96 "$OUT_DIR/favicon-96x96.png"
magick "$STANDARD_SVG" -resize 1200x1200 "$OUT_DIR/sprouter-standard.png"
magick "$STANDARD_SVG" -resize 192x192 "$OUT_DIR/web-app-manifest-192x192.png"
magick "$STANDARD_SVG" -resize 512x512 "$OUT_DIR/web-app-manifest-512x512.png"
magick "$STANDARD_SVG" -define icon:auto-resize=16,32,48,64,128,256,512 "$OUT_DIR/favicon.ico"

magick "$ON_WHITE_SVG" -resize 1200x1200 "$OUT_DIR/sprouter-on-white.png"

if [[ "$UPDATE_BLOOM_ICON" == "1" ]]; then
    if [[ ! -f "$BLOOM_ICON_JSON" ]]; then
        echo "bloom.icon json not found: $BLOOM_ICON_JSON" >&2
        exit 1
    fi

    BLOOM_HEX="$BG_COLOR"
    if [[ "$BLOOM_COMPENSATION" == "1" ]]; then
        BLOOM_HEX="$(compensate_hex_for_apple_render "$BG_COLOR")"
    fi

    P3_COLOR="$(hex_to_display_p3 "$BLOOM_HEX")"

    python3 - "$BLOOM_ICON_JSON" "$P3_COLOR" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
value = sys.argv[2]

data = json.loads(path.read_text(encoding='utf-8'))
if 'fill' not in data or not isinstance(data['fill'], dict):
    data['fill'] = {}
data['fill']['automatic-gradient'] = value
path.write_text(json.dumps(data, indent=2) + "\n", encoding='utf-8')
PY
fi

echo "Regenerated icon outputs in $OUT_DIR"
if [[ "$UPDATE_BLOOM_ICON" == "1" ]]; then
    echo "Updated $BLOOM_ICON_JSON automatic-gradient"
    if [[ "$BLOOM_COMPENSATION" == "1" ]]; then
        echo "Applied Apple compensation: target $BG_COLOR -> bloom fill $BLOOM_HEX"
    fi
    echo "You'll need to re-export apple-touch-icon.png from bloom.icon to see the updated color in Safari and iOS."
fi
