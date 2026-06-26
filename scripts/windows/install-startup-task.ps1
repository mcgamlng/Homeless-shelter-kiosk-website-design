param(
  [switch]$StartNow
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StartupScript = Resolve-Path (Join-Path $ScriptDir "start-listening-house-kiosk.ps1")
$TaskName = "Listening House Bracelet Kiosk"
$PowerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartupScript`""
$StartupFolder = [Environment]::GetFolderPath("Startup")
$StartupLauncher = Join-Path $StartupFolder "Listening House Bracelet Kiosk.cmd"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunValueName = "ListeningHouseBraceletKiosk"
$RunCommand = "`"$PowerShellExe`" $Arguments"
$LauncherContent = @"
@echo off
start "" "$PowerShellExe" $Arguments
"@

$action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $Arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 12)

$installedScheduledTask = $false
$installedStartupLauncher = $false
$installedRunLauncher = $false

try {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Starts the Listening House local server and opens the kiosk full screen at user sign-in." `
    -Force | Out-Null
  $installedScheduledTask = $true
  Write-Host "Installed startup task: $TaskName"
} catch {
  Write-Host "Scheduled task access was blocked. Installing current-user startup launchers instead."
}

try {
  New-Item -Path $StartupFolder -ItemType Directory -Force | Out-Null
  Set-Content -LiteralPath $StartupLauncher -Value $LauncherContent -Encoding ASCII
  $installedStartupLauncher = $true
  Write-Host "Installed Startup folder launcher:"
  Write-Host $StartupLauncher
} catch {
  Write-Warning "Could not install Startup folder launcher: $($_.Exception.Message)"
}

try {
  New-Item -Path $RunKey -Force | Out-Null
  Set-ItemProperty -Path $RunKey -Name $RunValueName -Value $RunCommand
  $installedRunLauncher = $true
  Write-Host "Installed current-user sign-in launcher:"
  Write-Host "$RunKey\$RunValueName"
} catch {
  Write-Warning "Could not install registry sign-in launcher: $($_.Exception.Message)"
}

if ($StartNow) {
  if ($installedScheduledTask -and -not ($installedStartupLauncher -or $installedRunLauncher)) {
    Start-ScheduledTask -TaskName $TaskName
  } else {
    Start-Process -FilePath $PowerShellExe -ArgumentList $Arguments
  }
}

Write-Host "The kiosk will start the server and open full screen when this Windows user signs in."
Write-Host "After a reboot, check kiosk-startup.log in the project folder if the kiosk does not appear."
