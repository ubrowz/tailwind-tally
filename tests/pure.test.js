// Unit tests for the pure calculation code in index.html (forecast timing, wind and
// temperature along the ride, wind chill, apparent temperature, heat index, colour
// classes). Run with:  node tests/pure.test.js
// The functions are cut out of index.html between the "BEGIN/END forecast-pure" and
// "BEGIN/END chill-pure" markers and run as they are: nothing is copied or mocked.
const fs = require("fs"), assert = require("assert");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const grab = (name) => { const r = new RegExp("// BEGIN " + name + "([\\s\\S]*?)// END " + name).exec(src); assert(r, name + " markers not found"); return r[1]; };
const { kmhToBeaufort, forecastSamplePoints, summarizeForecast, segmentClock, forecastWindSeries, lerpAngleDeg, interpWindSeries, windAtPlace, segmentWind, rideWindSummary, forecastSamplePlan, forecastMinutes, addDaysToDateStr, rideMinutes, cumulativeMeters, forecastSeries, interpSeries, valueAtPlace, segmentEnvironment, rideEnvSummary, windChillC, apparentTempC, feelsLikeC, feelsStats, feelsClasses, FEELS_CLASS_EDGES, heatDeltaC, heatIndexRothfuszF, WIND_CHILL_OFFICIAL_MAX_C, WIND_CHILL_MIN_KMH } =
  new Function(grab("forecast-pure") + grab("chill-pure") +
    "; return { kmhToBeaufort, forecastSamplePoints, summarizeForecast, segmentClock, forecastWindSeries, lerpAngleDeg, interpWindSeries, windAtPlace, segmentWind, rideWindSummary, forecastSamplePlan, forecastMinutes, addDaysToDateStr, rideMinutes, cumulativeMeters, forecastSeries, interpSeries, valueAtPlace, segmentEnvironment, rideEnvSummary, windChillC, apparentTempC, feelsLikeC, feelsStats, feelsClasses, FEELS_CLASS_EDGES, heatDeltaC, heatIndexRothfuszF, WIND_CHILL_OFFICIAL_MAX_C, WIND_CHILL_MIN_KMH };")();

let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const day = "2026-09-20";
const mk = (speeds, dirs, gusts) => ({ hourly: {
  time: speeds.map((_, i) => `${day}T${String(i).padStart(2, "0")}:00`),
  wind_speed_10m: speeds, wind_direction_10m: dirs, wind_gusts_10m: gusts || speeds } });
const flat = (v) => Array(24).fill(v);

t("Beaufort edges", () => {
  [[0,0],[0.9,0],[1,1],[5.9,1],[6,2],[11.9,2],[12,3],[19.9,3],[20,4],[28.9,4],[29,5],[38.9,5],
   [39,6],[49.9,6],[50,7],[61.9,7],[62,8],[74.9,8],[75,9],[88.9,9],[89,10],[102.9,10],[103,11],[117.9,11],[118,12],[300,12]]
   .forEach(([k, b]) => assert.strictEqual(kmhToBeaufort(k), b, `${k} km/h`));
});
t("Beaufort agrees with the app's own table midpoints", () => {
  const mid = [0, 3, 8.5, 15.5, 24, 33.5, 44, 55.5, 68, 81.5, 95.5, 110, 120];
  mid.forEach((k, b) => assert.strictEqual(kmhToBeaufort(k), b));
});
t("window 10:00-14:00 takes hours 10..13", () => {
  const speeds = flat(0).map((_, i) => i);            // speed == hour
  const r = summarizeForecast([mk(speeds, flat(90))], day, 600, 840);
  assert.strictEqual(r.hourCount, 4);
  assert.strictEqual(r.speedKmh, (10 + 11 + 12 + 13) / 4);
});
t("partial hours count (10:30-13:15 -> 10..13)", () => {
  const r = summarizeForecast([mk(flat(20), flat(90))], day, 630, 795);
  assert.strictEqual(r.hourCount, 4);
});
t("window inside one hour still yields that hour", () => {
  const r = summarizeForecast([mk(flat(20), flat(90))], day, 610, 640);
  assert.strictEqual(r.hourCount, 1);
});
t("circular mean: 350 and 10 average to north, not south", () => {
  const dirs = flat(0); dirs[10] = 350; dirs[11] = 10;
  const r = summarizeForecast([mk(flat(20), dirs)], day, 600, 720);
  assert(r.dirFromDeg < 1 || r.dirFromDeg > 359, "got " + r.dirFromDeg);
});
t("direction is speed-weighted", () => {
  const speeds = flat(0), dirs = flat(0); speeds[10] = 30; dirs[10] = 90; speeds[11] = 10; dirs[11] = 270;
  const r = summarizeForecast([mk(speeds, dirs)], day, 600, 720);
  assert(Math.abs(r.dirFromDeg - 90) < 1e-6, "got " + r.dirFromDeg);
  assert.strictEqual(r.speedKmh, 20);                  // plain mean, not the shrunken vector mean (10)
});
t("gust is the max over the window only", () => {
  const g = flat(5); g[11] = 42; g[20] = 99;
  assert.strictEqual(summarizeForecast([mk(flat(20), flat(90), g)], day, 600, 720).gustKmh, 42);
});
t("null hours are skipped; all-null gives null", () => {
  const s = flat(20); s[10] = null;
  assert.strictEqual(summarizeForecast([mk(s, flat(90))], day, 600, 720).hourCount, 1);
  assert.strictEqual(summarizeForecast([mk(flat(null), flat(90))], day, 600, 720), null);
});
t("other dates are ignored", () => {
  assert.strictEqual(summarizeForecast([mk(flat(20), flat(90))], "2026-09-21", 600, 720), null);
});
t("dead calm: direction null, speed ~0", () => {
  const r = summarizeForecast([mk(flat(0.2), flat(180))], day, 600, 720);
  assert.strictEqual(r.dirFromDeg, null); assert.strictEqual(kmhToBeaufort(r.speedKmh), 0);
});
t("several locations pool their samples", () => {
  const r = summarizeForecast([mk(flat(10), flat(0)), mk(flat(30), flat(0))], day, 600, 720);
  assert.strictEqual(r.placeCount, 2); assert.strictEqual(r.speedKmh, 20);
});
t("sample points: rounded, deduped when a loop closes", () => {
  const loop = [[51.4173, 5.5117], [51.3, 5.9], [51.42, 5.51]];   // start ~ end
  const p = forecastSamplePoints(loop);
  assert.deepStrictEqual(p, [{ lat: 51.4, lon: 5.5 }, { lat: 51.3, lon: 5.9 }]);
});
t("sample points: two-point route", () => {
  assert.strictEqual(forecastSamplePoints([[0, 0], [10, 10]]).length, 2);
});

