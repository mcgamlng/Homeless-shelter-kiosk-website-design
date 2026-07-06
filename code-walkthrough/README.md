# Code Walkthrough Video

This package explains the complete Listening House codebase in beginner-friendly language.

- `listening-house-code-walkthrough.mp4`: generated narrated video
- `NARRATION_SCRIPT.md`: complete accessible transcript
- `STORYBOARD.md`: chapter and file index
- `generated/`: temporary audio, text, and clip files

Generate the video on Windows:

```powershell
npm run code:video -- --rebuild
```

The generator uses the friendly British `en-GB-RyanNeural` voice when internet access is available.
Install its small speech helper once with `py -m pip install edge-tts==7.2.8`.
If the neural voice is unavailable, the generator falls back to an installed Windows voice.
