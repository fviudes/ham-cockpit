# Empacota ham-cockpit-<VER>-raspi.img.xz numa ISO de distribuição (opcional).
# A imagem gravável no cartão é o .img.xz, não esta ISO.
# Uso:  powershell -File instaladores/make-iso.ps1
$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$ver = (Get-Content (Join-Path $repo "VERSION") -Raw).Trim()
$img = Get-ChildItem -Path $PSScriptRoot, (Join-Path $repo "image\out") -Filter "ham-cockpit-$ver-raspi.img.xz" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $img) {
  throw @"
ham-cockpit-$ver-raspi.img.xz ausente.
Baixe: gh release download --repo fviudes/ham-cockpit --pattern "ham-cockpit-*-raspi.img.xz" --dir instaladores
Gere:  sudo bash image/appliance/build.sh
"@
}

$out = Join-Path $PSScriptRoot "ham-cockpit-$ver.iso"
$stage = Join-Path $env:TEMP "ham-cockpit-iso-$ver"
$root = Join-Path $stage "Ham-Cockpit-$ver"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path $root | Out-Null
Copy-Item -Force $img.FullName $root
Copy-Item -Force (Join-Path $PSScriptRoot "flash.ps1") $root
Copy-Item -Force (Join-Path $PSScriptRoot "flash.sh") $root
Copy-Item -Force (Join-Path $PSScriptRoot "LEIA-ME.txt") $root
Copy-Item -Force (Join-Path $repo "README.md") $root

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public static class IsoWriter {
  [ComImport, Guid("0000000c-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IStream {
    void Read([Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 1)] byte[] pv, int cb, IntPtr pcbRead);
    void Write(byte[] pv, int cb, IntPtr pcbWritten);
    void Seek(long dlibMove, int dwOrigin, IntPtr plibNewPosition);
    void SetSize(long libNewSize);
    void CopyTo(IStream pstm, long cb, IntPtr pcbRead, IntPtr pcbWritten);
    void Commit(int grfCommitFlags);
    void Revert();
    void LockRegion(long libOffset, long cb, int dwLockType);
    void UnlockRegion(long libOffset, long cb, int dwLockType);
    void Stat(IntPtr pstatstg, int grfStatFlag);
    void Clone(out IStream ppstm);
  }
  public static void WriteStream(object comStream, string path, int blockSize, int totalBlocks) {
    var s = (IStream)comStream;
    using (var fs = File.Open(path, FileMode.Create, FileAccess.Write)) {
      var buf = new byte[blockSize];
      var readPtr = Marshal.AllocHGlobal(4);
      try {
        for (var i = 0; i < totalBlocks; i++) {
          Marshal.WriteInt32(readPtr, 0);
          s.Read(buf, blockSize, readPtr);
          var n = Marshal.ReadInt32(readPtr);
          if (n > 0) fs.Write(buf, 0, n);
        }
      } finally { Marshal.FreeHGlobal(readPtr); }
    }
  }
}
"@

$fs = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
$fs.FileSystemsToCreate = 3
$fs.VolumeName = "HAMCKP0100"
$fs.Root.AddTree($root, $false)
$result = $fs.CreateResultImage()
[IsoWriter]::WriteStream($result.ImageStream, $out, [int]$result.BlockSize, [int]$result.TotalBlocks)
$size = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host "ISO: $out  ($size MB)  contem $($img.Name)"
Write-Host "Grave o .img.xz com o Raspberry Pi Imager — nao grave esta ISO como sistema."
Start-Sleep -Seconds 1
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
