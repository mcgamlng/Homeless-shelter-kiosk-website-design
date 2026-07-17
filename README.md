# Homeless Shelter Website Design

A lightweight open-source shelter kiosk, staff dashboard, and activity scheduling system. This
repository was built from the Listening House prototype, but the admin customization tools allow
another shelter or community organization to change the name, wording, colors, activities, icons,
and service rules.

Guests sign in or sign up using only their first and last name, choose the services they need, and
appear instantly on staff phones, tablets, and computers through the dashboard.

## Privacy

The system stores only:

- First name
- Last name
- Check-in time
- Selected activities
- Scheduled times and activity status

It does not collect email addresses, phone numbers, birthdates, demographic information, addresses,
medical details, or sensitive notes.

## Main Features

- Required first-and-last-name sign-up and returning sign-in
- English, Spanish, Hmong, and Somali kiosk structure
- Read-aloud button with phrase-first Hmong support and language-specific fallbacks
- Automatic translations for common shelter service/activity names
- Listening House 18-service default activity preset with safe Admin re-apply button
- Timed activity calendar with automatic non-overlapping scheduling
- Earliest-gap scheduling that backfills open service lanes when another selected activity is busy
- Calendar blocks whose height matches the activity's real duration
- Daily person numbers based on check-in order
- Live current-time clock above the Staff Action Center
- Per-activity start and end hours inside the overall workday
- Untimed service queue
- Optional daily quantity limits for each activity
- Optional countdown alarms for timed activities
- Waiting, In Progress, Completed, and Skipped statuses
- Manual drag, earlier/later, and exact-time scheduling controls
- Automatic daily rollover
- Real-time Socket.IO updates on every open dashboard
- SQLite persistence
- Day, week, month, and year Excel downloads from Analytics
- Admin PIN protection
- Staff user roles with page access and Admin-section permissions
- Kiosk wording and color customization
- Browser, Android download, and iPhone/iPad install QR codes on the About page
- About-page inventor contacts section saved locally on each installation
- Optional secure public HTTPS access through Cloudflare Tunnel

## Hardware

Raspberry Pi with 4 GB RAM is enough. The app uses Node.js, Express, React, Socket.IO, and SQLite
without a large database server or local AI model.

An 8 GB Raspberry Pi is only useful if the same Pi will also run unrelated software or many browser
tabs. It is not required for this system.

Measured storage, live-day, and report results are in
[`PERFORMANCE_AND_CAPACITY.md`](PERFORMANCE_AND_CAPACITY.md). A detailed explanation of startup,
manual operation, architecture, data flow, and the purpose of the main code files is in
[`SYSTEM_GUIDE.md`](SYSTEM_GUIDE.md).

Watch the [narrated website walkthrough](onboarding-video/listening-house-onboarding-walkthrough.mp4)
or the [beginner code course](code-walkthrough/listening-house-code-walkthrough.mp4). Their complete
transcripts and chapter indexes are stored beside each video.

## Physical Kiosk Enclosure

This repository focuses on the software. A physical kiosk model for the original Listening House
concept can be found on Onshape by searching **Listening House Kiosk Design**. Other shelters can
adapt the software and kiosk enclosure idea to match their space, staffing flow, and accessibility
needs.

## Local Computer Setup

Requirements:

- Node.js 20 or newer
- npm

Install and build:

```powershell
npm install
npm run build
```

Create `.env` from `.env.example` and set:

```env
PORT=3000
ADMIN_PIN=2468
DATABASE_PATH=./data/listening-house.sqlite
```

For public/open-source use, change `ADMIN_PIN` before using the app with real staff.

Start the production server:

```powershell
npm start
```

Open:

- Kiosk: `http://localhost:3000/kiosk`
- Dashboard: `http://localhost:3000/dashboard`
- Admin: `http://localhost:3000/admin`
- About and QR codes: `http://localhost:3000/about`

## How Check-In Works

1. The guest presses **Sign In / Sign Up**.
2. The guest enters first and last name.
3. A new name is signed up automatically.
4. A saved first-and-last-name combination is treated as a returning sign-in.
5. The guest chooses a language.
6. The guest selects available activities.
7. Activities at their daily quantity or operating-hour limit cannot be selected.
8. The check-in is saved and staff see it immediately.

If that name is already checked in for the current operating day, the name-entry screen stops the
flow immediately and asks the guest to tell a staff member.

There is no guest mode and no bracelet screen.

