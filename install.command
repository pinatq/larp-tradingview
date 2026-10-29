#!/bin/bash
# larp-tradingview installer for macOS. TradingView itself is never modified.
# Double-click it, or: curl -fsSL https://raw.githubusercontent.com/pinatq/larp-tradingview/main/install.command | bash
# Non-interactive: install.command --install | --uninstall
set -euo pipefail
REPO=pinatq/larp-tradingview
SUP="$HOME/Library/Application Support/larp-tradingview"
LAUNCHER="$HOME/Applications/TradingView BG.app"

say() { osascript -e "display dialog \"$1\" buttons {\"OK\"} default button 1 with title \"larp-tradingview\"" >/dev/null 2>&1 || echo "$1"; }
die() { say "$1"; exit 1; }

APP="${TV_APP:-}"
for a in "/Applications/TradingView.app" "$HOME/Applications/TradingView.app"; do
  if [ -z "$APP" ] && [ -d "$a" ]; then APP="$a"; fi
done
[ -n "$APP" ] && [ -d "$APP" ] || die "TradingView Desktop not found. Install it from tradingview.com/desktop first."

MODE="${1:-}"
if [ -z "$MODE" ]; then
  MODE="$(osascript -e 'button returned of (display dialog "Looping video wallpaper for TradingView Desktop." buttons {"Uninstall", "Cancel", "Install"} default button "Install" cancel button "Cancel" with title "larp-tradingview")' 2>/dev/null || echo cancel)"
fi
case "$MODE" in
  Install|--install) MODE=install ;;
  Uninstall|--uninstall) MODE=uninstall ;;
  *) exit 0 ;;
esac

if [ "$MODE" = uninstall ]; then
  pkill -f "larp-tradingview/inject.mjs" || true
  rm -rf "$LAUNCHER"
  rm -f "$SUP/bg.js" "$SUP/inject.mjs" "$SUP/launch.sh" "$SUP/app-path"
  say "Removed. Your videos are still in ~/Library/Application Support/larp-tradingview/videos."
  exit 0
fi

# sources: next to this script, or fresh from GitHub when piped through curl
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -f "$HERE/src/inject.mjs" ]; then SRC="$HERE/src"; else
  TMP="$(mktemp -d)"
  curl -fsSL "https://github.com/$REPO/archive/refs/heads/main.tar.gz" | tar xz -C "$TMP" --strip-components 1
  SRC="$TMP/src"
fi

mkdir -p "$SUP/videos" "$HOME/Applications"
cp "$SRC/bg.js" "$SRC/inject.mjs" "$SRC/launch.sh" "$SUP/"
chmod +x "$SUP/launch.sh"
printf '%s\n' "$APP" > "$SUP/app-path"

# the Dock/Spotlight app: a tiny AppleScript applet that runs launch.sh
osacompile -o "$LAUNCHER" -e "do shell script quoted form of \"$SUP/launch.sh\""
cp "$APP/Contents/Resources/icon.icns" "$LAUNCHER/Contents/Resources/applet.icns" 2>/dev/null || true
touch "$LAUNCHER"

if [ -z "$(ls -A "$SUP/videos")" ]; then
  echo "Downloading starter backgrounds from Mixkit (free license, ~45 MB)…"
  while read -r id name; do
    curl -fsSL -A "Mozilla/5.0" -o "$SUP/videos/$name.mp4" "https://assets.mixkit.co/videos/$id/$id-720.mp4" || echo "skipped $name"
  done <<'LIST'
45020 black-hole
1610 stars
14185 nebula
18142 glowing-particles
47356 night-particles
31562 fractal-tunnel
44818 ink
LIST
fi

say "Installed. Open TradingView BG (in ~/Applications, drag it to your Dock) instead of TradingView. If TradingView is open, it restarts once. Ctrl+B opens the menu."
open "$LAUNCHER"