// ---- temperature in the forecast summary
t("forecast temperature: plain mean over window hours, nulls skipped", () => {
  const loc = mk(flat(10), flat(90)); loc.hourly.temperature_2m = flat(0).map((_, i) => i); loc.hourly.temperature_2m[11] = null;
  const r = summarizeForecast([loc], day, 600, 840);          // hours 10..13, 11 is null
  assert.strictEqual(r.tempC, (10 + 12 + 13) / 3);
});
t("forecast temperature: absent -> null", () => {
  assert.strictEqual(summarizeForecast([mk(flat(10), flat(90))], day, 600, 840).tempC, null);
});

// ---- wind chill
// NWS's own formula (F / mph), coefficients from weather.gov/safety/cold-wind-chill-chart,
// valid at <= 50 F and > 3 mph. Independent of the C / km/h form used in the app.
const nwsF = (tF, mph) => 35.74 + 0.6215 * tF - 35.75 * Math.pow(mph, 0.16) + 0.4275 * tF * Math.pow(mph, 0.16);
const cToF = (c) => c * 9 / 5 + 32, fToC = (f) => (f - 32) * 5 / 9, kmhToMph = (k) => k / 1.609344;
t("wind chill reproduces NWS's published example (0 F, 15 mph -> -19 F)", () => {
  const f = cToF(windChillC(fToC(0), 15 * 1.609344));
  assert.strictEqual(Math.round(f), -19, "got " + f);
});
t("wind chill agrees with NWS's F/mph formula across a grid", () => {
  let worst = 0, cases = 0;
  for (let tC = -40; tC <= 10; tC += 2.5) for (let kmh = 6; kmh <= 70; kmh += 4) {
    const mine = cToF(windChillC(tC, kmh));
    const ref = nwsF(cToF(tC), kmhToMph(kmh));
    worst = Math.max(worst, Math.abs(mine - ref)); cases++;
  }
  assert(worst < 0.4, "worst disagreement " + worst.toFixed(3) + " F over " + cases + " cases");
});
t("thresholds match NWS's validity range (50 F ~ 10 C, 3 mph ~ 4.8 km/h)", () => {
  assert.strictEqual(WIND_CHILL_OFFICIAL_MAX_C, 10);
  assert(Math.abs(3 * 1.609344 - WIND_CHILL_MIN_KMH) < 0.05);
});
t("wind chill: colder or faster never feels warmer", () => {
  assert(windChillC(-5, 30) < windChillC(-5, 20));
  assert(windChillC(-10, 25) < windChillC(-5, 25));
});
t("wind chill: no effect at/below 4.8 km/h", () => {
  assert.strictEqual(windChillC(-5, 4.8), -5);
  assert.strictEqual(windChillC(-5, 0), -5);
  assert.strictEqual(windChillC(15, 3), 15);
});

// ---- the extension above 10 C (option A)
t("no jump at the 10 C edge, for any airspeed", () => {
  for (const V of [6, 12, 20, 30, 45, 70, 100]) {
    const below = windChillC(10, V), above = windChillC(10.0001, V);
    assert(Math.abs(below - above) < 0.001, `V=${V}: ${below} vs ${above}`);
    assert(windChillC(10, V) < 10, "still cools at exactly 10 C, as the official formula says");
  }
});
t("continuous everywhere: no step between neighbouring temperatures", () => {
  let worst = 0;
  for (const V of [6, 20, 35, 60, 100]) for (let T = -40; T < 45; T += 0.01) {
    worst = Math.max(worst, Math.abs(windChillC(T + 0.01, V) - windChillC(T, V)));
  }
  assert(worst < 0.02, "largest step per 0.01 C: " + worst);      // slope <= ~1.4 => 0.014 expected
});
t("never feels WARMER than the air, at any temperature or airspeed", () => {
  for (const V of [5, 6, 15, 30, 60, 100]) for (let T = -50; T <= 60; T += 0.5) {
    assert(windChillC(T, V) <= T + 1e-12, `T=${T} V=${V}`);
  }
});
t("above 10 C the cooling only ever shrinks as it gets warmer", () => {
  for (const V of [6, 15, 25, 35, 45, 100]) {
    let prev = Infinity;
    for (let T = 10; T <= 40; T += 0.25) {
      const cooling = T - windChillC(T, V);
      assert(cooling <= prev + 1e-12, `V=${V} T=${T}`);
      prev = cooling;
    }
  }
});
t("cooling fades to zero by ~19-23 C and stays zero (matches the proposal's numbers)", () => {
  const zeroAt = (V) => { let T = 10; while (T - windChillC(T, V) > 1e-9 && T < 60) T += 0.01; return T; };
  assert(Math.abs(zeroAt(15) - 19.0) < 0.1, "V=15 " + zeroAt(15));
  assert(Math.abs(zeroAt(25) - 20.7) < 0.1, "V=25 " + zeroAt(25));
  assert(Math.abs(zeroAt(35) - 21.6) < 0.1, "V=35 " + zeroAt(35));
  assert(Math.abs(zeroAt(45) - 22.2) < 0.1, "V=45 " + zeroAt(45));
  for (const V of [6, 25, 60, 100]) assert.strictEqual(windChillC(25, V), 25);
});
t("spot values from the proposal table (feels-like minus air)", () => {
  const cool = (T, V) => (windChillC(T, V) - T);
  assert(Math.abs(cool(15, 25) - (-1.6)) < 0.06, String(cool(15, 25)));
  assert(Math.abs(cool(10, 25) - (-3.1)) < 0.06, String(cool(10, 25)));
  assert(Math.abs(cool(20, 45) - (-0.8)) < 0.06, String(cool(20, 45)));
});

