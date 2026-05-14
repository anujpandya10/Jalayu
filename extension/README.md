# Jalayu Companion (Chrome extension, v0)

This is a minimal **opt-in** logger: it sends only the **active tab hostname** (and optional duration later) to your deployed Jalayu app via `POST /api/extension/activity` with your **Supabase access token**.

## Load unpacked

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** and select this `extension/` folder.
3. Pin the extension, open the popup, enter your **production base URL** (e.g. `https://your-app.vercel.app`) and paste the **access_token** from your browser session (Application → Cookies → `sb-...-auth-token` → JWT payload `access_token`).
4. Check consent and tap **Log this tab**.

Tokens are sensitive — prefer a dedicated device profile or rotate keys after testing.

## Permissions

`activeTabs` + `host_permissions` allow the popup to read the current tab URL and call your API. Narrow `host_permissions` in `manifest.json` to your real origin before shipping to the Web Store.
