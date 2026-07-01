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
- Read-aloud button for browsers that support built-in speech voices
- Automatic translations for common shelter service/activity names
- Timed activity calendar with automatic non-overlapping scheduling
- Per-activity start and end hours inside the overall workday
- Untimed service queue
- Optional daily quantity limits for each activity
- Optional countdown alarms for timed activities
- Waiting, In Progress, Completed, and Skipped statuses
- Manual drag, earlier/later, and exact-time scheduling controls
- Automatic daily rollover
- Real-time Socket.IO updates on every open dashboard
- SQLite persistence
- Day, week, month, and year spreadsheet reports
- Admin PIN protection
- Kiosk wording and color customization
- Browser and Android download QR codes on the About page
- iPhone and iPad web-app installation QR code
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

The kiosk uses a different speech path for each language so it does not force unsupported languages
through an English voice:

- English and Somali use the best matching natural system voice.
- Spanish uses a smoother online Spanish audio service. If the internet is unavailable, it falls
  back to the best Spanish voice installed on the device.
- Hmong uses a local native-recorded White Hmong RPA voice pack. It works without internet and does
  not depend on browser or operating-system Hmong support. The server joins the recorded syllables
  into one sentence with a short crossfade instead of pausing between every word.

Install the Hmong voice once on each server:

```powershell
npm run speech:install-hmong
```

The download is about 248 MB and installs 6,200+ speech samples under the ignored `data/` folder.
On Raspberry Pi OS, install `unzip` first with `sudo apt install unzip`. The voice pack is downloaded
from Yuhalu and remains subject to Yuhalu's separate non-commercial terms; it is not part of this
project's MIT-licensed source code. See `THIRD_PARTY_NOTICES.md`.

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
calendar and shows each guest who is ready, their activity, and one-tap status controls.

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

The Android wrapper opens the staff dashboard. Download it from:

```text
http://YOUR-SERVER:3000/downloads/ListeningHouseKiosk-debug.apk
```

The server must be running. A local address requires the phone and server to use the same Wi-Fi. A
public HTTPS address works from any internet connection. The app remembers the selected address,
automatically retries when Android reconnects to a network, and includes controls to change the
address or open Wi-Fi settings.

On iPhone or iPad, scan the browser QR code, open it in Safari, and choose **Add to Home Screen**.

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
4. Select a timed activity and verify its calendar block.
5. Select an untimed activity and verify the service queue.
6. Reach a daily activity limit and verify the kiosk shows Full for today.
7. Confirm the Staff Action Center shows due activities and its status buttons work.
8. Turn on staff alerts and verify both a five-minute start reminder and an ending-time warning.
9. Complete and skip activities.
10. Reset the day and verify live totals return to zero.
11. Open two dashboards and confirm real-time updates.
12. Scan both About-page QR codes from a phone.
13. Test the kiosk readout in all four languages, including a device with Hmong Daw speech support.

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