const L = Array(40).fill(25);                                    // 40 segments of 25 m = 1 km
const ms = (kmh) => kmh / 3.6;
// ---- heat index
// Independent copy of the published NWS algorithm (wpc.ncep.noaa.gov/html/heatindex_equation.shtml), T in F.
const nwsSimple = (T, RH) => 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + RH * 0.094);
const nwsRoth = (T, RH) => {
  let hi = -42.379 + 2.04901523*T + 10.14333127*RH - .22475541*T*RH - .00683783*T*T - .05481717*RH*RH
         + .00122874*T*T*RH + .00085282*T*RH*RH - .00000199*T*T*RH*RH;
  if (RH < 13 && T >= 80 && T <= 112) hi -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  if (RH > 85 && T >= 80 && T <= 87) hi += ((RH - 85) / 10) * ((87 - T) / 5);
  return hi;
};
const nwsHI = (T, RH) => ((nwsSimple(T, RH) + T) / 2 >= 80 ? nwsRoth(T, RH) : nwsSimple(T, RH));
t("regression agrees with NWS chart values (within 1 F)", () => {
  for (const [tF, rh, chart] of [[80,40,80],[80,60,82],[90,50,95],[90,70,105],[100,40,109],[100,50,118],[110,40,136]])
    assert(Math.abs(heatIndexRothfuszF(tF, rh) - chart) <= 1, `${tF}F ${rh}%: ${heatIndexRothfuszF(tF, rh)} vs ${chart}`);
});
t("heat: nothing at or below 22 C, whatever the humidity", () => {
  for (const rh of [0, 30, 60, 100]) for (const tc of [-10, 0, 15, 22]) assert.strictEqual(heatDeltaC(tc, rh), 0);
});
t("heat: exactly the published NWS value from 29 C up to the chart's top (43 C)", () => {
  let worst = 0;
  for (let rh = 0; rh <= 100; rh += 5) for (let tc = 29; tc <= 43; tc += 0.25) {
    const official = ((nwsHI(tc * 9 / 5 + 32, rh) - 32) * 5 / 9) - tc;
    worst = Math.max(worst, Math.abs(heatDeltaC(tc, rh) - official));
  }
  assert(worst < 1e-9, "worst |diff| " + worst);
});
t("heat: no step anywhere (published algorithm has ~1 C steps at 80 F; ours must not)", () => {
  // Steepest legitimate slope is the regression's own at its hot, humid corner (~11 C per C). A 1 C step
  // over a 0.01 C scan would read as ~100 C per C.
  let worst = 0, at = "";
  const rhs = []; for (let rh = 0; rh <= 100; rh += 5) rhs.push(rh); rhs.push(12.9, 13, 13.1, 84.9, 85, 85.1, 99.9);
  for (const rh of rhs) for (let tc = 10; tc < 50; tc += 0.01) {
    const sl = Math.abs(heatDeltaC(tc + 0.01, rh) - heatDeltaC(tc, rh)) / 0.01;
    if (sl > worst) { worst = sl; at = `T=${tc.toFixed(2)} RH=${rh}`; }
  }
  assert(worst < 12, `steepest slope ${worst.toFixed(1)} C/C at ${at}`);
});
t("published algorithm DOES step at its switch (this is what we are avoiding)", () => {
  let worst = 0;
  for (const rh of [70, 80, 90, 95]) for (let tc = 24; tc < 29; tc += 0.01)
    worst = Math.max(worst, Math.abs(((nwsHI((tc + 0.01) * 9 / 5 + 32, rh) - nwsHI(tc * 9 / 5 + 32, rh)) * 5 / 9)));
  assert(worst > 0.5, "expected the published algorithm to jump > 0.5 C, got " + worst);
});
t("heat: humid air feels hotter, and more so the more humid; dry heat feels a little cooler", () => {
  assert(heatDeltaC(32, 80) > heatDeltaC(32, 60) && heatDeltaC(32, 60) > heatDeltaC(32, 40));
  assert(heatDeltaC(32, 90) > 5);
  assert(heatDeltaC(35, 20) < 0, "very dry heat cools by evaporation");
});
t("heat: hotter air always feels hotter overall (T + delta rises with T)", () => {
  for (const rh of [30, 60, 90]) {
    let prev = -Infinity;
    for (let tc = 22; tc <= 43; tc += 0.1) { const f = tc + heatDeltaC(tc, rh); assert(f >= prev - 1e-9, `RH${rh} T${tc}`); prev = f; }
  }
});
t("heat: inputs are clamped (humidity outside 0-100, air above the chart) instead of exploding", () => {
  assert.strictEqual(heatDeltaC(35, 150), heatDeltaC(35, 100));
  assert.strictEqual(heatDeltaC(35, -20), heatDeltaC(35, 0));
  assert(isFinite(heatDeltaC(60, 100)) && heatDeltaC(60, 100) === heatDeltaC(43.3, 100));
});
t("forecast humidity: plain mean over window hours, null when absent", () => {
  const loc = mk(flat(10), flat(90)); loc.hourly.relative_humidity_2m = flat(0).map((_, i) => i * 2);
  assert.strictEqual(summarizeForecast([loc], day, 600, 840).rhPercent, (20 + 22 + 24 + 26) / 4);
  assert.strictEqual(summarizeForecast([mk(flat(10), flat(90))], day, 600, 840).rhPercent, null);
});

