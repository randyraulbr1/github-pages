@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Kingdom GPS Editor — Compilar instalador

:: Ejecuta npm run build en la carpeta correcta del proyecto

set "PROYECTO="
set "BAT_DIR=%~dp0"
call :BuscarProyecto "%BAT_DIR%"
if not defined PROYECTO call :BuscarProyecto "%USERPROFILE%\Desktop\kingdom-gps-editor\kingdom-gps-editor-main"
if not defined PROYECTO call :BuscarProyecto "%USERPROFILE%\Desktop\kingdom-gps-editor"
if not defined PROYECTO call :BuscarProyecto "%USERPROFILE%\Desktop\kingdom-gps-editor-main"

if not defined PROYECTO (
  echo [ERROR] No se encontro el proyecto Kingdom GPS Editor.
  pause
  exit /b 1
)

echo Compilando instalador en: %PROYECTO%
cd /d "%PROYECTO%"

if not exist "node_modules\" call npm install

call npm run build

if errorlevel 1 (
  echo [ERROR] Build fallo.
  pause
  exit /b 1
)

echo.
echo Listo. Busque el .exe en:
echo   %PROYECTO%\dist\
echo.
pause
exit /b 0

:BuscarProyecto
set "CAND=%~1"
if not exist "%CAND%package.json" exit /b 0
findstr /C:"\"name\": \"kingdomgps-editor\"" "%CAND%package.json" >nul 2>&1
if errorlevel 1 exit /b 0
set "PROYECTO=%CAND%"
if "%PROYECTO:~-1%"=="\" set "PROYECTO=%PROYECTO:~0,-1%"
exit /b 0
