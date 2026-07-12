# Instalar Kingdom GPS Editor desde ZIP en Windows
# Uso:
#   powershell -ExecutionPolicy Bypass -File instalar-kingdom-gps-editor.ps1
#   powershell -ExecutionPolicy Bypass -File instalar-kingdom-gps-editor.ps1 -ZipPath "C:\Users\RANDY\Downloads\kingdom-gps-editor-main.zip"

param(
  [string]$ZipPath = "",
  [string]$Destino = "$env:USERPROFILE\Desktop\kingdom-gps-editor"
)

$ErrorActionPreference = "Stop"

function Find-Zip {
  param([string]$Explicit)
  if ($Explicit -and (Test-Path $Explicit)) { return (Resolve-Path $Explicit).Path }
  $candidatos = @(
    "$env:USERPROFILE\Downloads\kingdom-gps-editor-main.zip",
    "$env:USERPROFILE\Desktop\kingdom-gps-editor-main.zip",
    "$env:USERPROFILE\Downloads\kingdom-gps-editor-main_*.zip"
  )
  foreach ($c in $candidatos) {
    $hit = Get-Item $c -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  return $null
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Kingdom GPS Editor — Instalación Windows" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "FALTA Node.js 20+. Instala desde https://nodejs.org/" -ForegroundColor Red
  exit 1
}
$nodeVer = (node -v).Trim()
Write-Host "Node.js: $nodeVer" -ForegroundColor Green

$zip = Find-Zip -Explicit $ZipPath
if (-not $zip) {
  Write-Host "No se encontró el ZIP. Pásalo con -ZipPath" -ForegroundColor Red
  exit 1
}
Write-Host "ZIP: $zip" -ForegroundColor Green

# Extraer
$tempExtract = Join-Path $env:TEMP "kingdom-gps-editor-extract"
if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }
New-Item -ItemType Directory -Force -Path $tempExtract | Out-Null
Expand-Archive -Path $zip -DestinationPath $tempExtract -Force

$src = Get-ChildItem $tempExtract -Directory | Select-Object -First 1
if (-not $src) { $src = Get-Item $tempExtract }
$srcPath = $src.FullName
Write-Host "Origen extraído: $srcPath" -ForegroundColor DarkGray

# Copiar a destino (sin borrar backup previo)
if (Test-Path $Destino) {
  $backup = "$Destino_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
  Rename-Item $Destino $backup
  Write-Host "Carpeta anterior renombrada a: $backup" -ForegroundColor Yellow
}
Copy-Item -Recurse -Force $srcPath $Destino
Write-Host "Instalado en: $Destino" -ForegroundColor Green

Push-Location $Destino

# Limpiar variable que rompe Electron en algunos entornos
if (Test-Path Env:ELECTRON_RUN_AS_NODE) {
  Remove-Item Env:ELECTRON_RUN_AS_NODE
}

Write-Host "`n== npm install ==" -ForegroundColor Cyan
npm install

Write-Host "`n== npm run typecheck ==" -ForegroundColor Cyan
npm run typecheck

Write-Host "`n== npm test ==" -ForegroundColor Cyan
npm test

Write-Host "`n== Listo para probar ==" -ForegroundColor Green
Write-Host "Ejecuta en esta carpeta:"
Write-Host "  npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "Se abrirá la app Electron. Crea un proyecto nuevo o abre uno existente."
Write-Host ""
Write-Host "Para generar instalador .exe (opcional):"
Write-Host "  npm run build" -ForegroundColor DarkGray

Pop-Location
