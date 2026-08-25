# Roadmap

## Deploy publicly on a Raspberry Pi

Code is done (password auth, client served by server). Remaining is Pi-side ops.

### On the Pi

1. **Install Node 24** (`node:sqlite` is only flag-free on 24)
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt install -y nodejs
   node -v   # v24.x
   ```

2. **Get the code + build**
   ```bash
   git clone https://github.com/webcooltz/media-monkey.git
   cd media-monkey
   npm run setup      # installs client+server deps, builds the client
   ```

3. **Mount the media drive** (Windows D:/E: → under /mnt on the Pi)
   ```bash
   lsblk                                  # find the drive, e.g. /dev/sda1
   sudo mkdir -p /mnt/media
   sudo mount /dev/sda1 /mnt/media
   ```
   Auto-mount on boot: add a line to `/etc/fstab` (needs the drive's filesystem/UUID).

4. **Set the password**
   ```bash
   cp server/.env.example server/.env
   nano server/.env
   ```
   ```
   AUTH_PASSWORD=your-strong-password
   AUTH_COOKIE_SECURE=true
   ```

5. **Run as a service (survives reboot)** — pm2 config already in repo
   ```bash
   sudo npm install -g pm2
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup            # run the command it prints
   ```
   App at `http://<pi-ip>:5000`. Open it → Settings → point each folder at its Pi
   path (e.g. `/mnt/media/Movies`) → Save & Rescan.

6. **Verify locally before exposing**
   ```bash
   curl -s http://localhost:5000/api/auth/status   # {"authRequired":true,...}
   ```

### HTTPS + external access — pick ONE

**Track A — Cloudflare Tunnel** (easiest, no port-forwarding; needs a domain on Cloudflare)
```bash
cloudflared tunnel login
cloudflared tunnel create media-monkey
cloudflared tunnel route dns media-monkey media.yourdomain.com
cloudflared tunnel run --url http://localhost:5000 media-monkey
```
No open router ports. Optionally add Cloudflare Access for a second login layer.

**Track B — Caddy** (needs a domain pointing at your home IP + port-forward 80/443)
```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile:
#   media.yourdomain.com {
#       reverse_proxy localhost:5000
#   }
sudo systemctl restart caddy
```
Forward router ports 80+443 to the Pi. Caddy auto-fetches a Let's Encrypt cert.

### Open decisions (drive Track A vs B)

- Domain name? (both HTTPS options need one; no domain → free hostname via CF tunnel)
- Cloudflare account?
- Router port-forwarding OK? (no → Track A only)

See also `HOSTING.md` for the rationale (why both-on-Pi, not GitHub Pages split).

## Future / not started

- `/etc/fstab` auto-mount line for the media drive
- Subtitle download/import from OpenSubtitles (search works; download stubbed)
- cleanvid as an async job with progress UI
- Persist seasons/episodes/collection children in the DB (currently scanned per request)
