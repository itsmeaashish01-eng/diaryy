@echo off
REM Market Lens - double-click to start. Needs Node.js 18+ (https://nodejs.org).
cd /d "%~dp0\.."
node market\server.mjs
pause