// ---- apparent temperature and the blended feels-like
t("apparent temperature: hand-computed value (20 C, 50%, calm)", () => {
  // e = 0.5 * 6.105 * exp(17.27*20/257.7) = 11.660 hPa;  AT = 20 + 0.33*11.660 - 0 - 4.0
  assert(Math.abs(apparentTempC(20, 50, 0) - 19.848) < 0.005, String(apparentTempC(20, 50, 0)));
});
t("apparent temperature: wind term is exactly 0.7 C per m/s", () => {
  const d = apparentTempC(25, 60, 0) - apparentTempC(25, 60, 18);          // 18 km/h = 5 m/s
  assert(Math.abs(d - 3.5) < 1e-9, String(d));
});
t("apparent temperature: humid feels hotter than dry, same air and wind", () => {
  assert(apparentTempC(30, 90, 20) > apparentTempC(30, 50, 20) && apparentTempC(30, 50, 20) > apparentTempC(30, 10, 20));
});
t("feels-like IS the official wind chill at and below 10 C, whatever the humidity", () => {
  for (const T of [-30, -10, 0, 5, 10]) for (const V of [6, 25, 45]) for (const RH of [0, 50, 100])
    assert.strictEqual(feelsLikeC(T, RH, V), windChillC(T, V));
});
t("feels-like IS the apparent temperature from 20 C up", () => {
  for (const T of [20, 25, 32, 40]) for (const V of [0, 10, 25, 45]) for (const RH of [10, 60, 95])
    assert.strictEqual(feelsLikeC(T, RH, V), apparentTempC(T, RH, V));
});
t("feels-like has no jump anywhere (blend between the two models)", () => {
  let worst = 0, at = "";
  for (const V of [6, 15, 25, 40, 60]) for (const RH of [10, 50, 90]) for (let T = -40; T < 45; T += 0.01) {
    const sl = Math.abs(feelsLikeC(T + 0.01, RH, V) - feelsLikeC(T, RH, V)) / 0.01;
    if (sl > worst) { worst = sl; at = `T=${T.toFixed(2)} V=${V} RH=${RH}`; }
  }
  assert(worst < 4, `steepest slope ${worst.toFixed(2)} C/C at ${at}`);       // a 1 C step over 0.01 C would read ~100
});
const worstDrop = (RH, V) => { let w = 0;   // largest fall in feels-like as the air gets warmer, blend zone included
  for (let T0 = 8; T0 < 24; T0 += 0.1) for (let T1 = T0 + 0.1; T1 <= 24; T1 += 0.1) w = Math.max(w, feelsLikeC(T0, RH, V) - feelsLikeC(T1, RH, V));
  return w; };
t("warmer air always feels warmer up to 25 km/h of airspeed, at any humidity", () => {
  for (const V of [6, 15, 25]) for (const RH of [0, 20, 50, 100]) {
    let prev = -Infinity;
    for (let T = -40; T <= 45; T += 0.05) { const f = feelsLikeC(T, RH, V); assert(f >= prev - 1e-9, `V=${V} RH=${RH} T=${T.toFixed(2)}`); prev = f; }
  }
});
t("known limit: at 40 km/h airspeed the blend can dip, but by under 1 C, and not at all in humid air", () => {
  for (const RH of [0, 20, 40, 60, 80, 100]) assert(worstDrop(RH, 40) < 1, `RH=${RH}: ${worstDrop(RH, 40)}`);
  for (const RH of [40, 60, 80, 100]) assert(worstDrop(RH, 40) < 1e-9, `RH=${RH}`);
});
t("known limit: the worst case is bone-dry air at 60 km/h in the 10-20 C zone (about 3 C), and stays bounded", () => {
  assert(worstDrop(0, 60) > 1 && worstDrop(0, 60) < 3.5, String(worstDrop(0, 60)));
});
t("faster airspeed always feels cooler (above the 4.8 km/h floor)", () => {
  for (const T of [-15, 0, 10, 15, 20, 30, 38]) for (const RH of [20, 60, 95]) {
    let prev = Infinity;
    for (let V = 6; V <= 80; V += 2) { const f = feelsLikeC(T, RH, V); assert(f <= prev + 1e-9, `T=${T} RH=${RH} V=${V}`); prev = f; }
  }
});
t("riding speed matters in the heat: 30 C, 60% humid feels cooler at 25 km/h than at 10 km/h", () => {
  assert(feelsLikeC(30, 60, 25) < feelsLikeC(30, 60, 10) - 2);
});
t("at riding speed it feels cooler than the NWS still-air heat index (wind helps in the heat)", () => {
  for (const [T, RH] of [[30, 70], [33, 60], [35, 80]])
    assert(feelsLikeC(T, RH, 25) < T + heatDeltaC(T, RH), `${T}C ${RH}%`);
});

