@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Kingdom GPS Editor

set "BASE=%~dp0"
if "%BASE:~-1%"=="\" set "BASE=%BASE:~0,-1%"

echo.
echo ========================================
echo   Kingdom GPS Editor
echo ========================================
echo.

:: --- Node.js ---
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no instalado.
  echo Descarga: https://nodejs.org/  ^(version 20 LTS^)
  goto :fin
)
echo OK Node.js: 
node -v
echo.

:: --- Buscar carpeta del proyecto ---
set "PROYECTO="

if exist "%BASE%\kingdom-gps-editor-main\package.json" (
  set "PROYECTO=%BASE%\kingdom-gps-editor-main"
)
if exist "%BASE%\package.json" if not defined PROYECTO (
  set "PROYECTO=%BASE%"
)

:: --- Si no existe, extraer ZIP ---
if not defined PROYECTO (
  set "ZIP="
  for %%F in ("%BASE%\kingdom-gps-editor*.zip") do set "ZIP=%%~fF"
  if not defined ZIP (
    echo [ERROR] No hay ZIP en esta carpeta.
    echo Pon kingdom-gps-editor-main.zip junto al .bat
    goto :fin
  )
  echo Extrayendo: !ZIP!
  powershell -NoProfile -Command "Expand-Archive -LiteralPath '!ZIP!' -DestinationPath '%BASE%' -Force"
  if errorlevel 1 (
    echo [ERROR] Fallo al extraer el ZIP.
    goto :fin
  )
  echo OK ZIP extraido.
  echo.
)

:: --- Volver a buscar carpeta ---
if exist "%BASE%\kingdom-gps-editor-main\package.json" (
  set "PROYECTO=%BASE%\kingdom-gps-editor-main"
)
if exist "%BASE%\package.json" if not defined PROYECTO (
  set "PROYECTO=%BASE%"
)

if not defined PROYECTO (
  echo [ERROR] package.json no encontrado despues de extraer.
  echo Revisa que el ZIP contenga kingdom-gps-editor-main\
  dir "%BASE%"
  goto :fin
)

echo Proyecto: !PROYECTO!
echo.

cd /d "!PROYECTO!"
if errorlevel 1 (
  echo [ERROR] No se pudo entrar a la carpeta del proyecto.
  goto :fin
)

if defined ELECTRON_RUN_AS_NODE set "ELECTRON_RUN_AS_NODE="

:: --- npm install ---
if not exist "node_modules\" (
  echo Instalando dependencias... ^(puede tardar 1-2 min^)
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install fallo.
    goto :fin
  )
  echo.
  echo OK dependencias instaladas.
  echo.
) else (
  echo OK node_modules ya existe.
  echo.
)

:: --- Abrir editor ---
echo Abriendo Kingdom GPS Editor...
echo NO cierres esta ventana hasta salir del programa.
echo.

call npm run dev
set "ERR=!errorlevel!"

echo.
if !ERR! neq 0 (
  echo [ERROR] npm run dev termino con codigo !ERR!
) else (
  echo Programa cerrado correctamente.
)

:fin
echo.
pause
endlocal
