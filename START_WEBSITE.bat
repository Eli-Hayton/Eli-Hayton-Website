@echo off
cd /d "%~dp0"
echo.
echo  Eli Hayton - Creative Archipelago
 echo  Starting your portfolio at http://localhost:8000
 echo  Keep this window open while using the website.
 echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000'"
py -m http.server 8000
if errorlevel 1 (
  echo Trying python instead of py...
  python -m http.server 8000
)
pause
