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

```bash
cd /path/to/listening-house-project
npm install
npm run build
npm run speech:install-hmong
```

Create `.env`:

```env
PORT=3000
ADMIN_PIN=1717
DATABASE_PATH=./data/listening-house.sqlite
```

Start:

```bash
npm start
```

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

## Automatic Startup

The included helper installs the server and Chromium startup configuration:

```bash
chmod +x scripts/raspberry-pi/*.sh
sudo ./scripts/raspberry-pi/install-autostart.sh
```

Remove it:

```bash
sudo ./scripts/raspberry-pi/remove-autostart.sh
```

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
8. Scan the About-page QR codes from a phone.
9. Restart the Pi and confirm the server and kiosk return automatically.

## Backup

Stop the service and copy:

```text
data/listening-house.sqlite
```

SQLite WAL files may exist while the server is running, so stop the service before making a manual
file copy.