## Custom Activities and Languages

Staff can add their own activities in Admin. When an English activity name is added or renamed, the
system automatically translates it into Spanish, Hmong, and Somali. Common shelter terms use the
lightweight built-in dictionary; unfamiliar wording uses the online activity-label translator.
Translations are saved in SQLite, carried into each check-in item, and remain editable in Admin.

Only the activity label is sent for online translation. Guest names and check-in data are never sent.
If internet access is unavailable, built-in shelter terms still work and Admin clearly identifies
translations that need manual review. Set `ACTIVITY_TRANSLATION_URL` only when using a compatible
alternative translation endpoint.

## Read-Aloud Support

The kiosk uses a layered speech path for each language. It tries clearer online speech first, then
falls back to local Raspberry Pi speech so the read-aloud button still works when browser speech is
missing:

- English tries the natural British neural voice `en-GB-RyanNeural` through the server when internet
  is available, then local `espeak-ng`, then the best browser voice.
- Spanish and Somali try natural/cloud server speech first, then local `espeak-ng`, then the best
  browser voice.
- Hmong Daw uses the `mww` cloud speech code first, then checks for approved native phrase
  recordings in
  `data/hmong-phrases`. When a matching
  full phrase exists, the kiosk plays that human-recorded sentence. If no phrase recording exists,
  it falls back to the local native-recorded White Hmong RPA syllable pack, then emergency
  `espeak-ng` pronunciation. The emergency fallback is robotic, but it produces audio when the Pi
  cannot use browser or online speech.

Install the Hmong voice once on each server:

```powershell
npm run speech:install-hmong
```

The download is about 248 MB and installs 6,200+ speech samples under the ignored `data/` folder.
On Raspberry Pi OS, install `unzip` first with `sudo apt install unzip`. The voice pack is downloaded
from Yuhalu and remains subject to Yuhalu's separate non-commercial terms; it is not part of this
project's MIT-licensed source code. See `THIRD_PARTY_NOTICES.md`.

For the most natural Hmong readout, record native phrase audio and copy it into
`data/hmong-phrases` on the server. Use `data/hmong-phrases/manifest.example.json` as the template
for the local `manifest.json`. Admin shows **Read Aloud Voice Status** so staff can confirm whether
Hmong is using phrase recordings, the fallback syllable voice pack, or neither.

The confirmation readout does not send or speak the guest's name.

## Activity Rules

Every activity can independently use:

- **Calendar time:** The activity uses its configured duration and receives a calendar block.
- **Daily quantity limit:** The kiosk stops accepting the activity after the configured number of
  daily requests.
- **Staff timer alert:** Starts when staff marks the activity In Progress and warns the staff device
  near the end.
- **Available hours:** Any activity can have its own start and end time, including untimed or
  quantity-limited services. Outside those hours, the kiosk marks it unavailable.
- **Monthly days:** Restrict an activity to a repeating day-of-month range.
- **Yearly dates:** Restrict an activity to a repeating month-and-day range each year.

These six settings can be combined independently. Activities without calendar time appear in the
Untimed Service Queue.

## Dashboard Alarms

Open the Dashboard and press **Turn on staff alerts**. The browser may ask for notification
permission. The setting is remembered on that staff device. The Staff Action Center stays above the
calendar and shows each guest who is ready, their daily person number, activity, scheduled start,
scheduled end, and one-tap status controls.

The scheduler compares every remaining activity after each appointment and uses the earliest legal
opening. It may change the order of a guest's selected services to fill an otherwise empty lane. It
still protects the activity lane, the guest's other appointments, the configured guest buffer,
check-in time, activity hours, and the overall workday. Staff-directed reordering remains
authoritative. Completing or skipping an activity ends it at that moment and repacks Waiting
appointments when they can still fit before closing.

Five minutes before an alarm-enabled activity starts, staff receive a start reminder so they can
call the guest. When staff marks a timed activity
**In Progress**, its countdown starts from that moment.
When an alarm-enabled activity is In Progress and reaches its configured warning point, the
dashboard:

- Shows a visible warning
- Repeats an audible alarm until staff dismisses it
- Repeats vibration on supported phones and tablets
- Sends a browser notification when permission is granted
- Keeps the dashboard screen awake when the device supports Screen Wake Lock
- Schedules Android system reminders for both upcoming starts and ending-time warnings

