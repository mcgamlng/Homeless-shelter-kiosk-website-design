# System Guide

## 1. What Runs

The project is one local web system with three cooperating parts:

1. **Node.js server:** Express receives browser requests, validates data, schedules activities, and
   serves the finished website.
2. **SQLite database:** A single local file stores names, check-ins, activities, settings, schedules,
   and status history.
3. **React website:** The kiosk, dashboard, admin, about, and install screens run in a normal browser.

Socket.IO keeps staff dashboards synchronized. When the kiosk creates a check-in or staff changes a
status, the server sends the new dashboard state to every connected staff screen.

The Android app is a lightweight native wrapper around the staff website. It remembers the chosen
server address and adds Android notification and exact-alarm support.

## 2. Request Flow

A normal guest check-in follows this path:

1. `src/pages/Kiosk.jsx` displays the name form.
2. `src/api.js` sends the first and last name to the Express API.
3. `server/index.js` receives the request and calls the repository.
4. `server/repository.js` finds or creates the guest, prevents a duplicate same-day check-in, checks
   activity limits and availability, and asks the scheduler for times.
5. `server/scheduler.js` places timed activities without overlapping that guest's other activities.
6. `server/repository.js` writes the check-in and activity rows in one SQLite transaction.
7. `server/index.js` emits `dashboard:update` through Socket.IO.
8. Every open `src/pages/Dashboard.jsx` receives and displays the new state.

If any database write in the transaction fails, SQLite rolls back the entire check-in. This prevents
half-created records.

## 3. Main Screens

### Kiosk

`src/pages/Kiosk.jsx` owns the guest flow:

- Welcome
- Combined Sign In / Sign Up
- Language
- Activity selection
- Confirmation

The server determines whether the name is new or returning. A duplicate check-in for the current day
is stopped on the name screen.

The kiosk keeps only temporary form state in React. The permanent record is created only after the
guest submits the selected activities.

### Dashboard

`src/pages/Dashboard.jsx` shows:

- Staff action center
- Live current local time with seconds and date
- Timed activity calendar
- Untimed queue
- Search and activity filtering
- Status controls
- Manual schedule movement
- Daily reset
- Staff alarms

The dashboard initially loads through `/api/dashboard`, then stays current through Socket.IO.

### Admin

`src/pages/Admin.jsx` controls:

- Activity names, icons, duration, limits, and availability rules
- Per-activity monthly and yearly windows
- Alarm timing
- Workday start, end, and buffer
- Kiosk wording and colors
- Local and public server addresses
- Analytics and Excel exports
- Admin PIN

Admin API requests include a temporary session token obtained after a correct PIN. The token lives
in server memory and expires when the server restarts.

### About and Install

`src/pages/About.jsx` explains the system and creates QR codes.

`src/pages/InstallApp.jsx` gives browser-install instructions for iPhone/iPad and provides Android
connection information.

## 4. Frontend Files

- `src/main.jsx`: Starts React and attaches it to the page.
- `src/App.jsx`: Defines routes, navigation, the staff PIN gate, and the shared page shell.
- `src/api.js`: Central browser-to-server request helper.
- `src/socket.js`: Creates the authenticated Socket.IO dashboard connection.
- `src/i18n.js`: Kiosk wording, duration wording, and language helpers.
- `src/speechVoices.js`: Chooses suitable installed English, Spanish fallback, and Somali voices.
- `src/staffAlerts.js`: Pure calculations for staff action prompts and starting-soon items.
- `src/icons.jsx`: Maps activity icon names to Lucide icons.
- `src/styles.css`: Responsive kiosk, dashboard, admin, and mobile presentation.
- `shared/kioskCustomization.js`: Defaults and validation shared by the server and browser.
- `shared/activityTranslations.js`: Built-in shelter vocabulary for Spanish, Hmong, and Somali.

Vite compiles these files into `dist/`. The production Node server serves `dist/`; it does not run
the Vite development server.

## 5. Server Files

- `server/index.js`: Express routes, admin-session checks, Socket.IO, static files, and startup.
- `server/db.js`: Opens SQLite, enables WAL mode, runs migrations, creates indexes, and seeds default
  activities and settings.
- `server/schema.sql`: Current database table and index definitions.
- `server/repository.js`: All database reads/writes, security checks, daily rollover, analytics, and
  workbook data preparation.
- `server/scheduler.js`: Schedule placement, movement, gap filling, and no-overlap rules.
- `server/translationService.js`: Uses local activity vocabulary first and online translation only
  for unknown labels.
- `server/speechService.js`: Spanish audio proxy, local Hmong voice indexing, number conversion, and
  continuous Hmong WAV assembly.
