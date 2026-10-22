@echo off
setlocal
cd /d "%~dp0"
echo TrailNav - Instalacion y verificacion
call npm ci
if errorlevel 1 exit /b 1
call npm run check
if errorlevel 1 exit /b 1
echo Verificacion completada. Para probar la PWA: npm run preview
echo Documentacion: README.md, CONTRIBUTING.md y FEATURES_STATUS.md
exit /b 0