t("feels stats: no wind -> the same everywhere, so avg == coldest == warmest", () => {
  for (const T of [0, 15, 30]) {
    const r = feelsStats(L, Array(40).fill(0), ms(25), 0, T, 50);
    assert(Math.abs(r.avgFeelsC - feelsLikeC(T, 50, 25)) < 1e-9);
    assert(Math.abs(r.coldestFeelsC - r.avgFeelsC) < 1e-9 && Math.abs(r.warmestFeelsC - r.avgFeelsC) < 1e-9);
  }
});
t("feels stats: a headwind stretch feels colder than a tailwind one, cold day AND hot day", () => {
  for (const T of [0, 15, 32]) {
    const head = feelsStats(L, Array(40).fill(-1), ms(25), ms(20), T, 60);   // cosphi -1 = headwind
    const tail = feelsStats(L, Array(40).fill(1), ms(25), ms(20), T, 60);
    assert(head.avgFeelsC < tail.avgFeelsC, `T=${T}`);
    assert(Math.abs(head.avgFeelsC - feelsLikeC(T, 60, 45)) < 1e-9);         // 25 + 20 km/h
    assert(Math.abs(tail.avgFeelsC - feelsLikeC(T, 60, 5)) < 1e-9);          // 25 - 20 km/h
  }
});
t("feels stats: coldest / warmest tenth = mean of the coldest / warmest 10% of distance", () => {
  const cos = Array(40).fill(0); for (let i = 0; i < 4; i++) cos[i] = -1; for (let i = 36; i < 40; i++) cos[i] = 1;   // 10% each end
  const r = feelsStats(L, cos, ms(25), ms(20), 30, 60);
  assert(Math.abs(r.coldestFeelsC - feelsLikeC(30, 60, 45)) < 1e-9);
  assert(Math.abs(r.warmestFeelsC - feelsLikeC(30, 60, 5)) < 1e-9);
  assert(r.coldestFeelsC < r.avgFeelsC && r.avgFeelsC < r.warmestFeelsC);
});
t("feels stats: a single backwards GPS blip does not set the headline", () => {
  const cos = Array(40).fill(1); cos[7] = -1;                               // 1 of 40 = 2.5% of distance
  const r = feelsStats(L, cos, ms(25), ms(20), 0, 50);
  assert(r.coldestFeelsC > feelsLikeC(0, 50, 45) + 0.5, "coldest tenth should dilute one bad segment");
});
t("feels stats: one value per segment; empty route does not crash", () => {
  assert.strictEqual(feelsStats(L, Array(40).fill(1), ms(25), ms(20), 5, 50).perSeg.length, 40);
  const e = feelsStats([], [], ms(25), ms(10), 3, 50);
  assert(e.avgFeelsC === 3 && e.avgAirC === 3 && e.perSeg.length === 0 && e.airSeg.length === 0);
});

// ---- colour classes for the map
t("classes: 9 edges -> 10 contiguous classes, index 5 is the neutral one around 0", () => {
  const c = feelsClasses([0], [25], 0).classes;
  assert.strictEqual(FEELS_CLASS_EDGES.length, 9); assert.strictEqual(c.length, 10);
  for (let k = 0; k < 9; k++) assert.strictEqual(c[k].hiC, c[k + 1].loC);
  assert.strictEqual(c[5].loC, -1); assert.strictEqual(c[5].hiC, 1);
});
t("classes: known deltas land in the right class (edges belong to the class above)", () => {
  const cases = [[-13, 0], [-12, 1], [-9, 1], [-8, 2], [-5, 3], [-3, 4], [-1.01, 4], [-1, 5], [0, 5], [0.99, 5], [1, 6], [3, 7], [5, 8], [7.9, 8], [8, 9], [30, 9]];
  for (const [d, k] of cases) assert.strictEqual(feelsClasses([20 + d], [25], 20).cls[0], k, `delta ${d}`);
});
t("classes: depend only on feels-like MINUS air temperature (same colour means the same on any day)", () => {
  const per = [-9, -4, -0.3, 2, 6];
  assert.deepStrictEqual(feelsClasses(per.map(v => v + 30), L.slice(0, 5), 30).cls, feelsClasses(per.map(v => v - 12), L.slice(0, 5), -12).cls);
});
t("classes: distances add up to the route and colder never lands in a milder class", () => {
  const per = Array.from({ length: 40 }, (_, i) => -14 + i * 0.6);
  const r = feelsClasses(per, L, 0);
  assert(Math.abs(r.classes.reduce((a, c) => a + c.dist, 0) - 1000) < 1e-9);
  for (let i = 1; i < 40; i++) assert(r.cls[i] >= r.cls[i - 1]);
});
t("classes: 25 C and 26 C sit next to each other on the scale (no blue-to-red flip)", () => {
  // The bug this replaces: a hue switch between neighbouring temperatures. Now colour follows a smooth number.
  for (const V of [10, 25, 40]) {
    const k25 = feelsClasses([feelsLikeC(25, 50, V)], [25], 25).cls[0], k26 = feelsClasses([feelsLikeC(26, 50, V)], [25], 26).cls[0];
    assert(Math.abs(k25 - k26) <= 1, `V=${V}: class ${k25} at 25 C vs ${k26} at 26 C`);
  }
});

