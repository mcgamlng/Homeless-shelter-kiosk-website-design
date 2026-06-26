# Public Internet Access

The recommended public-access method is Cloudflare Tunnel. The Raspberry Pi remains the server,
while `cloudflared` creates an outbound connection to a public HTTPS hostname. No router port
forwarding is required.

## Before Publishing

1. Change the default Admin PIN.
2. Build and start the app:

   ```bash
   npm run build
   npm start
   ```

3. Confirm the local health check:

   ```text
   http://localhost:3000/api/health
   ```

## Temporary Public Test

Install `cloudflared`, then run:

Windows:

```powershell
npm run public:tunnel:windows
```

Raspberry Pi:

```bash
chmod +x scripts/raspberry-pi/start-public-tunnel.sh
./scripts/raspberry-pi/start-public-tunnel.sh
```

Cloudflare prints a temporary `https://...trycloudflare.com` address. This address changes whenever
the tunnel restarts and is intended only for testing.

## Permanent Public Address

1. Add a domain to a Cloudflare account.
2. In Cloudflare, create a Tunnel.
3. Add a Published application route such as:

   ```text
   checkin.example.org -> http://localhost:3000
   ```

4. Install the tunnel service on the Raspberry Pi using the command Cloudflare provides.
5. Set the same public address in `.env`:

   ```env
   PUBLIC_URL=https://checkin.example.org
   ```

6. Restart the Listening House service.

The About page and its browser, iPhone, and Android QR codes will then use the public address.

## Availability

The Raspberry Pi and its internet connection must remain on. Cloudflare Tunnel solves remote
network access, but it does not move the SQLite database away from the Pi.

## Security

- Kiosk check-in remains public.
- Staff dashboard data and real-time updates require the Admin PIN session.
- Admin settings and spreadsheet reports require the Admin PIN.
- Use HTTPS through the tunnel.
- Do not publish the raw Raspberry Pi port through router port forwarding.

Official setup guide:

```text
https://developers.cloudflare.com/tunnel/setup/
```
