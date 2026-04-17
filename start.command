#!/bin/bash
# Double-click to start the app locally. Requires Python 3 (preinstalled on macOS).
cd "$(dirname "$0")"
PORT=8765
URL="http://localhost:${PORT}/"
echo "Export Document Management System"
echo "Opening ${URL}"
echo "（サーバーを止めるには Ctrl+C またはターミナルを閉じる）"
(sleep 1 && open "${URL}") &
python3 -m http.server "${PORT}"