- `server/xlsx.js`: Creates the Excel workbook bytes without running Excel.
- `server/network.js`: Detects and validates local/public access addresses.
- `server/seedDemo.js`: Creates or resets demonstration records.

## 6. Database Tables

### `guests`

Stores only first name and last name plus timestamps. A returning name points back to the same guest
record.

### `check_ins`

Stores one visit:

- Guest reference
- New sign-up or returning sign-in
- Chosen language
- Active or cleared status
- Check-in, completion, and clear times

### `activities`

Stores the admin definition of a service:

- English and translated names
- Icon and duration
- Timed or untimed
- Activity-specific hours
- Daily quantity limit
- Monthly and yearly date windows
- Alarm configuration
- Active/inactive state

### `scheduled_activity_items`

Stores a snapshot of each requested activity for a visit. It includes translated names and the rules
needed to preserve historical accuracy even if Admin later renames the activity.

### `status_history`

Stores transitions such as Waiting to In Progress and In Progress to Completed.

### `settings`

Stores workday settings, network addresses, customization values, daily rollover markers, and the
hashed admin PIN.

## 7. Daily Rollover

The first relevant request after midnight calls `ensureCurrentDashboardDay()` in
`server/repository.js`.

It:

1. Compares the saved operating-day marker with the current local calendar day.
2. Changes old active check-ins to cleared.
3. Starts a new dashboard-day marker.
4. Leaves guests, check-ins, activity items, and status history in the database.

Manual New Day Reset uses an ID boundary as well as a time marker. This allows staff to reset during
the same calendar date without yesterday's or the earlier shift's records returning to the live
screen.

Resetting the live day is not deleting analytics history.

## 8. Scheduling

Timed activities have:

- Estimated duration
- Optional activity-specific operating window
- Overall workday boundary
- Buffer between one guest's activities

The scheduler searches for the earliest valid opening, keeps one guest from being in two places at
once, and permits different guests to use different activity columns simultaneously.

Untimed activities receive no calendar time and appear in the untimed queue.

For timed activities, the scheduler compares all of a guest's remaining selected services and picks
the earliest legal lane. This allows an open private-room, laundry, or meal lane to be used while
another selected service is occupied. A five-minute buffer applies between that guest's services,
but activity lanes do not receive an unnecessary buffer between different guests. Waiting items are
rebalanced after new check-ins, final status changes, and server startup when the remaining workday
has enough capacity. In Progress items stay fixed.

Staff can move a block. The repair functions then move affected items to preserve no-overlap,
activity hours, workday hours, durations, and buffers.

When a timed activity is completed or skipped early, the repository records the real finish time and
compacts later work where the rules permit.

## 9. Translation

Activity translation has two levels:

1. `shared/activityTranslations.js` handles common shelter terminology locally.
2. `server/translationService.js` sends only an unknown activity label to the configured translator.

Guest names and visit data are never sent to the activity translator.

Translated activity names are saved in the activity row and copied into each scheduled item. Admin
can manually correct any saved translation.

## 10. Read Aloud

The read-aloud button builds short segments from the current kiosk screen.

- English uses the best installed English system voice.
- Somali uses the best installed Somali system voice.
- Spanish requests Spanish audio from the server and falls back to an installed Spanish voice when
  the online service is unavailable.
- Hmong requests a complete sentence WAV from the local server.

For Hmong, `server/speechService.js`:

1. Converts numbers up to 100 into Hmong words.
2. Finds the corresponding native-recorded Yuhalu samples.
3. Trims the isolated-recording tail from words that continue into another word.
4. Removes the isolated-recording lead-in and tail at internal word boundaries.
5. Blends adjacent samples with an 85 ms equal-power crossfade so volume remains steady.
6. Preserves the complete final word and returns one continuous WAV for the sentence.

The browser therefore plays one sentence, not one separately loaded word at a time. Activity cards
still use a deliberate one-second pause between cards so a listener can distinguish the choices.

The Hmong voice pack is installed with:

```bash
npm run speech:install-hmong
```

## 11. Staff Alarms

An alarm is created only when:

- The activity is timed.
- Admin enabled its alarm.
- Staff marked it In Progress.
- Its configured warning point has been reached.

The website displays a warning and repeats sound/vibration. **Stop alarm**:

1. Removes that warning.
2. Stops the Web Audio context.
3. Cancels vibration.
4. Closes the browser or service-worker notification.
5. Marks that exact activity occurrence as dismissed so the next timer check does not recreate it.
6. Tells the Android bridge to cancel the matching native alarm and notification.

Android's notification also has a **Stop alarm** action handled by
`ActivityAlarmReceiver.java`.

