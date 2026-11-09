# Windows Bluetooth Classic inquiry / pair / SPP COM listing for Lextel MS-2000.
param(
  [ValidateSet("scan", "devices", "pair", "ports")]
  [string]$Action = "scan",
  [string]$Address = "",
  [string]$Pin = "1234",
  [int]$Seconds = 15
)

$ErrorActionPreference = "Continue"

function Normalize-Mac([string]$mac) {
  $h = ($mac -replace "[^0-9A-Fa-f]", "").ToUpperInvariant()
  if ($h.Length -ne 12) { return $mac.ToUpperInvariant() }
  return ($h -replace "..(?!$)", '$0:').ToUpperInvariant()
}

function List-Known {
  $root = "HKLM:\SYSTEM\CurrentControlSet\Services\BTHPORT\Parameters\Devices"
  if (-not (Test-Path $root)) { return }
  Get-ChildItem $root | ForEach-Object {
    $hex = $_.PSChildName
    $mac = Normalize-Mac $hex
    $name = "unknown"
    try {
      $raw = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).Name
      if ($raw) { $name = [System.Text.Encoding]::UTF8.GetString($raw).Trim([char]0).Trim() }
    } catch {}
    $paired = 1
    Write-Output ("DEV {0} {1} {2}" -f $mac, $paired, $name)
  }
}

function List-Ports {
  Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue | ForEach-Object {
    $name = $_.FriendlyName
    if ($name -match "COM\d+") {
      $com = [regex]::Match($name, "COM\d+").Value
      $likely = 0
      if ($name -match "Bluetooth|Lextel|MS-|HC-0|linvor|Monitor") { $likely = 1 }
      Write-Output ("PORT {0} {1} {2}" -f $com, $likely, $name)
    }
  }
}

function Scan-Classic {
  List-Known
  List-Ports
  try {
    $null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime]
    $null = [Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime]
  } catch {
    Write-Output ("ERR winrt " + $_.Exception.Message)
    return
  }

  $aqs = 'System.Devices.Aep.ProtocolId:="{E0CBF06C-CD8B-4647-BB8A-263B43F0F974}"'
  $extra = [string[]]@(
    "System.Devices.Aep.DeviceAddress",
    "System.Devices.Aep.IsPaired",
    "System.Devices.Aep.IsConnected",
    "System.Devices.Aep.SignalStrength"
  )
  $watcher = [Windows.Devices.Enumeration.DeviceInformation]::CreateWatcher($aqs, $extra)
  $script:found = @{}
  $onAdded = Register-ObjectEvent -InputObject $watcher -EventName Added -Action {
    $info = $Event.SourceEventArgs
    $addr = ""
    try { $addr = [string]$info.Properties["System.Devices.Aep.DeviceAddress"] } catch {}
    if (-not $addr) { $addr = $info.Id }
    $paired = 0
    try { if ($info.Properties["System.Devices.Aep.IsPaired"]) { $paired = 1 } } catch {}
    $name = $info.Name
    if (-not $name) { $name = "unknown" }
    $line = "DEV {0} {1} {2}" -f $addr.ToUpperInvariant(), $paired, $name
    $script:found[$addr] = $line
    Write-Output $line
  }
  $watcher.Start()
  Start-Sleep -Seconds $Seconds
  $watcher.Stop()
  Unregister-Event -SourceIdentifier $onAdded.Name -ErrorAction SilentlyContinue
  Get-EventSubscriber | Where-Object { $_.SourceObject -eq $watcher } | Unregister-Event -ErrorAction SilentlyContinue
}

function Pair-Device {
  param([string]$Mac, [string]$PinCode)
  $norm = Normalize-Mac $Mac
  Write-Output ("PAIR_TRY {0}" -f $norm)
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
  } catch {}
  Write-Output "ERR pair-from-cli: use Windows Settings Bluetooth or the Ham Cockpit Pi helper"
  Write-Output ("HINT PIN {0}" -f $PinCode)
}

switch ($Action) {
  "devices" { List-Known; List-Ports }
  "ports" { List-Ports }
  "pair" { Pair-Device -Mac $Address -PinCode $Pin }
  default { Scan-Classic }
}
