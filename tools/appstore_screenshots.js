// App Store screenshots of the live site, driven over the Chrome DevTools Protocol.
// node shots.js <port> <outDir> <date YYYY-MM-DD> <start HH:MM>
const fs = require("fs"), path = require("path");
const [, , port, outDir, rideDate, rideStart] = process.argv;
const gpx = fs.readFileSync("/Users/joeprous/Software/Wind/Miami.gpx", "utf8");
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const SIZES = [["6.5-inch-1242x2688", 414, 896], ["6.7-inch-1284x2778", 428, 926]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = {};
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(expr.slice(0, 80) + " -> " + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result.result.value;
  };
  const waitFor = async (expr, what, ms = 90000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await ev(expr)) return; await sleep(500); }
    throw new Error("timed out waiting for " + what);
  };
  const scrollTo = (selectorExpr, offset) => ev(`(function(){var e=${selectorExpr};var y=e.getBoundingClientRect().top+window.scrollY-${offset};window.scrollTo(0,y);return Math.round(y);})()`);
  const tilesSettled = async () => {
    await waitFor(`document.getElementById("mapStatusBadge").textContent==="Live tiles"`, "map tiles");
    await sleep(3500);
  };

  await send("Page.enable");
  for (const [name, w, h] of SIZES) {
    await send("Emulation.setUserAgentOverride", { userAgent: UA });
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 3, mobile: true });
    await send("Page.navigate", { url: "https://ubrowz.github.io/tailwind-tally/?shots=" + Date.now() });
    await sleep(1500);
    await waitFor(`document.readyState==="complete" && typeof window.loadGpxText==="function"`, "page load");
    const env = await ev(`({phone:/iPhone/.test(navigator.userAgent), report:document.getElementById("reportCard").hidden, how:document.getElementById("tabHow").hidden, lang:document.documentElement.lang})`);
    if (!env.phone || !env.report || !env.how) throw new Error("not in phone mode: " + JSON.stringify(env));
    await ev(`document.getElementById("langEn").click()`);
    await ev(`loadGpxText(${JSON.stringify(gpx)}, "Miami.gpx")`);
    await sleep(800);
    await ev(`(function(){document.getElementById("modeForecast").click();var d=document.getElementById("fcDate"),s=document.getElementById("fcStart");
      d.value=${JSON.stringify(rideDate)};d.dispatchEvent(new Event("change"));s.value=${JSON.stringify(rideStart)};s.dispatchEvent(new Event("change"));
      document.getElementById("fcGetBtn").click();})()`);
    await waitFor(`!document.getElementById("forecastNote").hidden`, "forecast");
    await sleep(1500);
    const note = await ev(`document.getElementById("forecastNoteText").textContent`);
    const dir = path.join(outDir, name); fs.mkdirSync(dir, { recursive: true });
    const shot = async (file) => {
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      fs.writeFileSync(path.join(dir, file), Buffer.from(r.result.data, "base64"));
      console.log(name, file);
    };
    // 1. Wind: the route map in tailwind/headwind colours
    await ev(`document.getElementById("tabWind").click()`); await sleep(1200);
    await scrollTo(`document.getElementById("routeCard")`, 16); await tilesSettled();
    await shot("01-route.png");
    // 2. Wind during the ride, touched at 45% so the readout and the map marker show
    await scrollTo(`document.getElementById("windRideChart")`, 16); await sleep(800);
    await ev(`(function(){var s=document.getElementById("windRideSvg"),r=s.getBoundingClientRect();
      s.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.left+64+(r.width-76)*0.45,clientY:r.top+30,bubbles:true,pointerType:"touch"}));})()`);
    await tilesSettled();
    await shot("02-wind-during-ride.png");
    await ev(`(function(){var s=document.getElementById("windRideSvg");s.dispatchEvent(new PointerEvent("pointerleave",{pointerType:"mouse"}));})()`);
    // 3. Temperature: the route in feels-like colours and its legend
    await ev(`document.getElementById("tabTemp").click()`); await sleep(1500);
    await scrollTo(`document.getElementById("routeCard")`, 16); await tilesSettled();
    await shot("03-temperature.png");
    // 4. Rain: summary and the rain chart
    await ev(`document.getElementById("tabRain").click()`); await sleep(1500);
    await scrollTo(`document.getElementById("panelRain")`, 16); await sleep(1500);
    await shot("04-rain.png");
    // 5. Wind-direction sweep
    await ev(`document.getElementById("tabWind").click()`); await sleep(1500);
    await scrollTo(`document.getElementById("polarSvg").closest(".card")`, 16); await sleep(1500);
    await shot("05-sweep.png");
    console.log("forecast note:", note);
  }
  ws.close();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
