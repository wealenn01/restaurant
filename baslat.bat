@echo off
cd /d "%~dp0"
if not exist "bot_yapis\.env" (
  echo HATA: bot_yapis\.env yok. .env.example dosyasini kopyalayip .env yapin.
  pause
  exit /b 1
)
docker compose --env-file bot_yapis\.env up -d --build
echo Servisler baslatiliyor, lutfen bekleyin...
timeout /t 15 /nobreak >nul
start http://127.0.0.1