Changing an activity back to In Progress deliberately clears its dismissed marker, treating that as
a new timer run.

## 12. Android App

The native code is in `mobile/android/app/src/main/java/org/listeninghouse/checkin/`.

- `MainActivity.java`: WebView, connection screen, saved server address, retry behavior, permissions,
  and the JavaScript bridge.
- `ActivityAlarmScheduler.java`: Converts website alarm data into Android `AlarmManager` entries.
- `ActivityAlarmReceiver.java`: Receives alarms and displays Android notifications.

The app does not contain a separate copy of shelter data. It connects to the same Node/SQLite server
as browsers.

## 13. Network Operation

The server listens on `0.0.0.0`, so it accepts requests on the Pi's network interfaces.

`localhost` works only on the Pi itself. Staff devices use:

```text
http://raspberrypi.local:3000/dashboard
```

or the Pi's IP address:

```text
http://192.168.x.x:3000/dashboard
```

Local mode requires the phone and Pi to be on a Wi-Fi network that allows devices to communicate.
Public mode uses the configured HTTPS tunnel URL.

## 14. Raspberry Pi Automatic Boot

Run once:

```bash
sudo ./scripts/raspberry-pi/install-autostart.sh
```

That script installs two separate startup pieces.

### Server startup

It creates `/etc/systemd/system/listening-house.service`.

At operating-system boot, systemd:

1. Waits until the basic network target is available.
2. Runs `npm start` in the project directory as the installing user.
3. Sets production mode.
4. Restarts the server five seconds after a crash.
5. Starts it before any user opens a browser.

### Kiosk browser startup

It creates:

```text
~/.config/autostart/listening-house-kiosk.desktop
```

When the Pi desktop user logs in, that entry runs `scripts/raspberry-pi/start-kiosk.sh`.

The kiosk script:

1. Polls `/api/health` every 250 ms.
2. Waits up to about 20 seconds for Node to be ready.
3. Finds `chromium-browser` or `chromium`.
4. Replaces itself with Chromium in kiosk mode at `http://127.0.0.1:3000/kiosk`.

The server and browser are separate on purpose. The server can restart without requiring the whole
Pi to reboot, and staff phones can use the server even if the touchscreen browser is closed.

## 15. Windows Automatic Boot

Run once:

```powershell
npm run startup:windows:install
```

The installer tries three current-user startup methods for reliability:

- Windows Scheduled Task at sign-in
- Startup folder command
- Current-user `Run` registry entry

All launch `scripts/windows/start-listening-house-kiosk.ps1`.

The startup script uses a named mutex to prevent duplicate launches, checks `/api/health`, starts
`node server/index.js` hidden if needed, waits for readiness, finds Edge or Chrome, closes an old
kiosk instance, and opens the kiosk full-screen. It writes progress to `kiosk-startup.log`.

## 16. Starting Manually Without Auto Boot

### Windows or another computer

Open a terminal in the project:

```powershell
npm run build
npm start
```

Leave that terminal running, then open:

```text
http://localhost:3000/kiosk
```

To use the prepared Windows launcher manually:

```powershell
npm run startup:windows:start
```

To start only the server without opening the kiosk browser:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-listening-house-kiosk.ps1 -NoBrowser
```

### Raspberry Pi with systemd already installed

Start the server:

```bash
sudo systemctl start listening-house
sudo systemctl status listening-house
```

Open the kiosk:

```bash
scripts/raspberry-pi/start-kiosk.sh
```

View server logs:

```bash
journalctl -u listening-house -f
```

### Raspberry Pi without auto boot installed

```bash
cd /path/to/listening-house-project
npm start
```

In another terminal:

```bash
chromium --kiosk http://localhost:3000/kiosk
```

Stopping the foreground `npm start` process stops the server. Staff phones will lose access until it
is started again.

## 17. Build and Production

`npm run build` compiles React into `dist/`.

`npm start` runs only `server/index.js`. Express serves the existing `dist/` files. After changing
frontend code, run `npm run build` before restarting production so the server receives the updated
website.

Server-only JavaScript changes take effect after restarting Node. Android Java changes require
building and reinstalling the APK.

## 18. Tests and Maintenance

Useful commands:

```bash
npm test
npm run format:check
npm run build
npm run stress:storage -- --check-ins 100000
npm run stress:live -- --check-ins 1000
```

The tests cover scheduling, activity rules, translations, speech assembly, analytics, duplicate
check-ins, daily rollover, alerts, and security-sensitive server behavior.

Back up `data/listening-house.sqlite`. The local Hmong voice files can be reinstalled and do not need
to be included in every database backup.
