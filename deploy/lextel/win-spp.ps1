# Listen-only Windows Bluetooth SPP / COM capture. Never write to the wattmeter.
# Reopens the same COM when Windows drops Classic SPP because another Bluetooth
# link (IC-705 Web Bluetooth GATT) attached on the same adapter.
param(
  [Parameter(Mandatory = $true)][string]$Port,
  [int]$Baud = 9600,
  [string]$OutFile = ""
)

$ErrorActionPreference = "Continue"
$stdout = [Console]::OpenStandardOutput()
$fs = $null
if ($OutFile) {
  $fs = [IO.File]::Open($OutFile, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite)
}

function New-SppPort {
  $p = New-Object System.IO.Ports.SerialPort
  $p.PortName = $Port
  $p.BaudRate = $Baud
  $p.Parity = [System.IO.Ports.Parity]::None
  $p.DataBits = 8
  $p.StopBits = [System.IO.Ports.StopBits]::One
  $p.Handshake = [System.IO.Ports.Handshake]::None
  $p.ReadTimeout = 200
  $p.WriteTimeout = 1
  $p.DtrEnable = $false
  $p.RtsEnable = $false
  return $p
}

function Close-SppPort([System.IO.Ports.SerialPort]$p) {
  if (-not $p) { return }
  try { if ($p.IsOpen) { $p.Close() } } catch {}
  try { $p.Dispose() } catch {}
}

try {
  while ($true) {
    $sp = New-SppPort
    $opened = $false
    foreach ($try in 1..40) {
      try {
        $sp.Open()
        $opened = $true
        break
      } catch {
        Start-Sleep -Milliseconds 500
      }
    }
    if (-not $opened) {
      Close-SppPort $sp
      Start-Sleep -Milliseconds 800
      continue
    }
    $sp.DtrEnable = $false
    $sp.RtsEnable = $false
    $sp.BreakState = $false
    try { $sp.DiscardOutBuffer() } catch {}
    try {
      while ($true) {
        if (-not $sp.IsOpen) { break }
        $n = 0
        try { $n = $sp.BytesToRead } catch { break }
        if ($n -lt 1) {
          Start-Sleep -Milliseconds 40
          continue
        }
        $buf = New-Object byte[] $n
        $got = $sp.Read($buf, 0, $n)
        if ($got -gt 0) {
          if ($fs) { $fs.Write($buf, 0, $got); $fs.Flush() }
          $stdout.Write($buf, 0, $got)
          $stdout.Flush()
        }
      }
    } catch {
      # Classic SPP dropped (typical when another Bluetooth device connects).
    } finally {
      Close-SppPort $sp
    }
    Start-Sleep -Milliseconds 800
  }
} finally {
  if ($fs) { try { $fs.Close() } catch {} }
}
