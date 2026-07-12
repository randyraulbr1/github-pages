@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Kingdom GPS Editor — Instalar y abrir

:: ============================================================
::  INSTRUCCIONES:
::  1. Crea una carpeta, ej: C:\Users\RANDY\Desktop\KingdomEditor
::  2. Copia aqui el ZIP (kingdom-gps-editor-main.zip) y este .bat
::  3. Doble clic en este .bat — hace todo solo
:: ============================================================

set "BASE=%~dp0"
if "%BASE:~-1%"=="\" set "BASE=%BASE:~0,-1%"

echo.
echo ========================================
echo  Kingdom GPS Editor — auto instalador
echo ========================================
echo  Carpeta: %BASE%
echo.

:: --- Node.js ---
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Instala Node.js 20+ desde https://nodejs.org/
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo  Node.js: %%v
echo.

:: --- Buscar proyecto ya extraido ---
set "PROYECTO="
call :BuscarEn "%BASE%"

if defined PROYECTO goto :ProyectoListo

:: --- Buscar ZIP en la misma carpeta ---
set "ZIP="
for %%F in ("%BASE%\kingdom-gps-editor*.zip") do (
  set "ZIP=%%~fF"
  goto :ZipEncontrado
)

echo [ERROR] No hay ZIP en esta carpeta.
echo.
echo Coloca el archivo kingdom-gps-editor-main.zip junto a este .bat
echo y vuelve a ejecutarlo.
echo.
pause
exit /b 1

:ZipEncontrado
echo  ZIP encontrado: !ZIP!
echo  Extrayendo...
echo.

powershell -NoProfile -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%BASE%' -Force"
if errorlevel 1 (
  echo [ERROR] No se pudo extraer el ZIP.
  pause
  exit /b 1
)

:: Buscar de nuevo tras extraer
set "PROYECTO="
call :BuscarEn "%BASE%"

if not defined PROYECTO (
  echo [ERROR] ZIP extraido pero no se encontro package.json.
  pause
  exit /b 1
)

:ProyectoListo
echo  Proyecto: %PROYECTO%
echo.

cd /d "%PROYECTO%"

if defined ELECTRON_RUN_AS_NODE set "ELECTRON_RUN_AS_NODE="

if not exist "node_modules\" (
  echo  Instalando dependencias ^(primera vez, ~1 min^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install fallo.
    pause
    exit /b 1
  )
  echo.
)

echo  Abriendo Kingdom GPS Editor...
echo  ^(Cierra esta ventana negra para cerrar el programa^)
echo.

call npm run dev

echo.
pause
exit /b 0

:: ------------------------------------------------------------
:BuscarEn
set "RAIZ=%~1"
if exist "%RAIZ%\package.json" call :ComprobarPkg "%RAIZ%"
if defined PROYECTO exit /b 0
if exist "%RAIZ%\kingdom-gps-editor-main\package.json" call :ComprobarPkg "%RAIZ%\kingdom-gps-editor-main"
if defined PROYECTO exit /b 0
:: subcarpetas directas
for /d %%D in ("%RAIZ%\*") do (
  if exist "%%D\package.json" call :ComprobarPkg "%%D"
  if defined PROYECTO exit /b 0
)
exit /b 0

:ComprobarPkg
findstr /C:"kingdomgps-editor" "%~1\package.json" >nul 2>&1
if errorlevel 1 exit /b 0
set "PROYECTO=%~1"
exit /b 0
