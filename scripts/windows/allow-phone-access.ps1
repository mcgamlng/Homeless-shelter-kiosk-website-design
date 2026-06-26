param(
  [int]$Port = 3000,
  [switch]$SetNetworkPrivate
)

$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-PhoneAccessAddresses {
  Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -ne "127.0.0.1" -and
      $_.IPAddress -notlike "169.254.*" -and
      $_.PrefixOrigin -ne "WellKnown"
    } |
    Sort-Object InterfaceAlias, IPAddress
}

if (-not (Test-IsAdministrator)) {
  $scriptPath = $MyInvocation.MyCommand.Path
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "`"$scriptPath`"",
    "-Port",
    $Port
  )

  if ($SetNetworkPrivate) {
    $arguments += "-SetNetworkPrivate"
  }

  Start-Process `
    -FilePath (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe") `
    -ArgumentList ($arguments -join " ") `
    -Verb RunAs

  Write-Host "Windows is asking for administrator permission to allow phone/tablet access."
  exit 0
}

$ruleName = "Listening House Bracelet Kiosk Port $Port"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existingRule) {
  Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Direction Inbound -Action Allow -Profile Any
  Get-NetFirewallPortFilter -AssociatedNetFirewallRule $existingRule |
    Set-NetFirewallPortFilter -Protocol TCP -LocalPort $Port
} else {
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Any `
    -Description "Allows phones and tablets on the same local network to open the shelter check-in system." | Out-Null
}

if ($SetNetworkPrivate) {
  Get-NetConnectionProfile |
    Where-Object { $_.IPv4Connectivity -ne "Disconnected" } |
    Set-NetConnectionProfile -NetworkCategory Private
}

Write-Host ""
Write-Host "Phone/tablet access is allowed through Windows Firewall on port $Port."
Write-Host "Use one of these links from a phone on the same Wi-Fi:"
Write-Host ""

$addresses = Get-PhoneAccessAddresses
foreach ($address in $addresses) {
  Write-Host "Dashboard: http://$($address.IPAddress):$Port/dashboard"
  Write-Host "Kiosk:     http://$($address.IPAddress):$Port/kiosk"
  Write-Host ""
}

Write-Host "If a phone still cannot reach the site, the Wi-Fi network may be blocking device-to-device traffic."