// ---- the ride follows the clock
t("forecastMinutes: same day, next day, and a month boundary", () => {
  assert.strictEqual(forecastMinutes("2026-09-20T10:00", "2026-09-20"), 600);
  assert.strictEqual(forecastMinutes("2026-09-21T01:30", "2026-09-20"), 1440 + 90);
  assert.strictEqual(forecastMinutes("2026-10-01T00:00", "2026-09-30"), 1440);
  assert.strictEqual(addDaysToDateStr("2026-09-30", 1), "2026-10-01");
  assert.strictEqual(addDaysToDateStr("2026-12-31", 1), "2027-01-01");
});
t("rideMinutes: 25 km at 25 km/h is 60 min; slower takes longer", () => {
  assert(Math.abs(rideMinutes(25000, 25) - 60) < 1e-9); assert(Math.abs(rideMinutes(25000, 20) - 75) < 1e-9);
});
t("summarizeForecast: a ride that crosses midnight uses the next day's hours too", () => {
  const two = { hourly: { time: [], wind_speed_10m: [], wind_direction_10m: [], wind_gusts_10m: [], temperature_2m: [] } };
  for (let h = 0; h < 48; h++) {
    const d = h < 24 ? "2026-09-20" : "2026-09-21";
    two.hourly.time.push(`${d}T${String(h % 24).padStart(2, "0")}:00`);
    two.hourly.wind_speed_10m.push(h < 24 ? 10 : 30); two.hourly.wind_direction_10m.push(90);
    two.hourly.wind_gusts_10m.push(0); two.hourly.temperature_2m.push(h);
  }
  const r = summarizeForecast([two], "2026-09-20", 23 * 60, 25 * 60);            // 23:00 to 01:00 next day
  assert.strictEqual(r.hourCount, 2); assert.strictEqual(r.speedKmh, 20);          // hours 23 (10) and 24 (30)
});
t("forecast sample plan: unique places + where along the route each sample sits", () => {
  // three points ~0.11 deg apart on a meridian: fractions 0, 0.5, 1 by distance
  const route = [[51.0, 5.0], [51.1, 5.0], [51.2, 5.0]];
  const p = forecastSamplePlan(route);
  assert.strictEqual(p.unique.length, 3);
  assert.deepStrictEqual(p.samples.map((x) => Math.round(x.frac * 1000) / 1000), [0, 0.5, 1]);
});
t("forecast sample plan: a loop keeps its start place at BOTH ends (fraction 0 and 1, one unique place)", () => {
  const loop = [[51.4173, 5.5117], [51.3, 5.9], [51.42, 5.51]];
  const p = forecastSamplePlan(loop);
  assert.strictEqual(p.unique.length, 2); assert.strictEqual(p.samples.length, 3);
  assert.strictEqual(p.samples[0].unique, p.samples[2].unique); assert(Math.abs(p.samples[2].frac - 1) < 1e-9);
});
t("cumulative metres: 0.1 deg of latitude is about 11.1 km", () => {
  const c = cumulativeMeters([[51.0, 5.0], [51.1, 5.0]]);
  assert(Math.abs(c[1] - 11119) < 30, String(c[1]));
});
t("interpSeries: linear between hours, held outside, missing hours skipped", () => {
  const ser = { t: [600, 660, 720], v: [10, 20, 40] };
  assert.strictEqual(interpSeries(ser, 630), 15); assert.strictEqual(interpSeries(ser, 690), 30);
  assert.strictEqual(interpSeries(ser, 0), 10); assert.strictEqual(interpSeries(ser, 9999), 40);
  assert.strictEqual(interpSeries({ t: [], v: [] }, 5), null);
  const loc = { hourly: { time: ["2026-09-20T10:00", "2026-09-20T11:00", "2026-09-20T12:00"], temperature_2m: [10, null, 20] } };
  const fs = forecastSeries(loc, "temperature_2m", "2026-09-20");
  assert.deepStrictEqual(fs, { t: [600, 720], v: [10, 20] }); assert.strictEqual(interpSeries(fs, 660), 15);
});
t("valueAtPlace: piecewise linear along the route, held beyond the end places", () => {
  const locs = [{ frac: 0, temp: { t: [0], v: [10] } }, { frac: 0.5, temp: { t: [0], v: [20] } }, { frac: 1, temp: { t: [0], v: [10] } }];
  assert.strictEqual(valueAtPlace(locs, "temp", 0.25, 0), 15); assert.strictEqual(valueAtPlace(locs, "temp", 0.5, 0), 20);
  assert.strictEqual(valueAtPlace(locs, "temp", 0.75, 0), 15); assert.strictEqual(valueAtPlace(locs, "temp", 1, 0), 10);
  assert.strictEqual(valueAtPlace(locs, "temp", -1, 0), 10);
});
// spatially uniform, warming 1 C per hour: T(t) = 10 + (t - 600) / 60
const warming = [{ frac: 0, temp: { t: [0, 1440], v: [10 - 10, 10 - 10 + 24] }, rh: { t: [0], v: [50] } }];   // 1 C per hour from midnight
const T_at = (min) => min / 60;
const segs = Array(100).fill(250);                                 // 25 km in 100 segments
t("segmentEnvironment: forward - each segment gets the temperature at the moment the rider arrives", () => {
  const env = segmentEnvironment(segs, warming, 600, 25, false);   // start 10:00 at 25 km/h: the ride takes 60 min
  assert(Math.abs(env.tempC[0] - T_at(600 + 0.3)) < 0.01, String(env.tempC[0]));          // first segment: ~0.3 min in
  assert(Math.abs(env.tempC[99] - T_at(600 + 59.7)) < 0.01, String(env.tempC[99]));
  for (let i = 1; i < 100; i++) assert(env.tempC[i] > env.tempC[i - 1]);                  // warms all the way
});
t("segmentEnvironment: reverse - same places, mirrored moments (the far end is reached first)", () => {
  const f = segmentEnvironment(segs, warming, 600, 25, false), r = segmentEnvironment(segs, warming, 600, 25, true);
  for (let i = 0; i < 100; i++) assert(Math.abs(r.tempC[i] - f.tempC[99 - i]) < 1e-9, `segment ${i}`);
});
t("segmentEnvironment: speed sets how fast the clock runs (slower = more warming over the same route)", () => {
  const fast = segmentEnvironment(segs, warming, 600, 25, false), slow = segmentEnvironment(segs, warming, 600, 12.5, false);
  assert(slow.tempC[99] - slow.tempC[0] > 1.9 * (fast.tempC[99] - fast.tempC[0]));
});
t("segmentEnvironment: start time shifts everything by the same amount", () => {
  const a = segmentEnvironment(segs, warming, 600, 25, false), b = segmentEnvironment(segs, warming, 660, 25, false);
  for (let i = 0; i < 100; i += 11) assert(Math.abs((b.tempC[i] - a.tempC[i]) - 1) < 1e-9);
});
t("segmentEnvironment: places differ too - cold start, warm middle, cold end, read at the same clock", () => {
  const locs = [{ frac: 0, temp: { t: [0], v: [10] }, rh: { t: [0], v: [50] } }, { frac: 0.5, temp: { t: [0], v: [20] }, rh: { t: [0], v: [50] } }, { frac: 1, temp: { t: [0], v: [10] }, rh: { t: [0], v: [50] } }];
  const env = segmentEnvironment(segs, locs, 600, 25, false);
  assert(env.tempC[0] < 10.3 && env.tempC[49] > 19.7 && env.tempC[99] < 10.3);
});
t("ride summary: start, end and mean of a steadily warming ride", () => {
  const r = rideEnvSummary(25000, warming, 600, 25);
  assert(Math.abs(r.startC - T_at(600.3)) < 0.01 && Math.abs(r.endC - T_at(659.7)) < 0.01 && Math.abs(r.meanC - T_at(630)) < 0.01);
  assert.strictEqual(r.meanRh, 50);
});

