param(
  [string]$Url = "http://127.0.0.1:3000/kiosk",
  [int]$Port = 3000,
  [int]$CheckTimeoutMs = 1000,
  [int]$MaxWaitSeconds = 60,
  [switch]$KeepExistingBrowser,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$StartupMutex = New-Object System.Threading.Mutex($false, "Local\ListeningHouseBraceletKioskStartup")
if (-not $StartupMutex.WaitOne(0)) {
  exit 0
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$NodeExe = Join-Path $env:ProgramFiles "nodejs\node.exe"
$HealthUrl = "http://127.0.0.1:$Port/api/health"
$LogPath = Join-Path $ProjectRoot "kiosk-startup.log"
$KnownKioskUrls = @(
  $Url,
  "http://localhost:$Port/kiosk",
  "http://127.0.0.1:$Port/kiosk"
) | Select-Object -Unique

function Write-StartupLog {
  param([string]$Message)

  try {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $LogPath -Value "[$timestamp] $Message"
  } catch {
    # Logging should never stop the kiosk from opening.
  }
}

function Test-AppServer {
  $response = $null
  try {
    $request = [System.Net.HttpWebRequest]::Create($HealthUrl)
    $request.Timeout = $CheckTimeoutMs
    $request.ReadWriteTimeout = $CheckTimeoutMs
    $response = $request.GetResponse()
    $statusCode = [int]$response.StatusCode
    return $statusCode -ge 200 -and $statusCode -lt 300
  } catch {
    return $false
  } finally {
    if ($response) {
      $response.Close()
    }
  }
}

function Find-Browser {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Join-ProcessArguments {
  param([string[]]$Items)

  return ($Items | ForEach-Object {
    if ($_ -match '\s') {
      '"' + ($_ -replace '"', '\"') + '"'
    } else {
      $_
    }
  }) -join " "
}

function Start-AppServer {
  if (Test-AppServer) {
    Write-StartupLog "Server already running at $HealthUrl."
    return
  }

  if (-not (Test-Path $NodeExe)) {
    throw "Node.js was not found at $NodeExe. Install Node.js 20 LTS or newer."
  }

  $serverStartInfo = New-Object System.Diagnostics.ProcessStartInfo
  $serverStartInfo.FileName = $NodeExe
  $serverStartInfo.Arguments = "server/index.js"
  $serverStartInfo.WorkingDirectory = $ProjectRoot
  $serverStartInfo.UseShellExecute = $true
  $serverStartInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  Write-StartupLog "Starting server from $ProjectRoot."
  [System.Diagnostics.Process]::Start($serverStartInfo) | Out-Null

  $maxAttempts = [Math]::Max(1, [Math]::Ceiling(($MaxWaitSeconds * 1000) / $CheckTimeoutMs))
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt += 1) {
    if (Test-AppServer) {
      Write-StartupLog "Server became ready after $attempt attempt(s)."
      return
    }
    Start-Sleep -Milliseconds $CheckTimeoutMs
  }

  throw "Listening House server did not start. Check server.err.log in the project folder."
}

function Start-KioskBrowser {
  $browser = Find-Browser
  if (-not $browser) {
    Write-StartupLog "No Edge or Chrome browser found. Opening $Url with default browser."
    Start-Process $Url
    return
  }

  Write-StartupLog "Opening kiosk in $browser at $Url."
  $browserName = Split-Path $browser -Leaf
  $existing = Get-CimInstance Win32_Process | Where-Object {
    if ($_.Name -notin @("msedge.exe", "chrome.exe")) {
      return $false
    }

    foreach ($knownUrl in $KnownKioskUrls) {
      if ($_.CommandLine -like "*$knownUrl*") {
        return $true
      }
    }

    return $false
  }

  if ($existing) {
    if ($KeepExistingBrowser) {
      Write-StartupLog "Existing kiosk browser found. Keeping it open and asking Windows to open $Url."
      Start-Process $Url
      return
    }

    $existing | ForEach-Object {
      try {
        Write-StartupLog "Closing existing kiosk browser process $($_.ProcessId)."
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      } catch {
        Write-Warning "Could not close existing kiosk browser process $($_.ProcessId): $($_.Exception.Message)"
        Write-StartupLog "Could not close existing kiosk browser process $($_.ProcessId): $($_.Exception.Message)"
      }
    }
    Start-Sleep -Milliseconds 750
  }

  if ($browserName -ieq "msedge.exe") {
    $arguments = @(
      "--kiosk",
      $Url,
      "--edge-kiosk-type=fullscreen",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=Translate",
      "--disable-extensions",
      "--disable-sync",
      "--disable-session-crashed-bubble"
    )
  } else {
    $arguments = @(
      "--kiosk",
      $Url,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-infobars",
      "--disable-extensions",
      "--disable-session-crashed-bubble"
    )
  }

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $browser
  $startInfo.Arguments = Join-ProcessArguments $arguments
  $startInfo.WorkingDirectory = Split-Path -Parent $browser
  $startInfo.UseShellExecute = $true
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Maximized
  [System.Diagnostics.Process]::Start($startInfo) | Out-Null
  Write-StartupLog "Kiosk browser launch requested."
}

try {
  Write-StartupLog "Startup script launched. Url=$Url Port=$Port NoBrowser=$NoBrowser KeepExistingBrowser=$KeepExistingBrowser."
  Start-AppServer
  if (-not $NoBrowser) {
    Start-KioskBrowser
  }
  Write-StartupLog "Startup script finished."
} finally {
  $StartupMutex.ReleaseMutex() | Out-Null
  $StartupMutex.Dispose()
}
