// Tile proxy for Tailwind Tally.
//
// Holds the MapTiler API key as a server-side environment variable and
// fetches tiles on the frontend's behalf, so the key never appears in
// any code that ships to a browser (unlike a static site, which cannot
// keep any client-side value secret - see the project discussion this
// service came out of).
//
// Only a fixed, allowlisted set of MapTiler styles can be requested
// through this proxy, and tile coordinates are validated as plain
// integers, so this can't be used as an open relay for arbitrary
// MapTiler API calls under cover of this server's key.

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const MAPTILER_KEY = process.env.MAPTILER_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const ALLOWED_STYLES = new Set(["dataviz", "dataviz-dark"]);
const COORD_RE = /^\d{1,3}$/;

if (!MAPTILER_KEY) {
  console.error("MAPTILER_KEY environment variable is not set - tile requests will fail with 500.");
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  next();
});

app.get("/", (req, res) => {
  res.type("text/plain").send("Tailwind Tally tile proxy is running.");
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

app.listen(PORT, () => {
  console.log("Tile proxy listening on port " + PORT);
});