// ---- per-segment air temperature through the statistics
t("feels stats: per-segment temperatures are used (each segment's own air temperature and humidity)", () => {
  const temps = Array.from({ length: 40 }, (_, i) => 5 + i * 0.5), rhs = Array(40).fill(60);
  const r = feelsStats(L, Array(40).fill(0), ms(25), 0, temps, rhs);
  temps.forEach((tc, i) => assert(Math.abs(r.perSeg[i] - feelsLikeC(tc, 60, 25)) < 1e-9));
  assert(Math.abs(r.avgAirC - (5 + 19.5 / 2)) < 1e-9, String(r.avgAirC));
  assert.strictEqual(r.airStartC, 5); assert.strictEqual(r.airEndC, 24.5); assert.strictEqual(r.avgRh, 60);
});
t("feels stats: a constant array behaves exactly like the plain number", () => {
  const a = feelsStats(L, Array(40).fill(0.3), ms(25), ms(20), 12, 60), b = feelsStats(L, Array(40).fill(0.3), ms(25), ms(20), Array(40).fill(12), Array(40).fill(60));
  assert(Math.abs(a.avgFeelsC - b.avgFeelsC) < 1e-9 && Math.abs(a.coldestFeelsC - b.coldestFeelsC) < 1e-9 && Math.abs(a.avgAirC - b.avgAirC) < 1e-9);
});
t("feels stats: still-air heat index is the hottest moment of the ride", () => {
  const temps = Array.from({ length: 40 }, (_, i) => 26 + i * 0.2), rhs = Array(40).fill(70);      // 26 -> 33.8 C, humid
  const r = feelsStats(L, Array(40).fill(0), ms(25), 0, temps, rhs);
  assert(Math.abs(r.stillHiC - (33.8 + heatDeltaC(33.8, 70))) < 1e-9);
  assert(r.stillDeltaC > 0 && Math.abs(r.stillDeltaC - heatDeltaC(33.8, 70)) < 1e-9);
});
t("classes: colour is relative to the air temperature at that segment (a warming day does not read as chill)", () => {
  // every segment feels exactly 3 C colder than ITS OWN air temperature -> one class, even though the air warms 10 C
  const air = Array.from({ length: 40 }, (_, i) => 5 + i * 0.25), per = air.map((a) => a - 3);
  const r = feelsClasses(per, L, air);
  assert(r.cls.every((c) => c === r.cls[0]), JSON.stringify(r.cls));
  assert.notStrictEqual(feelsClasses(per, L, 5).cls[39], r.cls[0], "against a fixed 5 C it would have read very differently");
});

t("ride summary ends agree with the per-segment ones (what the note and the card each show)", () => {
  const locs = [{ frac: 0, temp: { t: [0, 1440], v: [4, 28] }, rh: { t: [0], v: [50] } }, { frac: 1, temp: { t: [0, 1440], v: [8, 32] }, rh: { t: [0], v: [50] } }];
  const lens = Array(1030).fill(25);                                            // the app's 25 m segments
  const sum = rideEnvSummary(25750, locs, 400, 15), env = segmentEnvironment(lens, locs, 400, 15, false);
  assert(Math.abs(sum.startC - env.tempC[0]) < 0.005, `${sum.startC} vs ${env.tempC[0]}`);
  assert(Math.abs(sum.endC - env.tempC[1029]) < 0.005, `${sum.endC} vs ${env.tempC[1029]}`);
});

