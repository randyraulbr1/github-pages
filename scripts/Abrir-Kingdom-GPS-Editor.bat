@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Kingdom GPS Editor

:: ============================================================
::  Abrir Kingdom GPS Editor — doble clic para arrancar
::  Coloca este .bat en el Escritorio o dentro de kingdom-gps-editor
:: ============================================================

set "PROYECTO="
set "NOMBRE=kingdomgps-editor"

:: 1) Carpeta donde está este .bat (si package.json está al lado)
set "BAT_DIR=%~dp0"
call :BuscarProyecto "%BAT_DIR%"

:: 2) Rutas habituales en el Escritorio
if not defined PROYECTO call :BuscarProyecto "%USERPROFILE%\Desktop\kingdom-gps-editor\kingdom-gps-editor-main"
if not defined PROYECTO call :BuscarProyecto "%USERPROFILE%\Desktop\kingdom-gps-editor"
if not defined PROYECTO call :BuscarProyecto "%USERPROFILE%\Desktop\kingdom-gps-editor-main"

:: 3) Descargas (ZIP recién extraído)
if not defined PROYECTO call :BuscarProyecto "%USERPROFILE%\Downloads\kingdom-gps-editor-main"
if not defined PROYECTO call :BuscarProyecto "%USERPROFILE%\Downloads\kingdom-gps-editor\kingdom-gps-editor-main"

if not defined PROYECTO (
  echo.
  echo [ERROR] No se encontro package.json de Kingdom GPS Editor.
  echo.
  echo Busque en:
  echo   %USERPROFILE%\Desktop\kingdom-gps-editor\kingdom-gps-editor-main
  echo   %USERPROFILE%\Desktop\kingdom-gps-editor-main
  echo.
  echo Extraiga el ZIP y vuelva a ejecutar este .bat.
  echo.
  pause
  exit /b 1
)

echo.
echo ========================================
echo  Kingdom GPS Editor
echo ========================================
echo  Carpeta: %PROYECTO%
echo.

:: Comprobar Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado.
  echo Descargue Node.js 20 LTS desde https://nodejs.org/
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v 2^>nul') do echo  Node.js: %%v

cd /d "%PROYECTO%"

:: Evitar que Electron arranque como Node plano
if defined ELECTRON_RUN_AS_NODE set "ELECTRON_RUN_AS_NODE="

:: Instalar dependencias solo la primera vez (o si falta node_modules)
if not exist "node_modules\" (
  echo.
  echo  Instalando dependencias ^(solo la primera vez^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install fallo.
    pause
    exit /b 1
  )
)

echo.
echo  Arrancando editor...
echo  ^(Cierre esta ventana para salir del programa^)
echo.

call npm run dev

if errorlevel 1 (
  echo.
  echo [ERROR] npm run dev fallo.
  pause
  exit /b 1
)

exit /b 0

:: ------------------------------------------------------------
:BuscarProyecto
set "CAND=%~1"
if not exist "%CAND%package.json" exit /b 0
findstr /C:"\"name\": \"kingdomgps-editor\"" "%CAND%package.json" >nul 2>&1
if errorlevel 1 exit /b 0
set "PROYECTO=%CAND%"
if "%PROYECTO:~-1%"=="\" set "PROYECTO=%PROYECTO:~0,-1%"
exit /b 0
