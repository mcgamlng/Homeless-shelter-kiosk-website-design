$ErrorActionPreference = "Stop"

$TaskName = "Listening House Bracelet Kiosk"
$StartupFolder = [Environment]::GetFolderPath("Startup")
$StartupLauncher = Join-Path $StartupFolder "Listening House Bracelet Kiosk.cmd"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunValueName = "ListeningHouseBraceletKiosk"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($task) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed startup task: $TaskName"
} else {
  Write-Host "Startup task was not installed: $TaskName"
}

if (Test-Path $StartupLauncher) {
  Remove-Item -LiteralPath $StartupLauncher -Force
  Write-Host "Removed Startup folder launcher: $StartupLauncher"
}

if (Get-ItemProperty -Path $RunKey -Name $RunValueName -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $RunKey -Name $RunValueName -Force
  Write-Host "Removed current-user sign-in launcher: $RunKey\$RunValueName"
}
