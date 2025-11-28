#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "Tableau Language Support - Compile & Reload helper"
echo "=================================================="
echo ""

(
  cd "${SCRIPT_DIR}"
  npm run compile
)

cat <<'EOF'

Compilation finished.

Next steps:
  * Press Ctrl+Shift+F5 in VS Code to restart the debugger, or
  * Run the "Tableau LSP: Compile and Reload" command from the Command Palette.

Tip: keep "npm run watch" running to rebuild automatically between reloads.
EOF
