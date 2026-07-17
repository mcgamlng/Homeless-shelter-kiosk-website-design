# Raspberry Pi Deployment

## Hardware

- Raspberry Pi with 4 GB RAM minimum
- Raspberry Pi OS 64-bit
- MicroSD card or SSD
- Local Wi-Fi or Ethernet
- Touchscreen for the kiosk

The app does not require 8 GB RAM.

## Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version
```

## Install and Build

### Copy the GitHub HTTPS link

This is the exact repository address the Raspberry Pi needs:

```text
https://github.com/mcgamlng/Homeless-shelter-kiosk-website-design.git
```

If you are looking at the GitHub page in a browser:

1. Open the repository page.
2. Press the green **Code** button.
3. Choose **HTTPS**.
4. Copy the address that ends in `.git`.

Do not copy only `mcgamlng/Homeless-shelter-kiosk-website-design.git`. The Raspberry Pi needs the
full `https://github.com/...` address.

### Clone the project onto the Raspberry Pi

Run this exact command block on the Raspberry Pi:

```bash
sudo apt-get update
sudo apt-get install -y git unzip
cd /home/pi
git clone https://github.com/mcgamlng/Homeless-shelter-kiosk-website-design.git listening-house-project
cd listening-house-project
```

What this does:

- `cd /home/pi` moves you to the Pi user's home folder.
- `git clone ... listening-house-project` copies the GitHub project into a new folder named
  `listening-house-project`.
- `cd listening-house-project` opens that new folder.

Most setup commands after this point should be typed inside the `listening-house-project` folder.

If the Pi says the folder already exists, do not clone again. Use:

```bash
cd /home/pi/listening-house-project
git pull
```

If you are not using Git yet, copy the project folder to the Pi, then open a terminal inside that
folder.

```bash
cd /path/to/listening-house-project
npm install
npm run build
npm run speech:install-hmong
```

For Raspberry Pi read-aloud support, also install the lightweight local speech package:

```bash
sudo apt-get install -y espeak-ng
```

The kiosk now tries natural online speech first, including the British English voice
`en-GB-RyanNeural`. Spanish and Somali use natural/cloud speech before local `espeak-ng` and browser
fallback. Hmong Daw uses the `mww` cloud speech code first, then the local Hmong phrase or syllable
pack, then emergency `espeak-ng` pronunciation. The emergency voice is robotic, but it keeps read
aloud working when Chromium browser speech is unavailable.

Create `.env`:

```env
PORT=3000
ADMIN_PIN=2468
DATABASE_PATH=./data/listening-house.sqlite
```

Start:

```bash
npm start
```

Manual operation without auto boot:

1. Open a terminal on the Pi.
2. Go to the project folder.
3. Run `npm start`.
4. Open Chromium to `http://localhost:3000/kiosk`.

Stopping that terminal process stops the server. Staff phones and tablets can only connect while the
server is running.

## Open the System

On the Pi:

```text
http://localhost:3000/kiosk
```

From staff devices:

```text
http://raspberrypi.local:3000/dashboard
```

Find the IP:

```bash
hostname -I
```

Then use:

```text
http://192.168.x.x:3000/dashboard
```

The About page shows QR codes for the browser dashboard and Android app download.

## Full-Screen Kiosk

```bash
chromium-browser --kiosk http://localhost:3000/kiosk
```

If the installed command is `chromium`:

```bash
chromium --kiosk http://localhost:3000/kiosk
```

The included `scripts/raspberry-pi/start-kiosk.sh` launcher uses its own Chromium profile and tells
Chromium to use basic local password storage. That prevents the full-screen kiosk from needing the
Raspberry Pi desktop keyring.

If the Pi still shows an **Unlock Keyring** box, it is usually the desktop browser profile, not the
Listening House database. On a dedicated kiosk device, you can clear the desktop keyring with:

```bash
mv ~/.local/share/keyrings ~/.local/share/keyrings.backup.$(date +%Y%m%d-%H%M%S)
reboot
```

After reboot, if Raspberry Pi OS asks to create a new keyring, leave the new keyring password blank.
This removes saved desktop keyring secrets, but it does not delete the Listening House SQLite data.

## Automatic Startup

The included helper installs the server and Chromium startup configuration:

```bash
chmod +x scripts/raspberry-pi/*.sh
sudo ./scripts/raspberry-pi/install-autostart.sh
```

The installer:

- Installs `espeak-ng` for read-aloud fallback.
- Installs Chromium if it is missing.
- Creates the `listening-house.service` server service.
- Creates the kiosk launcher in the real desktop user's startup folder, such as
  `/home/pi/.config/autostart/listening-house-kiosk.desktop`.
- Starts the server service immediately.