Use **Test alarm** after enabling alerts to confirm the device volume and permissions. Android asks
for notification and exact-alarm permission and can alert while the app is backgrounded. On iPhone
and iPad, keep the installed web app open because websites cannot create entries in Apple Clock or
guarantee background execution after the web app is fully closed.

Press **Stop alarm** on the dashboard warning to stop its sound and vibration and dismiss its device
notification. The Android notification also includes its own **Stop alarm** action.

## Local Network Access

The Raspberry Pi or laptop is the server. Other devices must be on a network that allows local
device-to-device traffic.

After signing in to Admin, open **Network & Phone Access**:

1. Connect the laptop or Raspberry Pi to the building Wi-Fi using its normal operating-system
   settings.
2. Press **Refresh network**.
3. Choose the detected local address and select **Local Wi-Fi**.
4. Press **Save and test connection**.
5. Join staff phones to the same Wi-Fi and press **Connect installed Android app**.

Web browsers are not allowed to switch a computer's Wi-Fi connection. The Admin controls detect,
save, test, and share the correct server address after the host computer has joined the network.
This keeps Wi-Fi passwords out of the check-in database.

Common Raspberry Pi links:

```text
http://raspberrypi.local:3000/dashboard
http://raspberrypi.local:3000/kiosk
```

Local IP example:

```text
http://192.168.1.42:3000/dashboard
```

Find the Raspberry Pi IP:

```bash
hostname -I
```

On Windows, allow phone access:

```powershell
npm run network:windows:allow-phone
```

The About and Install pages automatically create links using the address selected in Admin.

When `PUBLIC_URL` is set, all QR codes use that public HTTPS address. See
[`PUBLIC_ACCESS.md`](PUBLIC_ACCESS.md) for Cloudflare Tunnel setup.

## Android App

The Android wrapper opens the staff dashboard. The About page QR opens the Android install helper:

```text
http://YOUR-SERVER:3000/install?platform=android
```

That page has **Download Android app** and **Connect installed app** buttons. The direct APK fallback
is still available at `http://YOUR-SERVER:3000/downloads/ListeningHouseKiosk-debug.apk`.

The server must be running. A local address requires the phone and server to use the same Wi-Fi. A
public HTTPS address works from any internet connection. The app remembers the selected address,
automatically retries when Android reconnects to a network, and includes controls to change the
address or open Wi-Fi settings.

On iPhone or iPad, scan the **Install on iPhone or iPad** QR code on the About page. It opens a
step-by-step Safari install page with an **Open dashboard for iPhone install** button, copyable
dashboard link, and Add to Home Screen instructions.

The About page also has **Contact the Inventors**. Staff with Page customization access can save
more than one phone number and email for project help. That contact information is stored in the
local SQLite database on the laptop or Raspberry Pi and is not hard-coded into GitHub.

## Daily Reset

The system automatically clears active check-ins when a new calendar day starts. Historical
activity records remain available to analytics.

Staff can also use **New day reset** on the Dashboard or **Reset daily schedule** in Admin. Both
require the Admin PIN.

## Demo Data

Reset and load sample names and services:

```powershell
npm run reset:demo
```

Demo guests include Maya Johnson, Ari Lee, and Samira Ahmed.

## Analytics

The Admin page reports:

- Guest check-ins
- New sign-ups and returning sign-ins
- Unique guests
- Activity requests
- Most-used activities
- Completed and skipped activities

Spreadsheet exports contain first and last name only. Reports are available by day, week, month, or
year. The **People** sheet lists each distinct person in the selected period, their number of
check-ins, requested activities, visit dates, and first and last check-in times. The **Guests by
Day** sheet includes every date in the requested period, including zero-activity days, with names
and daily totals.

Admin can download Excel reports directly from the Analytics section for a selected day, week, month,
or year. Spreadsheet emailing is not part of the app; staff should use the Analytics export button
when they need a spreadsheet.

Admin can set a once-a-year data deletion date and time with the exact year, month, and day.
Starting 14 days before that date, warning banners appear in Admin and Dashboard. When the scheduled
deletion runs, guest names, check-ins, scheduled items, status history, old analytics archive
records, and old files in `data/exports` are deleted.
Staff user accounts, permissions, the admin PIN, activities, kiosk customization, and app settings are
preserved.

## Staff User Roles

The owner Admin PIN has full access. In **User Control**, the owner can create staff PINs and choose
which top navigation sections each person can open:

