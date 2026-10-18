@echo off
setlocal
cd /d "%~dp0"
set "MVP_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%MVP_NODE%" goto run
set "MVP_NODE=node"
:run
"%MVP_NODE%" scripts\start-local.mjs
if errorlevel 1 pause
endlocal
