# Listening House Phone App Access

The Listening House system can be opened from iPhone, iPad, Android, tablet, laptop, or desktop.
Android can use a lightweight APK. iPhone and iPad install the dashboard as a Safari Home Screen web
app.

## iPhone and iPad

The About page has a separate iPhone/iPad QR code. This is the easiest path for staff:

1. Open the About page on the kiosk or server computer.
2. Scan **Install on iPhone or iPad** with the iPhone camera.
3. Open the page in Safari.
4. Press **Open dashboard for iPhone install**.
5. Tap the Safari **Share** button.
6. Choose **Add to Home Screen**.
7. Leave **Open as Web App** on, then tap **Add**.

This creates a Home Screen icon with the Listening House app icon. It is not an App Store download
and does not use an APK file.

If Safari is not showing the Add to Home Screen option, copy the dashboard link from the install
page, paste it directly into Safari, and try again.

## Android Download

From a phone that can reach the server, open the Android install helper page:

```text
http://YOUR-SERVER:3000/install?platform=android
```

The About page displays a QR code for this Android install helper page. That page has two separate
buttons:

1. **Download Android app** downloads the APK file.
2. **Connect installed app** saves the current laptop, Raspberry Pi, or public server address inside
   the Android app after it is installed.

The direct APK is still available here if staff need it:

```text
http://YOUR-SERVER:3000/downloads/ListeningHouseKiosk-debug.apk
```

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

## Staff Activity Alerts

In the Dashboard, press **Turn on staff alerts** and allow Android notifications and **Alarms &
reminders**. The Staff Action Center shows who needs attention next, where they are going, and
one-tap Waiting, Start, Complete, and Skip controls.

For every alarm-enabled timed activity, the Android app schedules a system reminder five minutes
before it starts. When staff marks the activity In Progress, the app schedules its configured
ending-time warning. These reminders can sound and vibrate while the app is in the background.
Press **Test alarm** to verify the phone volume and permissions.

The website also repeats its own sound, vibration, and visible warning until staff dismisses it.
iPhone and iPad use this website alarm and must keep the dashboard web app open; a website cannot add
an alarm to Apple Clock.

For use away from the building Wi-Fi, configure the public HTTPS address described in
`PUBLIC_ACCESS.md`.

## About Page Contact

The About page includes a **Contact the Inventors** section. Staff with Page customization access can
save multiple inventor phone numbers and emails there. This contact information is stored only in
the local Raspberry Pi SQLite database and is not committed into the public GitHub repository.

## Rebuild the Android APK

From `mobile/android`:

```powershell
.\gradlew.bat assembleDebug
```

The debug APK is created under:

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```
