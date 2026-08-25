# Hosting Media Monkey (e.g. on a Raspberry Pi)

## Recommended architecture: everything on the Pi

The Express server already serves the built React client (`client/dist`), so run
**both from one process on the Pi**. One origin = simple, and the login cookie
stays first-party (`SameSite=Lax`).

Avoid splitting the client onto GitHub Pages with the API on the Pi: that makes
the login cookie third-party (`SameSite=None`, increasingly blocked), forces
HTTPS + CORS on the Pi anyway, and triggers mixed-content blocks. No upside for a
personal app.

## 1. Turn on the password

Auth is **off** until you set a password. In `server/.env`:

```
AUTH_PASSWORD=your-strong-password
AUTH_COOKIE_SECURE=true      # once you're behind HTTPS (below)
```

When set, every `/api/*` and `/media/*` route requires login — including the
filesystem-browse endpoint used by the Settings folder picker. `SESSION_SECRET`
is auto-generated and persisted to `server/data/.session-secret` if you don't set
one (keeps you logged in across restarts).

## 2. Build + run

```
npm run setup      # installs deps + builds the client
AUTH_PASSWORD=... npm start
```

The app is now at `http://<pi-ip>:5000`.

## 3. Put HTTPS in front

**Never expose it over plain HTTP on the internet.** Two easy options:

### Option A — Caddy (auto HTTPS, needs a domain pointing at your Pi)

`Caddyfile`:

```
media.example.com {
    reverse_proxy localhost:5000
}
```

`caddy run` — Caddy fetches a Let's Encrypt cert automatically and forwards the
`X-Forwarded-Proto` header the server uses to mark the cookie `Secure`.

### Option B — Cloudflare Tunnel (no open ports, no port-forwarding)

```
cloudflared tunnel --url http://localhost:5000
```

Cloudflare terminates HTTPS and (optionally, via Cloudflare Access) can add its
own login on top. Nothing on the Pi is directly reachable from the internet.

## Security checklist before exposing publicly

- [ ] `AUTH_PASSWORD` set to something strong
- [ ] Behind HTTPS (Caddy or Cloudflare Tunnel), `AUTH_COOKIE_SECURE=true`
- [ ] Only the media folders you intend are configured in Settings (the
      folder-picker can browse the whole filesystem — but it's now behind auth)
- [ ] `server/.env` and `server/data/` are not committed (already git-ignored)