Remove it:

```bash
sudo ./scripts/raspberry-pi/remove-autostart.sh
```

## Updating From GitHub

Codex does not need to be installed on the Raspberry Pi for the kiosk to run. The easiest workflow is:

1. Edit and test the code on your laptop with Codex.
2. Push the finished code to GitHub.
3. On the Raspberry Pi, pull the latest code and restart the kiosk server.

Run this from the project folder on the Pi:

```bash
chmod +x scripts/raspberry-pi/*.sh
./scripts/raspberry-pi/update-from-github.sh
```

The update helper:

- Stops the server service if it is running.
- Backs up `data/listening-house.sqlite` into `data/backups`.
- Pulls the latest GitHub code.
- Installs dependencies.
- Rebuilds the website.
- Installs new Node dependencies when they are added.
- Installs the lightweight `espeak-ng` speech fallback.
- Installs keyboard volume controls for the Raspberry Pi kiosk.
- Refreshes the desktop shortcut named **Open Listening House Kiosk**.
- Installs the Hmong fallback voice pack if missing.
- Preloads common read-aloud phrases into `data/speech-cache` when a speech source is available.
- Restarts the service and checks `http://127.0.0.1:3000/api/health`.

## Yearly Data Deletion

Admin can set one yearly deletion date and time with a full year, month, and day. Warning banners
appear in Admin and Dashboard 14 days before deletion. At the scheduled time, the system deletes
guest names, check-ins, scheduled items, status history, analytics archive records, and spreadsheet
files in `data/exports`.

The deletion does not remove staff user accounts, permissions, admin PIN/security settings,
activities, kiosk customization, or app settings. If the Pi is off at the scheduled deletion time, the
deletion runs on the next startup after that time. Staff can still download day, week, month, or year
Excel reports from Admin Analytics before the yearly deletion date.

## Admin Kiosk and Pi Controls

Admin includes **Kiosk & Raspberry Pi Controls**:

- **Exit kiosk screen** tries to close only the Chromium kiosk window on Raspberry Pi/Linux.
- **Run update now** pulls the newest GitHub code, rebuilds the app, and restarts the server.
- **Automatic Raspberry Pi updates** is an on/off checkbox that creates or disables a Raspberry Pi
  timer. When it is on, the Pi runs the GitHub update every two weeks.
- **Reboot Pi now** sends a Raspberry Pi reboot command.

The update script also installs a desktop shortcut named **Open Listening House Kiosk**. If Chromium
is completely closed and staff cannot press a web button, double-click that desktop icon to reopen
the kiosk without rebooting.

To turn on the two-week updater from the terminal instead of Admin:

```bash
cd ~/listening-house-project
chmod +x scripts/raspberry-pi/*.sh
sudo ./scripts/raspberry-pi/install-auto-update.sh
```

Rebooting does not delete saved check-ins because they are stored in SQLite. Do wait for any active
check-in or Excel export to finish first. Unsaved Admin form edits are lost, and phones/tablets
disconnect while the Pi restarts.

## Raspberry Pi Volume Keys

The Raspberry Pi installer sets up keyboard volume keys for the kiosk. The volume up, volume down,
and mute keys are bound to a small local script that tries PipeWire, PulseAudio, and ALSA in that
order. The kiosk also asks the Pi to use a loud preset when Read Aloud starts. If a keyboard does
not send standard media keys, run this once from the project folder and reboot:

```bash
cd ~/listening-house-project
chmod +x scripts/raspberry-pi/*.sh
./scripts/raspberry-pi/install-volume-keys.sh
sudo reboot
```

If you still want Codex on the Pi for development, install Codex CLI separately and sign in with
ChatGPT device-code login or an API key. Do not make Codex part of the production startup service.

## systemd Example

```ini
[Unit]
Description=Listening House Guest Check-In System
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/listening-house-project
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=2
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable listening-house
sudo systemctl start listening-house
sudo systemctl status listening-house
```

## Operational Checks

1. Create a new first-and-last-name sign-up.
2. Confirm the dashboard updates immediately.
3. Confirm timed activities appear on the calendar.
4. Confirm each timed activity stays inside its configured start and end hours.
5. Confirm untimed services appear in the queue.
6. Test daily quantity limits.
7. Turn on dashboard alarms and test an In Progress activity.
8. Open Admin and confirm Read Aloud Voice Status shows the expected Hmong mode.
9. Scan the About-page QR codes from a phone.
10. Download an Excel report from Admin Analytics.
11. Restart the Pi and confirm the server and kiosk return automatically.

## Backup

Stop the service and copy:

```text
data/listening-house.sqlite
```

SQLite WAL files may exist while the server is running, so stop the service before making a manual
file copy.
