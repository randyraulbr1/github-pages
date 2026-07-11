# Actualizar copia local de MiProyectoKGPS (Windows)
# Uso: clic derecho → "Ejecutar con PowerShell" o: powershell -ExecutionPolicy Bypass -File scripts\actualizar-local.ps1
param(
  [string]$ProyectoDir = "$env:USERPROFILE\Desktop\MiProyectoKGPS",
  [string]$RepoUrl = "https://github.com/randyraulbr1/github-pages.git",
  [string]$Rama = "main"
)

$ErrorActionPreference = "Stop"
$fecha = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "$($ProyectoDir)_backup_$fecha"

function Test-GitRepo {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $false }
  Push-Location $Path
  try {
    git rev-parse --is-inside-work-tree 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
  } finally {
    Pop-Location
  }
}

Write-Host "== Actualizar MiProyectoKGPS ==" -ForegroundColor Cyan
Write-Host "Carpeta: $ProyectoDir"

$esRepo = Test-GitRepo -Path $ProyectoDir
$clonarDeNuevo = -not $esRepo

if ($esRepo) {
  Write-Host "Repositorio Git detectado. Sincronizando..." -ForegroundColor Green
  Push-Location $ProyectoDir
  try {
    git remote -v
    git fetch origin $Rama
    git checkout $Rama 2>$null
    if ($LASTEXITCODE -ne 0) { git checkout -b $Rama "origin/$Rama" }
    git pull origin $Rama --no-rebase
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Conflictos detectados. Conservando versión remota (theirs) cuando sea seguro..." -ForegroundColor Yellow
      git checkout --theirs .
      git add -A
      git commit -m "merge: resolver conflictos conservando origin/$Rama" 2>$null
      git pull origin $Rama --no-rebase
      if ($LASTEXITCODE -ne 0) { $clonarDeNuevo = $true }
    }
  } finally {
    Pop-Location
  }
}

if ($clonarDeNuevo) {
  Write-Host "No es repo válido o está dañado. Creando backup y clonando de nuevo..." -ForegroundColor Yellow
  if (Test-Path $ProyectoDir) {
    Rename-Item -Path $ProyectoDir -NewName (Split-Path $backupDir -Leaf)
    Write-Host "Backup: $backupDir"
  }
  git clone --branch $Rama $RepoUrl $ProyectoDir
}

Push-Location $ProyectoDir
try {
  $commit = git log -1 --format="%H %ci %s"
  Write-Host "Commit instalado: $commit" -ForegroundColor Green

  Write-Host "`n== npm install ==" -ForegroundColor Cyan
  npm install

  Write-Host "`n== npm run typecheck ==" -ForegroundColor Cyan
  npm run typecheck

  Write-Host "`n== npm test ==" -ForegroundColor Cyan
  $env:SMOKE_SKIP_LIVE = "1"
  npm test

  Write-Host "`n== npm run build ==" -ForegroundColor Cyan
  npm run build

  Write-Host "`n== Proyecto listo ==" -ForegroundColor Green
  Write-Host "Ejecuta: cd `"$ProyectoDir`" ; npm run dev"
  Write-Host "Servidor: http://localhost:3000/"
  Write-Host "Backup conservado en: $backupDir (no se borra automáticamente)"
} finally {
  Pop-Location
}
