param(
  [Parameter(Mandatory = $true)]
  [string]$TextPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$text = Get-Content -LiteralPath $TextPath -Raw
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synthesizer.Rate = 0
$synthesizer.Volume = 100

try {
  $synthesizer.SetOutputToWaveFile($OutputPath)
  $synthesizer.Speak($text)
}
finally {
  $synthesizer.Dispose()
}
