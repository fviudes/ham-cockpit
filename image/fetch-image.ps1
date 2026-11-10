# Baixa a imagem Ham Cockpit OS (já assada no GitHub Actions) para image/out.
# O Git ignora este arquivo (~1,8 GB). Não faz commit.
# Uso:  powershell -File image/fetch-image.ps1
param(
  [string]$Repo = "fviudes/ham-cockpit",
  [string]$Tag = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path $root "image\out"
New-Item -ItemType Directory -Force -Path $out | Out-Null

if (-not $Tag) {
  $Tag = ("v" + (Get-Content (Join-Path $root "VERSION") -Raw).Trim())
}

Write-Host "A baixar $Tag para $out ..."
gh release download $Tag --repo $Repo --pattern "ham-cockpit-*-raspi.img.xz*" --dir $out --clobber
Get-ChildItem $out -Filter "ham-cockpit-*-raspi.img*" | Format-Table Name, @{n = "MB"; e = { [math]::Round($_.Length / 1MB, 1) } } -AutoSize
Write-Host "Pronto. Grave com Raspberry Pi Imager (Use custom) ou: image\installer\flash.ps1 -DiskNumber N"
