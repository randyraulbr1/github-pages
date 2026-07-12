# FASE 1 — Copia completa Mariel Explorer Legacy (Windows)
# Uso: powershell -ExecutionPolicy Bypass -File scripts\respaldo-mariel-fase1.ps1
# NO BORRA nada. Crea clon + ZIP + copia de archivos locales fuera de Git.

$ErrorActionPreference = "Stop"

$RepoUrl      = "https://github.com/randyraulbr1/github-pages.git"
$CommitEsperado = "a9f783ab1f56e48342730132b01b525e42889237"
$Destino      = "$env:USERPROFILE\Desktop\MarielExplorer_Legacy"
$ZipPath      = "$env:USERPROFILE\Desktop\MarielExplorer_Legacy_Backup.zip"
$LocalNoGit   = Join-Path $Destino "_LOCAL_NO_GIT"
$OrigenesLocales = @(
  "$env:USERPROFILE\Desktop\MiProyectoKGPS",
  "$env:USERPROFILE\Desktop\MarielExplorer_Legacy"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " FASE 1 — Respaldo Mariel Explorer Legacy" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# --- 1. Clonar (historial completo, sin --depth) ---
if (Test-Path $Destino) {
  Write-Host "La carpeta ya existe: $Destino" -ForegroundColor Yellow
  Write-Host "Actualizando con git fetch + checkout legacy-mariel-final..." -ForegroundColor Yellow
  Push-Location $Destino
  git fetch origin --tags
  git checkout legacy-mariel-final 2>$null
  if ($LASTEXITCODE -ne 0) { git checkout main; git pull origin main }
  else { git pull origin legacy-mariel-final }
  Pop-Location
} else {
  Write-Host "Clonando repositorio completo..." -ForegroundColor Green
  git clone $RepoUrl $Destino
  Push-Location $Destino
  git fetch origin --tags
  git checkout legacy-mariel-final 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Host "Rama legacy no disponible, usando main"; git checkout main }
  Pop-Location
}

Push-Location $Destino
$commitActual = (git rev-parse HEAD).Trim()
Write-Host "Commit instalado: $commitActual" -ForegroundColor Green
if ($commitActual -ne $CommitEsperado) {
  Write-Host "AVISO: el commit difiere del esperado ($CommitEsperado)" -ForegroundColor Yellow
}
Write-Host "Rama: $(git branch --show-current)" -ForegroundColor Green
Write-Host "Tag mariel-final-backup: $(git rev-parse mariel-final-backup^{commit} 2>$null)" -ForegroundColor Green
Pop-Location

# --- 2. Copiar archivos locales fuera de Git ---
Write-Host "`nBuscando datos locales importantes..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $LocalNoGit | Out-Null

$patronesLocales = @(
  @{ Src = "server\.env";           Dst = "server.env" },
  @{ Src = "server\data";            Dst = "server_data" },
  @{ Src = "datos\clave_sync.json"; Dst = "clave_sync.json" },
  @{ Src = "datos\clave_sync.local.json"; Dst = "clave_sync.local.json" }
)

foreach ($origen in $OrigenesLocales) {
  if (-not (Test-Path $origen)) { continue }
  Write-Host "Revisando: $origen" -ForegroundColor DarkGray
  foreach ($p in $patronesLocales) {
    $ruta = Join-Path $origen $p.Src
    if (Test-Path $ruta) {
      $dest = Join-Path $LocalNoGit $p.Dst
      if (Test-Path $ruta -PathType Container) {
        Copy-Item -Recurse -Force $ruta $dest -ErrorAction SilentlyContinue
      } else {
        Copy-Item -Force $ruta $dest -ErrorAction SilentlyContinue
      }
      Write-Host "  Copiado: $($p.Src) -> _LOCAL_NO_GIT\$($p.Dst)" -ForegroundColor Green
    }
  }
}

# --- 3. Generar inventario local ---
$inventarioLocal = Join-Path $Destino "INVENTARIO_BACKUP_MARIEL_LOCAL.md"
$fecha = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$archivosGit = (git -C $Destino ls-files | Measure-Object -Line).Lines
@"
# Inventario local generado

- Fecha: $fecha
- Carpeta: $Destino
- Commit: $commitActual
- Archivos Git: $archivosGit
- ZIP: $ZipPath
- Datos locales: $LocalNoGit

## Verificación
``````powershell
cd "$Destino"
npm install
npm run typecheck
npm test
npm run build
``````
"@ | Set-Content -Encoding UTF8 $inventarioLocal
Write-Host "Inventario local: $inventarioLocal" -ForegroundColor Green

# --- 4. Instalar y verificar ---
Write-Host "`nInstalando dependencias..." -ForegroundColor Cyan
Push-Location $Destino
npm install
$env:SMOKE_SKIP_LIVE = "1"
npm run typecheck
npm test
npm run build
Pop-Location

# --- 5. Crear ZIP (sin node_modules ni secretos) ---
Write-Host "`nCreando ZIP de respaldo..." -ForegroundColor Cyan
if (Test-Path $ZipPath) {
  $ZipBackup = "$ZipPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
  Rename-Item $ZipPath $ZipBackup
  Write-Host "ZIP anterior renombrado a: $ZipBackup" -ForegroundColor Yellow
}

$tempZip = Join-Path $env:TEMP "MarielExplorer_Legacy_zip"
if (Test-Path $tempZip) { Remove-Item -Recurse -Force $tempZip }
New-Item -ItemType Directory -Force -Path $tempZip | Out-Null

robocopy $Destino $tempZip /E /XD node_modules "server\node_modules" ".git\objects\pack" /XF "server\.env" "datos\clave_sync.json" "datos\clave_sync.local.json" /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
# Incluir .git (historial) excepto pack cache pesado — el .git/refs y config sí van
if (Test-Path (Join-Path $Destino ".git")) {
  robocopy (Join-Path $Destino ".git") (Join-Path $tempZip ".git") /E /XD objects /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  robocopy (Join-Path $Destino ".git\refs") (Join-Path $tempZip ".git\refs") /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  Copy-Item (Join-Path $Destino ".git\HEAD") (Join-Path $tempZip ".git\HEAD") -Force
  Copy-Item (Join-Path $Destino ".git\config") (Join-Path $tempZip ".git\config") -Force -ErrorAction SilentlyContinue
}

Compress-Archive -Path "$tempZip\*" -DestinationPath $ZipPath -Force
Remove-Item -Recurse -Force $tempZip
$zipSize = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)
Write-Host "ZIP creado: $ZipPath ($zipSize MB)" -ForegroundColor Green

# --- Resumen ---
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " FASE 1 COMPLETADA" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Carpeta : $Destino"
Write-Host "Commit  : $commitActual"
Write-Host "ZIP     : $ZipPath"
Write-Host "Local   : $LocalNoGit"
Write-Host "`nPara arrancar: cd `"$Destino`" ; npm run dev"
Write-Host "NO borres github-pages hasta confirmar todo." -ForegroundColor Yellow
