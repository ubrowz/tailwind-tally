# Tailwind Tally tile proxy

Holds the MapTiler API key server-side and serves map tiles on behalf of the
Tailwind Tally frontend, so the key never ships to a browser. See
`server.js` for the one route this exposes.

## Deploy on Render

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In Render: **New > Web Service**, connect this repo.
3. **Root Directory**: `tile-proxy`
4. **Build Command**: `npm install`
5. **Start Command**: `npm start`
6. **Environment**: add `MAPTILER_KEY` (your real key) and `ALLOWED_ORIGIN`
   (the origin your frontend will be served from, e.g.
   `https://yourusername.github.io` - use `*` if you're not sure yet and
   want to tighten it later).
7. Deploy. Render gives you a URL like `https://tailwind-tally-tiles.onrender.com`.

Render's free tier spins a service down after inactivity - the first
request after a while can take 30-60 seconds while it wakes back up.
That's expected, not a bug.

## Local testing

```
cd tile-proxy
npm install
cp .env.example .env   # then edit .env with your real key
node -r dotenv/config server.js   # or: export $(cat .env | xargs) && node server.js
curl -I http://localhost:3000/tiles/dataviz/10/500/300.png
```

## Endpoint

`GET /tiles/:style/:z/:x/:y.png` - `style` is `dataviz` or `dataviz-dark`
only; `z`, `x`, `y` must be plain integers. Anything else is rejected
before it ever reaches MapTiler, so this can't be used as an open relay
for arbitrary MapTiler requests under cover of this server's key.
