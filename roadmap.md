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
   sudo apt install -y ffmpeg   # for on-the-fly remux streaming (mkv/avi → mp4)
   ffmpeg -version && ffprobe -version   # both on PATH → streaming works out of the box
   ```

3. **Mount the media drive** (Windows D:/E: → under /mnt on the Pi)
   ```bash
   lsblk                                  # find the drive, e.g. /dev/sda1
   sudo mkdir -p /mnt/media
   sudo mount /dev/sda1 /mnt/media
   ```
   Auto-mount on boot: add a line to `/etc/fstab` (needs the drive's filesystem/UUID).

4. **Set the password** *(optional under Tailscale — see decision below)*
   ```bash
   cp server/.env.example server/.env
   nano server/.env
   ```
   ```
   AUTH_PASSWORD=your-strong-password
   AUTH_COOKIE_SECURE=true
   ```
   **Me-only via Tailscale:** Tailscale is already a private encrypted network, so
   the app password is redundant. Leave `AUTH_PASSWORD` **blank** — `authEnabled()`
   returns false, no login flow. Only set it if you later expose the app publicly.

5. **Run as a service (survives reboot)** — pick systemd *or* pm2

   **systemd** (native, no extra global dep — unit file `media-monkey.service` in repo):
   ```bash
   sudo cp media-monkey.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now media-monkey
   journalctl -u media-monkey -f
   ```
   **pm2** (alternative):
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
   curl -s http://localhost:5000/api/auth/status   # blank password → {"authRequired":false}
   ```

> **Don't build on the Pi if RAM ≤ 2GB.** `npm run build` (tsc + vite) can OOM.
> Build `client/dist` on your desktop and `rsync` it to the Pi, or add swap +
> `NODE_OPTIONS=--max-old-space-size=512` before building.

### HTTPS + external access

**DECIDED: Tailscale (me + my devices only).** Private encrypted mesh — nothing
exposed publicly, no domain, no static IP, no port-forwarding. Leave `AUTH_PASSWORD`
blank (Tailscale is the auth layer).
```bash
# on the Pi
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale cert <pi>.<tailnet>.ts.net    # HTTPS cert (optional)
```
Install Tailscale on phone/laptop → reach `http://<pi>.<tailnet>.ts.net:5000`
(or `tailscale serve` to front it with HTTPS on 443). Look into MagicDNS +
`tailscale serve`. `tailscale funnel` = optional public exposure if that changes.

---

The public-hosting tracks below are kept for reference only (needed only if
access model changes to shared/public):

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
- cleanvid as an async job with progress UI
- **Transcode phase 2b — offline batch** (the remaining transcode route): pre-convert
  incompatible files to web-h264 mp4 once (overnight), so they Direct Play with zero
  per-stream CPU. Best fit for a Pi; complements the live HLS path (now done — see
  Done). Needs a job queue + progress UI + rescan to pick up the converted file.

## Done

- **Collections tab (movies + TV shows):** new 🗂️ Collections nav tab + `/api/collections`.
  A collection groups items across folders — **virtual**, nothing on disk moves.
  Members merge two sources: year-less movie-collection folders (e.g. `D:\Movies\Karate Kid`)
  contribute their movies, and users attach any movie/show from any folder
  (`collection_members` table; a same-named `collections` row is created lazily).
  Movies tab now shows **only movies** — collection folders moved to the Collections
  tab. Items still appear in their own tabs (Cobra Kai stays under TV Shows AND in the
  Karate Kid collection). Collection page has an add-picker + per-attached-item remove.
- **Video quality badges:** resolution parsed from filenames (…1080p…, …2160p 4K…) →
  corner badge on posters everywhere. Instant, no ffprobe. Null when the name has no tag.
- **Season poster covers from TMDB:** show page has **🖼️ Fetch season posters (TMDB)**.
  One `/tv/{id}` call returns every season's poster; each is saved as `poster.jpg` in
  its season folder (matched by season number parsed from the folder name — "Season 1",
  "Specials"→0), kept on disk + shown as the season cover on rescan. Needs `TMDB_API_KEY`;
  degrades to a clear message otherwise. `POST /:sid/:folder/:show/season-posters`.
- **Subtitle download from OpenSubtitles:** search (`find-subtitles`) already worked;
  download is now wired. `POST /:serverId/:folderName/:itemTitle/subtitles { fileId }`
  logs into OpenSubtitles (cached bearer token from `OPENSUBTITLES_USERNAME`/`PASSWORD`),
  hits `/download` for a temporary link, fetches the `.srt`, and **saves it into the
  item's folder** (unique-named, sanitized). A folder rescan then makes it a tracked
  subtitle track, so it's kept on disk + auto-loads on playback. Item page shows a
  **⬇ Download** button per search result. Needs the API key (search) + account
  login (download); degrades to a clear message otherwise.
  - **TV episodes** covered too: per-episode **🔍 Find subs** on the season page.
    Season/episode numbers are parsed from the episode filename (S01E02 / 1x02) to
    query OpenSubtitles precisely; the `.srt` saves beside the episode file named to
    slug-match it, and only that season's cache is busted on rescan.
- **Transcode phase 2a — live HLS transcode w/ true seek:** files whose video codec
  can't remux (HEVC/AV1/…) now stream as **on-demand HLS** instead of a `415`. Client
  calls `GET /api/media/streaminfo` first, which returns `{ mode }`:
  - `directplay` → raw `/media` (full seek) · `remux` → stream-copy mp4 pipe (start-only)
  - `hls` → `GET /api/media/hls.m3u8` VOD playlist; player loads it via **hls.js**
    (native HLS on Safari). Each 6s segment (`GET /api/media/hls-segment.ts?i=`) is
    transcoded to h264/aac mpegts **on demand** — only watched time costs CPU, and any
    segment is independently seekable → **true seek + resume** on transcoded streams.
  - Encoder auto-picks Pi 4 HW `h264_v4l2m2m` when present, else `libx264`
    (override via `FFMPEG_HW_ENCODER`). Segment uses input-seek + `-output_ts_offset`
    (not `-copyts`, which drops all frames when combined with `-t`) for a continuous
    timeline. Remaining transcode work is offline batch — see Future (phase 2b).
- **Pi tuning:** cache headers on `/media` + hashed static assets (browser caches
  posters, spares Pi CPU/SD); `child_cache` table caches season/episode/collection
  scans (no per-request disk walk on slow storage; `?refresh=1` busts it,
  auto-invalidated on folder rescan / settings change); `media-monkey.service`
  systemd unit; Tailscale chosen for me-only access (leave `AUTH_PASSWORD` blank).
- **Remux-on-the-fly streaming:** non-directplay video (mkv/avi/…) routes through
  `GET /api/media/stream`, which probes with ffprobe and:
  - h264 video → **stream-copy remux** into fragmented mp4 (near-zero CPU, plays in
    browser; audio kept if aac/mp3, else re-encoded to aac).
  - directplay containers (mp4/m4v/webm) → 302 redirect to raw `/media` (full seek).
  - HEVC/AV1/other → now served via on-demand HLS transcode (see Transcode phase 2a).
  - ffmpeg missing → falls back to raw `/media` redirect.

  Needs `ffmpeg`+`ffprobe` on the host (override paths via `FFMPEG_CMD`/`FFPROBE_CMD`).
  Remuxed streams aren't byte-range seekable → resume/scrub limited (player shows a
  note); directplay files keep full seek. **Existing mkv items need one Save & Rescan
  to pick up the new stream URLs** (top-level rows store the URL; episodes rescan live).
