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

The generator uses the installed Windows narration voice and the project's existing FFmpeg dependency.
