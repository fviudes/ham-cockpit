# ISO com Ham Cockpit OS já pronto no bake (img.xz) + flash.ps1.
# Gere a imagem antes: wsl bash image/appliance/build.sh
param(
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path (Join-Path $here "..\..")
$stage = Join-Path $env:TEMP "hamcockpit-iso"
if (-not $OutFile) { $OutFile = Join-Path $repo "image\out\Ham-Cockpit-Installer.iso" }

$img = Get-ChildItem -Path (Join-Path $repo "image\out"), (Join-Path $repo "instaladores"), $here -Filter "ham-cockpit-*-raspi.img.xz" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $img) {
  throw "image/out/Ham-Cockpit*.img.xz ausente. Rode: wsl bash image/appliance/build.sh"
}

Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
$root = Join-Path $stage "Ham Cockpit"
New-Item -ItemType Directory -Force -Path $root | Out-Null
Copy-Item -Force $img.FullName $root
Copy-Item -Force (Join-Path $here "flash.ps1") $root
Copy-Item -Force (Join-Path $here "flash.sh") $root
Copy-Item -Force (Join-Path $here "LEIA-ME.txt") $root

New-Item -ItemType Directory -Force -Path (Split-Path $OutFile) | Out-Null

$fs = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
$fs.FileSystemsToCreate = 3
$fs.VolumeName = "HAMCOCKPIT"
$fs.Root.AddTree($root, $false)
$result = $fs.CreateResultImage()
$stream = $result.ImageStream
$bytes = New-Object byte[] $result.BlockSize
$read = 0
$out = [IO.File]::Open($OutFile, [IO.FileMode]::Create)
try {
  for ($i = 0; $i -lt $result.TotalBlocks; $i++) {
    $stream.Read($bytes, $bytes.Length, [ref]$read)
    $out.Write($bytes, 0, $bytes.Length)
  }
} finally {
  $out.Close()
}

Write-Host "ISO: $OutFile  (contem $($img.Name))"
Write-Host "Abra a ISO e execute flash.ps1 -DiskNumber N como Administrador."
