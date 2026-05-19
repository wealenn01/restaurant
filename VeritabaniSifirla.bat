@echo off
cd /d "%~dp0"
echo.
echo UYARI: Tum kullanicilar, siparisler ve veritabani verisi silinecek.
echo Devam etmek icin bir tusa basin. Iptal: pencereyi kapatin.
pause >nul
echo.
docker compose --env-file bot_yapis\.env down -v
if errorlevel 1 (
  echo HATA: Docker komutu basarisiz. Docker Desktop acik mi?
  pause
  exit /b 1
)
echo.
echo Veritabani sifirlandi. Simdi Baslat.bat calistirin ve ilk kaydi yapin.
pause
