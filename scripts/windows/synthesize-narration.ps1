param(
  [Parameter(Mandatory = $true)]
  [string]$TextPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [string]$FfmpegPath = "",

  [string]$VoiceName = "en-GB-RyanNeural"
)

$ErrorActionPreference = "Stop"
$text = Get-Content -LiteralPath $TextPath -Raw
$temporaryMedia = [System.IO.Path]::ChangeExtension($OutputPath, ".neural.mp3")
$usedNeuralVoice = $false

try {
  if ($FfmpegPath -and (Test-Path -LiteralPath $FfmpegPath)) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    & py -m edge_tts `
      --voice $VoiceName `
      --rate=-4% `
      --pitch=-2Hz `
      --file $TextPath `
      --write-media $temporaryMedia 2>$null
    $speechExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorAction

    if ($speechExitCode -eq 0 -and (Test-Path -LiteralPath $temporaryMedia)) {
      $ErrorActionPreference = "SilentlyContinue"
      & $FfmpegPath -y -i $temporaryMedia -ac 1 -ar 24000 $OutputPath 2>$null
      $ffmpegExitCode = $LASTEXITCODE
      $ErrorActionPreference = $previousErrorAction
      if ($ffmpegExitCode -eq 0 -and (Test-Path -LiteralPath $OutputPath)) {
        $usedNeuralVoice = $true
      }
    }
  }

  if (-not $usedNeuralVoice) {
    Add-Type -AssemblyName System.Speech
    $synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synthesizer.Rate = -1
    $synthesizer.Volume = 100
    try {
      $britishVoice = $synthesizer.GetInstalledVoices() |
        Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq "en-GB" } |
        Select-Object -First 1
      if ($britishVoice) {
        $synthesizer.SelectVoice($britishVoice.VoiceInfo.Name)
      }
      $synthesizer.SetOutputToWaveFile($OutputPath)
      $synthesizer.Speak($text)
    }
    finally {
      $synthesizer.Dispose()
    }
  }
}
finally {
  Remove-Item -LiteralPath $temporaryMedia -Force -ErrorAction SilentlyContinue
}