// ---- wind that changes during the ride
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
t("lerpAngleDeg: shortest arc, wraps through north, endpoints exact", () => {
  assert(near(lerpAngleDeg(350, 10, 0.5), 0) || near(lerpAngleDeg(350, 10, 0.5), 360));
  assert(near(lerpAngleDeg(10, 350, 0.5), 0) || near(lerpAngleDeg(10, 350, 0.5), 360));
  assert(near(lerpAngleDeg(90, 180, 0.5), 135)); assert(near(lerpAngleDeg(180, 90, 0.5), 135));
  assert(near(lerpAngleDeg(200, 300, 0), 200)); assert(near(lerpAngleDeg(200, 300, 1), 300));
  for (let a = 0; a < 360; a += 17) for (let b = 0; b < 360; b += 23) {
    const m = lerpAngleDeg(a, b, 0.5), d1 = Math.abs(((m - a + 540) % 360) - 180), d2 = Math.abs(((b - m + 540) % 360) - 180);
    assert(near(d1, d2, 1e-6), `a=${a} b=${b}`);                           // midpoint is equally far from both ends
  }
});
t("wind series: built from hourly data, missing hours dropped", () => {
  const loc = { hourly: { time: ["2026-09-20T10:00", "2026-09-20T11:00", "2026-09-20T12:00"], wind_speed_10m: [10, null, 30], wind_direction_10m: [90, 100, 110] } };
  assert.deepStrictEqual(forecastWindSeries(loc, "2026-09-20"), { t: [600, 720], sp: [10, 30], dir: [90, 110] });
  assert.deepStrictEqual(forecastWindSeries({ hourly: { time: [] } }, "2026-09-20"), { t: [], sp: [], dir: [] });
});
t("interpWindSeries: speed linear, direction along the shortest arc, held outside", () => {
  const ser = { t: [600, 660], sp: [10, 20], dir: [350, 10] };
  const w = interpWindSeries(ser, 630);
  assert(near(w.sp, 15)); assert(near(w.dir, 0) || near(w.dir, 360));
  assert.deepStrictEqual(interpWindSeries(ser, 0), { sp: 10, dir: 350 }); assert.deepStrictEqual(interpWindSeries(ser, 9999), { sp: 20, dir: 10 });
  assert.strictEqual(interpWindSeries({ t: [], sp: [], dir: [] }, 5), null);
});
t("a wind turning 90 deg keeps its speed halfway (components would dip to 71%)", () => {
  const ser = { t: [0, 60], sp: [20, 20], dir: [0, 90] };
  assert(near(interpWindSeries(ser, 30).sp, 20));
});
t("windAtPlace: between places by distance along the route, held beyond the ends", () => {
  const a = { frac: 0, wind: { t: [0], sp: [10], dir: [90] } }, b = { frac: 1, wind: { t: [0], sp: [30], dir: [180] } };
  const w = windAtPlace([a, b], 0.5, 0);
  assert(near(w.sp, 20)); assert(near(w.dir, 135));
  assert.deepStrictEqual(windAtPlace([a, b], -1, 0), { sp: 10, dir: 90 }); assert.deepStrictEqual(windAtPlace([a, b], 2, 0), { sp: 30, dir: 180 });
  assert.strictEqual(windAtPlace([{ frac: 0 }], 0.5, 0), null);
});
// a wind that swings steadily from 270 (west) at 10:00 to 0/360 (north) at 12:00, 12 -> 24 km/h
const swing = [{ frac: 0, wind: { t: [600, 720], sp: [12, 24], dir: [270, 360] } }];
t("segmentWind forward: each segment gets the wind at the moment the rider arrives", () => {
  const w = segmentWind(segs, swing, 600, 25, false);                                // 25 km in 100 x 250 m, 60 min ride
  assert(near(w.speedKmh[0], 12 + (0.3 / 120) * 12, 0.01) && near(w.dirFromDeg[0], 270 + (0.3 / 120) * 90, 0.1));
  assert(near(w.speedKmh[99], 12 + (59.7 / 120) * 12, 0.01) && near(w.dirFromDeg[99], 270 + (59.7 / 120) * 90, 0.1));
  for (let i = 1; i < 100; i++) assert(w.speedKmh[i] > w.speedKmh[i - 1] && w.dirFromDeg[i] > w.dirFromDeg[i - 1]);
});
t("segmentWind reverse: same places, mirrored moments", () => {
  const f = segmentWind(segs, swing, 600, 25, false), r = segmentWind(segs, swing, 600, 25, true);
  for (let i = 0; i < 100; i++) assert(near(r.speedKmh[i], f.speedKmh[99 - i]) && near(r.dirFromDeg[i], f.dirFromDeg[99 - i]));
});
t("segmentWind: a constant wind is the same on every segment, in both directions", () => {
  const steady = [{ frac: 0, wind: { t: [0], sp: [17], dir: [225] } }];
  for (const rev of [false, true]) { const w = segmentWind(segs, steady, 600, 25, rev); assert(w.speedKmh.every((v) => v === 17) && w.dirFromDeg.every((d) => d === 225)); }
});
t("segmentClock: matches what segmentEnvironment used (forward and reverse)", () => {
  const c = segmentClock(segs, 600, 25, false), r = segmentClock(segs, 600, 25, true);
  assert(near(c.t[0], 600 + 0.3, 1e-6) && near(c.frac[0], 0.005)); assert(near(r.t[99], 600 + 0.3, 1e-6));
});
t("rideWindSummary: exact start and end, mean speed, and a vector-mean direction across north", () => {
  const r = rideWindSummary(25000, swing, 600, 25);
  assert(near(r.start.sp, 12) && near(r.start.dir, 270)); assert(near(r.end.sp, 12 + 12 * 60 / 120, 1e-6) && near(r.end.dir, 270 + 45, 1e-6));
  assert(r.meanSp > 12 && r.meanSp < 18);
  const across = [{ frac: 0, wind: { t: [600, 720], sp: [10, 10], dir: [330, 30] } }];        // 330 -> 30 through north, centred on north
  const m = rideWindSummary(50000, across, 600, 25).meanDir;                                  // a 2 h ride covers the whole swing
  assert(Math.abs(((m + 180) % 360) - 180) < 1.5, "mean direction should be ~north, got " + m);
});
t("rideWindSummary: dead-calm average gives no direction", () => {
  assert.strictEqual(rideWindSummary(20000, [{ frac: 0, wind: { t: [0], sp: [0.1], dir: [200] } }], 600, 25).meanDir, null);
});

t("rideWindSummary: a wind that reverses (west, then east) has no single average direction", () => {
  const flip = [{ frac: 0, wind: { t: [600, 660, 661, 720], sp: [20, 20, 20, 20], dir: [270, 270, 90, 90] } }];
  const r = rideWindSummary(50000, flip, 600, 25);                                             // a 2 h ride covering the flip
  assert.strictEqual(r.meanDir, null, "consistency " + r.consistency); assert(r.consistency < 0.3);
  assert(near(r.meanSp, 20, 0.5));
});
t("rideWindSummary: a steady wind is fully consistent; a gentle veer stays above the threshold", () => {
  assert(near(rideWindSummary(30000, [{ frac: 0, wind: { t: [0], sp: [15], dir: [200] } }], 600, 25).consistency, 1));
  const veer = rideWindSummary(50000, [{ frac: 0, wind: { t: [600, 720], sp: [15, 15], dir: [250, 290] } }], 600, 25);
  assert(veer.consistency > 0.9 && veer.meanDir !== null && near(veer.meanDir, 270, 2));
});

console.log(`\n${n} tests passed`);
