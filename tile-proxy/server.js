// Tile proxy + Strava import backend for Tailwind Tally.
//
// Holds secrets as server-side environment variables and does the parts
// of each flow that need them, so the secrets never appear in any code
// that ships to a browser (unlike a static site, which cannot keep any
// client-side value secret - see the project discussions these came out
// of). Two unrelated jobs share this one small service:
//
//   - Map tiles: proxies MapTiler tile requests, holding MAPTILER_KEY.
//   - Strava import: exchanges an OAuth code for an access token (needs
//     STRAVA_CLIENT_SECRET), then proxies the route-list and GPX-export
//     calls too, purely because Strava's API doesn't send CORS headers -
//     the access token itself is the visitor's own, not a secret this
//     server needs to protect once issued.

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const MAPTILER_KEY = process.env.MAPTILER_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const ALLOWED_STYLES = new Set(["dataviz", "dataviz-dark"]);
// x/y tile indices can run up to 2^zoom - 1 per axis (e.g. 4095 at zoom 12,
// over a million at zoom 20), so this needs far more than 3 digits of
// headroom - it's a sanity bound against garbage input, not a real limit.
const COORD_RE = /^\d{1,8}$/;

// Strava's Client ID is public (it's meant to ship in the frontend, same
// as this app's name); only the secret matters here.
const STRAVA_CLIENT_ID = "280279";
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const ID_RE = /^\d+$/;

if (!MAPTILER_KEY) {
  console.error("MAPTILER_KEY environment variable is not set - tile requests will fail with 500.");
}
if (!STRAVA_CLIENT_SECRET) {
  console.error("STRAVA_CLIENT_SECRET environment variable is not set - Strava import will fail with 500.");
}

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/", (req, res) => {
  res.type("text/plain").send("Tailwind Tally backend is running.");
});

app.get("/tiles/:style/:z/:x/:y.png", async (req, res) => {
  const { style, z, x, y } = req.params;

  if (!ALLOWED_STYLES.has(style)) {
    res.status(400).type("text/plain").send("Unknown style: " + style);
    return;
  }
  if (![z, x, y].every((v) => COORD_RE.test(v))) {
    res.status(400).type("text/plain").send("Invalid tile coordinates.");
    return;
  }
  if (!MAPTILER_KEY) {
    res.status(500).type("text/plain").send("Server is not configured with a MapTiler key.");
    return;
  }

  const upstreamUrl =
    "https://api.maptiler.com/maps/" + style + "/" + z + "/" + x + "/" + y + ".png?key=" + MAPTILER_KEY;

  try {
    const upstream = await fetch(upstreamUrl);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch (err) {
    res.status(502).type("text/plain").send("Could not reach the map tile provider.");
  }
});

// Step 1 of the Strava OAuth flow that has to happen server-side: trade a
// one-time authorization code for an access token. Returns just enough
// of Strava's response (the token, plus the athlete's id/name for the
// UI) - no refresh_token, since nothing here is persisted; a fresh
// connection just repeats this exchange.
app.post("/strava/token", async (req, res) => {
  const code = req.body && req.body.code;
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing authorization code." });
    return;
  }
  if (!STRAVA_CLIENT_SECRET) {
    res.status(500).json({ error: "Server is not configured with a Strava client secret." });
    return;
  }

  try {
    const upstream = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code"
      })
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data && data.message) || "Strava rejected that code." });
      return;
    }
    res.json({
      access_token: data.access_token,
      athlete: data.athlete
        ? { id: data.athlete.id, firstname: data.athlete.firstname, lastname: data.athlete.lastname }
        : null
    });
  } catch (err) {
    res.status(502).json({ error: "Could not reach Strava." });
  }
});

// Lists the connected athlete's routes. Requires the access_token from
// the exchange above, plus the athlete_id it returned.
app.get("/strava/routes", async (req, res) => {
  const accessToken = req.query.access_token;
  const athleteId = req.query.athlete_id;
  if (!accessToken || typeof accessToken !== "string") {
    res.status(400).json({ error: "Missing access_token." });
    return;
  }
  if (!athleteId || !ID_RE.test(String(athleteId))) {
    res.status(400).json({ error: "Missing or invalid athlete_id." });
    return;
  }

  try {
    const upstream = await fetch(
      "https://www.strava.com/api/v3/athletes/" + athleteId + "/routes?page=1&per_page=50",
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data && data.message) || "Strava rejected that request." });
      return;
    }
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "Could not reach Strava." });
  }
});

// Exports one route as GPX, forwarded through as-is.
app.get("/strava/routes/:id/gpx", async (req, res) => {
  const accessToken = req.query.access_token;
  const routeId = req.params.id;
  if (!accessToken || typeof accessToken !== "string") {
    res.status(400).type("text/plain").send("Missing access_token.");
    return;
  }
  if (!ID_RE.test(routeId)) {
    res.status(400).type("text/plain").send("Invalid route id.");
    return;
  }

  try {
    const upstream = await fetch(
      "https://www.strava.com/api/v3/routes/" + routeId + "/export_gpx",
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    if (!upstream.ok) {
      res.status(upstream.status).type("text/plain").send("Strava rejected that request.");
      return;
    }
    const text = await upstream.text();
    res.type("application/gpx+xml").send(text);
  } catch (err) {
    res.status(502).type("text/plain").send("Could not reach Strava.");
  }
});

app.listen(PORT, () => {
  console.log("Tailwind Tally backend listening on port " + PORT);
});