- Dashboard
- About Page
- **Excel spreadsheets:** analytics, spreadsheet export, and yearly data deletion.
- **Page customization:** kiosk wording, kiosk colors, live preview, and About-page inventor
  contacts.
- **Activity customization:** schedule spacing, daily resets, activity/service setup, limits,
  waitlists, and alarms.
- **IT tools:** phone/network access, read-aloud voice tools, Raspberry Pi update/reboot,
  automatic updater setup, and kiosk exit controls.

Everyone can still use the kiosk page. Staff users only receive Dashboard, About, Excel
spreadsheets, Page customization, Activity customization, or IT tools access when the owner grants
it.

## Automatic Startup

Windows:

```powershell
npm run startup:windows:install
```

Raspberry Pi:

```bash
chmod +x scripts/raspberry-pi/*.sh
sudo ./scripts/raspberry-pi/install-autostart.sh
```

Recommended update workflow after the Raspberry Pi is installed:

1. Make code changes on the laptop with Codex.
2. Push the project to GitHub.
3. On the Raspberry Pi, pull and restart with:

```bash
chmod +x scripts/raspberry-pi/*.sh
./scripts/raspberry-pi/update-from-github.sh
```

Codex does not need to run on the Raspberry Pi for the kiosk to work. The Pi only needs Git, Node.js,
the project files, and the local database. If you choose to install Codex CLI on the Pi, treat it as
a developer tool, not part of the production kiosk startup.

Admin also includes **Kiosk & Raspberry Pi Controls**. Staff can run the GitHub update, install a
weekly automatic GitHub updater, reboot the Pi, or try to exit only the Chromium kiosk window.
Rebooting does not delete saved SQLite data, but unsaved form edits are lost and staff phones
disconnect while the Pi restarts. The Raspberry Pi update also installs a desktop shortcut called
**Open Listening House Kiosk** so staff can reopen the kiosk without rebooting if Chromium is closed.

Chromium kiosk command:

```bash
chromium-browser --kiosk http://localhost:3000/kiosk
```

See [RASPBERRY_PI_DEPLOYMENT.md](RASPBERRY_PI_DEPLOYMENT.md) for full Raspberry Pi instructions.

## Testing

Run automated tests, formatting checks, and the production build:

```powershell
npm test
npm run format:check
npm run build
```

Manual checks:

1. Create a new name-only sign-up.
2. Confirm a duplicate sign-up is rejected.
3. Confirm an unknown returning name is rejected.
4. Select several timed activities and verify they backfill the earliest legal activity lanes.
5. Confirm a 60-minute calendar block is twice the height of a 30-minute block.
6. Select an untimed activity and verify the service queue.
7. Reach a daily activity limit and verify the kiosk shows Full for today.
8. Confirm the Staff Action Center shows person number, start, end, and status controls.
9. Turn on staff alerts and verify both a five-minute start reminder and an ending-time warning.
10. Complete and skip activities, then verify Waiting blocks move forward where possible.
11. Reset the day and verify live totals return to zero.
12. Open two dashboards and confirm real-time updates.
13. Scan all three About-page QR codes from a phone.
14. Test the kiosk readout in all four languages and confirm Hmong reports phrase-first mode when
    phrase recordings are installed.

## Website Walkthrough Video

Generate the narrated website walkthrough on Windows:

```powershell
py -m pip install edge-tts==7.2.8
npm run onboarding:video
```

The video renders at 1920x1080. Screenshots stay in a safe upper area and captions stay in a
separate lower band, so the app interface is not covered by the narration text.

## Code Walkthrough Video

Generate the detailed narrated code course on Windows:

```powershell
py -m pip install edge-tts==7.2.8
npm run code:video -- --rebuild
```

The course explains the full request flow, frontend, server, database, scheduling, Admin settings,
languages, alarms, Android app, networking, startup, testing, deployment, privacy, and GitHub
maintenance. Its complete accessible transcript is kept in
[`code-walkthrough/NARRATION_SCRIPT.md`](code-walkthrough/NARRATION_SCRIPT.md).
The video generator uses the friendly British `en-GB-RyanNeural` voice and falls back to an
installed Windows voice when the online neural voice is unavailable.

## Project Structure

```text
server/                Express, SQLite, scheduling, analytics
shared/                Shared kiosk customization
src/pages/             Kiosk, Dashboard, Admin, About
tests/                 Node test suite
mobile/android/        Android WebView wrapper
scripts/               Startup, network, and deployment helpers
data/                  SQLite database
```
