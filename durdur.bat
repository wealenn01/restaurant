@echo off
cd /d "%~dp0"
docker compose --env-file bot_yapis\.env down
pause