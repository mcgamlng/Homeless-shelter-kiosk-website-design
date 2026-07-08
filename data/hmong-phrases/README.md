# Hmong Phrase Audio

This folder is for optional native Hmong phrase recordings used by the kiosk read-aloud feature.

The app checks this folder before using the fallback syllable voice pack. If a phrase recording
matches the text on screen, the kiosk plays the full phrase as one human-recorded sentence. If no
matching phrase exists, the app falls back to the local syllable voice pack installed by:

```bash
npm run speech:install-hmong
```

## Setup

1. Record approved Hmong phrases as `.wav` files.
2. Copy the files into this folder on the server or Raspberry Pi.
3. Copy `manifest.example.json` to `manifest.json`.
4. Update `manifest.json` so each phrase has:
   - `key`: the kiosk phrase key.
   - `text`: the exact Hmong text the kiosk should match.
   - `file`: the `.wav` file in this folder.
5. Restart the server.
6. Open Admin and check **Read Aloud Voice Status**.

Only `README.md` and `manifest.example.json` are committed to GitHub. Real phrase audio files and
the local `manifest.json` stay private on the installed server.
