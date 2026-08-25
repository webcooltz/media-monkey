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

## Research: remote access / networking

Decide how to reach the Pi from outside the house. First answer: **who needs
access — just me, or others too?**

### Background: home IP
- Two IPs: **LAN** (`192.168.x.x`, in-house only) and **public** (ISP-assigned).
- Public IP is almost always **dynamic** (changes over time). Static usually costs
  extra from the ISP.
- Using the bare public IP directly is discouraged: it changes, needs
  port-forwarding (exposes the Pi), and you can't easily get an HTTPS cert for a
  raw IP.

### Option comparison

| Who needs access | Option | Domain? | Static IP? | Port-forward? |
|---|---|---|---|---|
| Just me + my devices | **Tailscale** | No | No | No |
| Anyone / any browser | **Cloudflare Tunnel** | Yes (~$10/yr) | No | No |
| DIY public | Caddy + DDNS | Yes | No (DDNS) | Yes |

### Option 1 — Tailscale (recommended if it's mainly me)
Private encrypted network across my devices; nothing exposed publicly. Free, no
domain, no static IP, no port-forwarding. Gives HTTPS + stable hostname.
```bash
# on the Pi
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale cert <pi>.<tailnet>.ts.net    # HTTPS cert
```
Install Tailscale on phone/laptop too → reach `https://<pi>.<tailnet>.ts.net`.
Research: MagicDNS, `tailscale serve`/`funnel` (funnel = optional public exposure),
ACLs.

### Option 2 — Cloudflare Tunnel (research focus — for public/shared access)
Reaches the Pi from any browser without opening ports or knowing the public IP.
The tunnel makes an **outbound** connection to Cloudflare; Cloudflare terminates
HTTPS and forwards traffic down the tunnel. Dynamic IP is irrelevant.

Needs: a domain managed by Cloudflare (buy one, or move an existing domain's DNS
to Cloudflare — free tier is fine).

Rough steps to validate:
```bash
# install cloudflared on the Pi (armhf/arm64 build), then:
cloudflared tunnel login                       # browser auth to CF account
cloudflared tunnel create media-monkey         # creates tunnel + credentials file
cloudflared tunnel route dns media-monkey media.yourdomain.com
# config.yml maps hostname -> local service:
#   tunnel: <tunnel-id>
#   credentials-file: /home/pi/.cloudflared/<id>.json
#   ingress:
#     - hostname: media.yourdomain.com
#       service: http://localhost:5000
#     - service: http_status:404
cloudflared tunnel run media-monkey            # test
sudo cloudflared service install               # run as a service on boot
```
Research topics:
- **Cloudflare Access** (Zero Trust) — add a login layer (Google / email OTP) in
  *front* of the app, on top of the app's own password. Free for small teams.
- Running `cloudflared` as a systemd service (survives reboot).
- `config.yml` ingress rules; multiple hostnames/services.
- Cost: tunnel is free; only the domain costs money (~$8–12/yr).
- Set `AUTH_COOKIE_SECURE=true` (traffic is HTTPS via CF).

### Option 3 — Caddy + Dynamic DNS (only if avoiding Tailscale/Cloudflare)
Needs a domain + a DDNS updater (keeps hostname pointed at the changing public IP)
+ router port-forward 80/443. Caddy auto-fetches Let's Encrypt certs. More moving
parts; least recommended.

### To decide / research next
- [ ] Who needs access (me-only → Tailscale; shared → Cloudflare Tunnel)
- [ ] If Cloudflare: buy/transfer a domain to Cloudflare
- [ ] Try Cloudflare Tunnel end-to-end; add Cloudflare Access login layer
- [ ] Compare Tailscale Funnel vs Cloudflare Tunnel for occasional public sharing
- [ ] Confirm `cloudflared` arm build + systemd autostart on the Pi

## Future / not started

- `/etc/fstab` auto-mount line for the media drive
- Subtitle download/import from OpenSubtitles (search works; download stubbed)
- cleanvid as an async job with progress UI
- Persist seasons/episodes/collection children in the DB (currently scanned per request)
