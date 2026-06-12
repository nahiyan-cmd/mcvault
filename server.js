# MC Vault

A dark, minimal dashboard for managing up to 10 Minecraft accounts. Lets you sign in
with Microsoft (real OAuth, via Xbox Live + Minecraft Services), automatically
fetches the account's username, UUID and skin, and pulls PvP tier data from MCTiers.

---

## 1. Requirements

- Node.js 18+ installed
- A web host that supports running a Node.js server (Render, Railway, Fly.io,
  a VPS, etc.). **This will NOT work on pure static hosting** (GitHub Pages,
  static Netlify, plain shared cPanel hosting) because the Microsoft login step
  needs a backend to safely hold your Client Secret.

---

## 2. Local setup

```bash
npm install
cp .env.example .env
```

Open `.env` and fill in:

- `MS_CLIENT_ID` — from your Azure App Registration overview page
- `MS_CLIENT_SECRET` — from "Certificates & secrets" (the Value, not the Secret ID)
- `MS_REDIRECT_URI` — must EXACTLY match what's set in Azure, e.g.
  `http://localhost:3000/api/auth/callback` for local testing, or
  `https://yourdomain.com/api/auth/callback` once deployed
- `SESSION_SECRET` — any long random string

Then run:

```bash
npm start
```

Visit `http://localhost:3000`.

---

## 3. Azure setup checklist

In your App Registration (portal.azure.com → App registrations → your app):

1. **Authentication** → add a "Web" platform redirect URI matching `MS_REDIRECT_URI`
   exactly (including `http://` vs `https://` and trailing path).
2. **Supported account types** → "Personal Microsoft accounts" (or "Any Entra ID
   tenant + personal Microsoft accounts") so any Xbox/Minecraft account can log in.
3. **Certificates & secrets** → make sure you have a valid (non-expired) client secret.

⚠️ If you ever shared your Client Secret anywhere (chat, screenshots, etc.),
go delete it and generate a new one — treat it like a password.

---

## 4. Deploying

### Option: Render / Railway (easiest)

1. Push this folder to a GitHub repo.
2. Create a new "Web Service" on Render/Railway, point it at the repo.
3. Set the environment variables (`MS_CLIENT_ID`, `MS_CLIENT_SECRET`,
   `MS_REDIRECT_URI`, `SESSION_SECRET`) in the host's dashboard — do NOT commit
   `.env` to git.
4. Set the start command to `npm start`.
5. Once deployed, update `MS_REDIRECT_URI` (both in `.env`/host settings AND in
   Azure's Authentication page) to your live URL, e.g.
   `https://mcvault.onrender.com/api/auth/callback`.

### Option: VPS

1. Copy this folder to the server.
2. `npm install --production`
3. Run with a process manager, e.g. `pm2 start server.js --name mcvault`
4. Put it behind a reverse proxy (nginx/Caddy) with HTTPS — Microsoft requires
   `https://` redirect URIs for anything other than `localhost`.

---

## 5. How the login flow works

1. User clicks "Add account" → redirected to Microsoft's real login page.
2. After login, Microsoft redirects back to `/api/auth/callback` with a code.
3. The server exchanges that code for tokens, then chains through:
   Microsoft → Xbox Live → XSTS → Minecraft Services.
4. The Minecraft profile (username, UUID, skin) is fetched and handed to the
   frontend, which then calls `/api/tiers/:username` to pull MCTiers data.
5. Everything is stored in the browser's `localStorage` — there's no database.
   Data is per-browser, not shared between visitors.

---

## 6. Notes / known limitations

- If a Microsoft account doesn't own Minecraft (Java edition), the login will
  fail with "That Microsoft account doesn't own Minecraft" — this is expected,
  Microsoft/Xbox returns a 404 for the profile lookup in that case.
- The MCTiers API endpoint used in `server.js` (`mctiers.com/api/profile/:uuid`)
  may change format over time — if tier badges show "—" for everyone, check
  the current MCTiers API and adjust the parsing in `server.js`'s
  `/api/tiers/:username` route.
- Since data lives in `localStorage`, clearing browser data or switching
  browsers/devices will lose the saved accounts.
