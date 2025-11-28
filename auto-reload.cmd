@echo off
setlocal enabledelayedexpansion
set SCRIPT_DIR=%~dp0
pushd "%SCRIPT_DIR%"

echo.
echo Tableau Language Support - Compile and Reload helper
echo ----------------------------------------------------
echo.

call npm run compile
if errorlevel 1 (
  echo.
  echo Compilation failed. Fix the errors above and rerun this script.
  popd
  exit /b 1
)

echo.
echo Compilation finished successfully.
echo.
echo Next steps:
echo   * Press Ctrl+Shift+F5 in VS Code to restart the debugger, or
echo   * Run the "Tableau LSP: Compile and Reload" command from the Command Palette.
echo.
echo Tip: keep "npm run watch" running for automatic rebuilds between reloads.
echo.

popd
