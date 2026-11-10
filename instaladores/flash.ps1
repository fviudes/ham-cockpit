#Requires -RunAsAdministrator
# Grava Ham Cockpit OS (Ubuntu Server 24.04 + estação) no cartão / SSD.
# Uso:  .\flash.ps1 -DiskNumber 2
#       .\flash.ps1 -DiskNumber 2 -Image .\ham-cockpit-0.1.02-raspi.img.xz
param(
  [int]$DiskNumber = -1,
  [string]$Image = ""
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here

Write-Host "Discos:"
Get-Disk | Format-Table Number, FriendlyName, BusType, @{n = "GB"; e = { [math]::Round($_.Size / 1GB, 1) } }, IsBoot -AutoSize

if ($DiskNumber -lt 0) {
  throw "indique o cartao ou SSD: .\flash.ps1 -DiskNumber N"
}

$imager = @(
  "$env:ProgramFiles\Raspberry Pi Imager\rpi-imager.exe",
  "${env:ProgramFiles(x86)}\Raspberry Pi Imager\rpi-imager.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Image) {
  $guess = Get-ChildItem -Path $here, (Join-Path $repo "image\out") -Filter "ham-cockpit-*-raspi.img*" -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($guess) { $Image = $guess.FullName }
}
if (-not $Image -or -not (Test-Path $Image)) {
  throw @"
Imagem Ham Cockpit OS nao encontrada.
Baixe o .img.xz da Release: https://github.com/fviudes/ham-cockpit/releases
  gh release download --repo fviudes/ham-cockpit --pattern "ham-cockpit-*-raspi.img.xz" --dir instaladores
Ou gere:  wsl sudo bash image/appliance/build.sh
"@
}

$disk = Get-Disk -Number $DiskNumber
if ($disk.IsBoot) { throw "DiskNumber $DiskNumber e o disco de boot do PC — abortado" }

$diskPath = "\\.\PhysicalDrive$DiskNumber"
Write-Host "Gravando Ham Cockpit OS: $Image -> $diskPath"
if (-not $imager) {
  throw "instale o Raspberry Pi Imager: https://www.raspberrypi.com/software/"
}
& $imager --cli $Image $diskPath
if ($LASTEXITCODE -ne 0) { throw "rpi-imager falhou ($LASTEXITCODE)" }

Write-Host "Cartao/SSD pronto (Pi 3 ou Pi 4). Ubuntu Server 24.04 + Ham Cockpit ja sobem no boot."
Write-Host "Sem Ethernet: SSID Ham-Cockpit-XXXX  senha hamcockpit  http://192.168.4.1/console  admin/1234"
Write-Host "SSH: hamcockpit / 1234"
