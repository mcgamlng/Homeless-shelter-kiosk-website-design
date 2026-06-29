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
system automatically creates Spanish, Hmong, and Somali kiosk names for common shelter wording.
Those translations are saved in SQLite, carried into each check-in item, and can be edited in Admin
if a shelter wants more exact language. Examples include beds, private rooms, legal support, case
management, bathrooms, transportation help, lockers, documents, ID help, coffee, accessibility, and
rest areas.

The local translator is intentionally lightweight for Raspberry Pi use. It does not require Google
Translate, internet access, or a paid API key; a shelter can connect a professional translation API
later if it wants fully reviewed translation for every possible custom phrase.

## Read-Aloud Support

The kiosk read-aloud button uses the browser's built-in speech engine. It works best in Chrome,
Edge, or Chromium with system speech voices installed. Some embedded browsers, including the Codex
in-app browser, do not expose speech voices; in that case the kiosk shows a clear unavailable
message instead of silently failing.

For Raspberry Pi kiosk mode, use Chromium and install speech support for the languages you need.

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

Open the Dashboard and press **Turn on timer alerts**. The browser may ask for notification
permission. The setting is remembered on that staff device. When staff marks a timed activity
**In Progress**, its countdown starts from that moment.
When an alarm-enabled activity is In Progress and reaches its configured warning point, the
dashboard:

- Shows a visible warning
- Plays a short sound when the browser permits audio
- Vibrates supported Android devices
- Sends a browser notification when permission is granted

Keep the dashboard or installed web app open for in-browser alarms. Phone operating systems may pause
local web pages
that are fully closed.

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
7. Mark an alarm activity In Progress and test its warning threshold.
8. Complete and skip activities.
9. Reset the day and verify live totals return to zero.
10. Open two dashboards and confirm real-time updates.
11. Scan both About-page QR codes from a phone.
12. Press the kiosk read-aloud button in Chrome or Chromium and confirm the screen is spoken.

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
