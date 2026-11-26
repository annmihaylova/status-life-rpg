# Чинит запуск Docker Desktop на Windows, когда он падает с ошибкой
# "listening on unix://...: remove ...: The file cannot be accessed by the system".
#
# Причина: после аварийного выхода Docker остаются битые файлы-сокеты (AF_UNIX reparse points),
# которые Windows не даёт удалить (ошибка 1920). Обход — переименовать папки, где они лежат:
# Docker создаст новые. Старые папки можно оставить, они ничему не мешают.
#
# Запуск: powershell -ExecutionPolicy Bypass -File scripts\windows\fix-docker-sockets.ps1

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dirs = @(
  "$env:LOCALAPPDATA\Docker\run",
  "$env:LOCALAPPDATA\docker-secrets-engine"
)

Get-Process | Where-Object { $_.ProcessName -match '^(Docker Desktop|com\.docker\.backend|com\.docker\.diagnose|docker)$' } |
  Stop-Process -Force -Confirm:$false
Start-Sleep -Seconds 3

foreach ($dir in $dirs) {
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  $broken = Get-ChildItem -LiteralPath $dir -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue |
    Where-Object { -not $_.PSIsContainer }
  if (-not $broken) { Write-Host "ok: $dir"; continue }
  $name = (Split-Path $dir -Leaf) + ".broken-$stamp"
  Rename-Item -LiteralPath $dir -NewName $name
  Write-Host "moved aside: $dir -> $name"
}

Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
Write-Host "Docker Desktop запущен. Проверка: docker info"
