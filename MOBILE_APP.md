# Listening House Android App

The Android app opens the local Listening House staff dashboard inside a lightweight native
WebView.

## Download

From a phone on the same network as the server:

```text
http://YOUR-SERVER:3000/downloads/ListeningHouseKiosk-debug.apk
```

The About page also displays a QR code for this download.

## Network Requirement

The app connects to the laptop or Raspberry Pi running the server. Internet access alone is not
enough. The phone and server must be on a network that permits device-to-device traffic.

Use an address such as:

```text
http://192.168.1.42:3000
```

Do not enter `localhost` on the phone.

If the server address changes, use the app connection screen to save the new address and retry.
After installing from the in-app download page, tap **Connect installed app to this server** to send
the current laptop, Raspberry Pi, or public server address into the Android app automatically.

## iPhone and iPad

The About page now has a separate iPhone/iPad QR code. It opens an installation page in Safari.
Choose **Add to Home Screen**, turn on **Open as Web App**, and tap **Add**.

This produces an installed Home Screen web app with the Listening House icon. A separate App Store
binary would require an Apple Developer account, signing certificates, and App Store review.

For use away from the building Wi-Fi, configure the public HTTPS address described in
`PUBLIC_ACCESS.md`.

## Rebuild the Android APK

From `mobile/android`:

```powershell
.\gradlew.bat assembleDebug
```

The debug APK is created under:

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```
