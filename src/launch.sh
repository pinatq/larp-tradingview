#!/bin/bash
# larp-tradingview launcher: opens TradingView with a local debug port (random, 127.0.0.1 only) and starts the injector.
# TradingView itself is never modified.
cd "$(dirname "$0")"
APP="$(cat app-path)"
TV="$APP/Contents/MacOS/TradingView"
PORTFILE="$HOME/Library/Application Support/TradingView/DevToolsActivePort"

alive() { [ -f "$PORTFILE" ] && curl -s "127.0.0.1:$(head -1 "$PORTFILE")/json/version" >/dev/null; }
running() { pgrep -qf "^$TV( --.*)?$"; } # the main app, not the injector (same binary, different args)

if alive; then
  open -a "$APP"
else
  if running; then
    osascript -e 'quit app "TradingView"'
    while running; do sleep 0.5; done
  fi
  rm -f "$PORTFILE"
  open -a "$APP" --args --remote-debugging-port=0
fi
pgrep -qf "larp-tradingview/inject.mjs" ||
  ELECTRON_RUN_AS_NODE=1 nohup "$TV" "$PWD/inject.mjs" >/tmp/larp-tradingview.log 2>&1 &
