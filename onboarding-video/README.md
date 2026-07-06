# Onboarding Video Package

Files in this folder:

- `listening-house-onboarding-walkthrough.mp4`: captioned and narrated onboarding video
- `STORYBOARD.md`: editable scene-by-scene plan
- `NARRATION_SCRIPT.md`: voiceover script
- `raw-screens/`: captured app screens used in the video
- `clips/`: temporary video clips used to assemble the final MP4

The walkthrough uses the same friendly British neural voice family preferred by the English kiosk readout.
Each narrated scene includes a short pause so a presenter can stop and add commentary.

Regenerate the video after refreshing the screenshots:

```powershell
py -m pip install edge-tts==7.2.8
npm run onboarding:video
```
