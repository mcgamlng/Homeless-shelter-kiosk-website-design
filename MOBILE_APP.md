# Listening House Android App

The Android app opens the selected local or public Listening House staff dashboard inside a
lightweight native WebView.

## Download

From a phone that can reach the server:

```text
http://YOUR-SERVER:3000/downloads/ListeningHouseKiosk-debug.apk
```

The About page also displays a QR code for this download.

## Network Requirement

The app connects to the laptop or Raspberry Pi running the server:

- **Local Wi-Fi mode:** the phone and server must use the same network, and that network must permit
  device-to-device traffic.
- **Public internet mode:** the app uses the configured public HTTPS address and can connect from
  any internet connection.

Configure this in Admin under **Network & Phone Access**. The website cannot switch the server's
Wi-Fi itself; use Windows or Raspberry Pi network settings first, then refresh and select the
detected address in Admin.

Use an address such as:

```text
http://192.168.1.42:3000
```

Do not enter `localhost` on the phone.

If the server address changes, use **Connect installed Android app** again. The app remembers the
new address and retries automatically after temporary network loss. Its connection screen also has
working **Try again** and **Open Wi-Fi settings** controls.

After installing from the in-app download page, tap **Connect installed app to this server** to send
the current laptop, Raspberry Pi, or public server address into the Android app automatically.

## Activity Timer Alarms

In the Dashboard, press **Turn on timer alerts** and allow Android notifications and **Alarms &
reminders**. When staff marks an alarm-enabled activity In Progress, the Android app schedules a
system alarm for its warning time. The alarm can sound and vibrate while the app is in the
background. Press **Test alarm** to verify the phone volume and permissions.

The website also repeats its own sound, vibration, and visible warning until staff dismisses it.
iPhone and iPad use this website alarm and must keep the dashboard web app open; a website cannot add
an alarm to Apple Clock.

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
