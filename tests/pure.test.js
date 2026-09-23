// Unit tests for the pure calculation code in index.html (forecast timing and
// wind along the ride, steady power, reversing, units). Run with:
//   node tests/pure.test.js
// The functions are cut out of index.html between "BEGIN/END <name>-pure"
// markers and run as they are: nothing is copied or mocked.
//
// This is the wind-forecast-only release: the chill-pure, rain-pure and
// climb-pure blocks (Temperature/Rain/Climbs tabs) do not exist on this
// branch, so they are not grabbed here either. See forecast-wind for the
// full-featured version and its own tests.
const fs = require("fs"), assert = require("assert");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const grab = (name) => { const r = new RegExp("// BEGIN " + name + "([\\s\\S]*?)// END " + name).exec(src); assert(r, name + " markers not found"); return r[1]; };
const { kmhToBeaufort, forecastSamplePoints, summarizeForecast, buildRideSeries, seriesIndexAtTime, mirrorLocations, mirrorTimeline, isUSLocation, KM_TO_MI, M_TO_FT, MM_TO_IN, RIDER_DEFAULTS, airDensity, STANDARD_TEMP_C, powerAtSpeed, powerForSpeed, solveSpeedMs, ridePowerProfile, segmentClock, forecastWindSeries, lerpAngleDeg, interpWindSeries, windAtPlace, segmentWind, rideWindSummary, forecastSamplePlan, forecastMinutes, addDaysToDateStr, rideMinutes, cumulativeMeters } =
  new Function(grab("forecast-pure") + grab("series-pure") + grab("mirror-pure") + grab("units-pure") + grab("power-pure") +
    "; return { kmhToBeaufort, forecastSamplePoints, summarizeForecast, buildRideSeries, seriesIndexAtTime, mirrorLocations, mirrorTimeline, isUSLocation, KM_TO_MI, M_TO_FT, MM_TO_IN, RIDER_DEFAULTS, airDensity, STANDARD_TEMP_C, powerAtSpeed, powerForSpeed, solveSpeedMs, ridePowerProfile, segmentClock, forecastWindSeries, lerpAngleDeg, interpWindSeries, windAtPlace, segmentWind, rideWindSummary, forecastSamplePlan, forecastMinutes, addDaysToDateStr, rideMinutes, cumulativeMeters };")();

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


// ---- wind that changes during the ride
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const segs = Array(100).fill(250);                                 // 25 km in 100 segments
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
  const w = segmentWind(segs, swing, 600, 25);                                // 25 km in 100 x 250 m, 60 min ride
  assert(near(w.speedKmh[0], 12 + (0.3 / 120) * 12, 0.01) && near(w.dirFromDeg[0], 270 + (0.3 / 120) * 90, 0.1));
  assert(near(w.speedKmh[99], 12 + (59.7 / 120) * 12, 0.01) && near(w.dirFromDeg[99], 270 + (59.7 / 120) * 90, 0.1));
  for (let i = 1; i < 100; i++) assert(w.speedKmh[i] > w.speedKmh[i - 1] && w.dirFromDeg[i] > w.dirFromDeg[i - 1]);
});
t("segmentWind: a constant wind is the same on every segment", () => {
  const steady = [{ frac: 0, wind: { t: [0], sp: [17], dir: [225] } }];
  const w = segmentWind(segs, steady, 600, 25); assert(w.speedKmh.every((v) => v === 17) && w.dirFromDeg.every((d) => d === 225));
});
t("segmentClock: matches what segmentEnvironment used", () => {
  const c = segmentClock(segs, 600, 25);
  assert(near(c.t[0], 600 + 0.3, 1e-6) && near(c.frac[0], 0.005)); assert(near(c.t[99], 600 + 59.7, 1e-6));
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

// ---- riding at steady power (flat road)
const RIDER = RIDER_DEFAULTS, RHO = 1.2, kmh = (x) => x / 3.6;
t("power model: hand-computed watts for 25 km/h on a calm flat day", () => {
  // aero 0.5*1.2*0.32*(6.944)^3 = 64.3 W, rolling 0.005*85*9.81*6.944 = 28.9 W, both at the wheel; / 0.975 = 95.5 W
  const w = powerForSpeed(kmh(25), RHO, RIDER);
  assert(Math.abs(w - 95.5) < 0.2, String(w));
});
t("air density: about 1.29 at 0 C, 1.20 at 20 C, 1.16 at 30 C (dry, sea level)", () => {
  assert(Math.abs(airDensity(0) - 1.292) < 0.005); assert(Math.abs(airDensity(20) - 1.204) < 0.005); assert(Math.abs(airDensity(30) - 1.165) < 0.005);
});
t("calibration round trip: the power for a speed gives that speed back on a calm day, 10-50 km/h", () => {
  for (let v = 10; v <= 50; v += 2.5) assert(near(solveSpeedMs(powerForSpeed(kmh(v), RHO, RIDER), 0, 0, RHO, RIDER) * 3.6, v, 1e-6), `v=${v}`);
});
t("the solved speed satisfies the power balance exactly, in headwind, tailwind, crosswind", () => {
  const P = powerForSpeed(kmh(25), RHO, RIDER);
  for (const wa of [-12, -6, 0, 3, 8]) for (const wc of [0, 2, 6]) {
    const v = solveSpeedMs(P, wa, wc, RHO, RIDER);
    assert(near(powerAtSpeed(v, wa, wc, RHO, RIDER), P, 1e-6), `wa=${wa} wc=${wc}: ${powerAtSpeed(v, wa, wc, RHO, RIDER)} vs ${P}`);
  }
});
t("values from the simulation quoted in the proposal (96 W, straight flat road)", () => {
  const P = powerForSpeed(kmh(25), RHO, RIDER);
  const expect = { "-30": 11.4, "-20": 15.0, "-10": 19.6, "0": 25.0, "10": 31.1, "20": 37.8, "30": 44.9 };
  for (const w in expect) assert(Math.abs(solveSpeedMs(P, kmh(+w), 0, RHO, RIDER) * 3.6 - expect[w]) < 0.06, `${w}: ${solveSpeedMs(P, kmh(+w), 0, RHO, RIDER) * 3.6}`);
});
t("headwind slows, tailwind speeds up, and a headwind costs more than an equal tailwind gives back", () => {
  const P = powerForSpeed(kmh(25), RHO, RIDER), s = (w) => solveSpeedMs(P, kmh(w), 0, RHO, RIDER) * 3.6;
  for (let w = -30; w < 30; w += 2) assert(s(w + 2) > s(w), `w=${w}`);
  for (const w of [5, 10, 20, 30]) assert(25 - s(-w) > s(w) - 25 ? false : true, `asymmetry at ${w}`);  // gain from a tailwind exceeds the loss in speed...
  for (const w of [5, 10, 20, 30]) assert(1 / s(-w) + 1 / s(w) > 2 / 25, `TIME is longer overall at ${w}`);   // ...but the time lost in the headwind outweighs the time gained
});
t("a pure crosswind still costs speed (the size of the air velocity grows)", () => {
  const P = powerForSpeed(kmh(25), RHO, RIDER);
  assert(solveSpeedMs(P, 0, kmh(20), RHO, RIDER) < solveSpeedMs(P, 0, 0, RHO, RIDER));
});
t("strong tailwind and a small power: still a stable speed, and the balance holds (wind faster than the bike)", () => {
  const v = solveSpeedMs(30, kmh(40), 0, RHO, RIDER);
  assert(v > 0 && isFinite(v)); assert(near(powerAtSpeed(v, kmh(40), 0, RHO, RIDER), 30, 1e-6));
});
t("zero power coasts to the speed where the wind's push equals rolling resistance", () => {
  const v = solveSpeedMs(0, kmh(30), 0, RHO, RIDER);
  assert(v > 0 && Math.abs(powerAtSpeed(v, kmh(30), 0, RHO, RIDER)) < 1e-6);
});
t("colder (denser) air needs more power for the same speed; heavier rider needs more too", () => {
  assert(powerForSpeed(kmh(25), airDensity(0), RIDER) > powerForSpeed(kmh(25), airDensity(30), RIDER));
  assert(powerForSpeed(kmh(25), RHO, { ...RIDER, massKg: 100 }) > powerForSpeed(kmh(25), RHO, RIDER));
});

// a straight 20 km east-west route in 100 segments; riding "forward" = eastbound
const eLens = Array(100).fill(200), eHead = Array(100).fill([1, 0]);
const towardOf = (dirFrom) => { const a = ((dirFrom + 180) % 360) * Math.PI / 180; return [Math.sin(a), Math.cos(a)]; };
const P25 = powerForSpeed(kmh(25), RHO, RIDER);
function profile(over) {
  return ridePowerProfile(Object.assign({ lengths: eLens, headings: eHead, startMin: 600, powerW: P25, rider: RIDER, toward: towardOf,
    windAt: () => ({ speedKmh: 0, dirFromDeg: 0 }), tempAt: () => 20 }, over));
}
t("profile, no wind: the same speed on every stretch, time = length / speed", () => {
  const r = profile({ tempAt: () => 20 });
  const v = solveSpeedMs(P25, 0, 0, airDensity(20), RIDER);
  assert(r.speedMs.every((x) => near(x, v, 1e-9)));
  assert(near(r.minutes, 20000 / v / 60, 1e-9));
});
t("profile: total minutes is the sum of the stretch times, and the clock only moves forward", () => {
  const r = profile({ windAt: () => ({ speedKmh: 15, dirFromDeg: 270 }) });
  assert(near(r.minutes, r.dtMin.reduce((a, b) => a + b, 0), 1e-9));
  const order = r.tMid; for (let i = 1; i < order.length; i++) assert(order[i] > order[i - 1]);        // forward rides in route order
});
t("profile, wind from the WEST: eastbound has a tailwind, so it is faster than westbound", () => {
  const w = { windAt: () => ({ speedKmh: 20, dirFromDeg: 270 }) };
  const east = profile(w), west = profile({ ...w, headings: eHead.map(() => [-1, 0]) });      // the same road ridden westbound
  assert(east.minutes < west.minutes);
  assert(east.cosphi.every((c) => near(c, 1, 1e-9)) && west.cosphi.every((c) => near(c, -1, 1e-9)));
  assert(near(east.windKmh[10], 20) && near(east.windDir[10], 270));
});
t("profile: any wind costs time overall on a there-and-back route (headwind loses more than tailwind gains)", () => {
  const w = { windAt: () => ({ speedKmh: 20, dirFromDeg: 270 }) };
  const calm = profile({}), east = profile(w), west = profile({ ...w, headings: eHead.map(() => [-1, 0]) });
  assert(east.minutes + west.minutes > 2 * calm.minutes);
});
t("profile: the clock follows the REAL speed - a wind that flips at 30 min flips where the rider actually is then", () => {
  // eastbound, wind from the west (tailwind, fast) until 10:00 + 30 min, then from the east (headwind, slow)
  const flip = (frac, tm) => ({ speedKmh: 20, dirFromDeg: tm < 630 ? 270 : 90 });
  const r = profile({ windAt: flip });
  const firstHead = r.cosphi.findIndex((c) => c < 0);
  const vTail = solveSpeedMs(P25, kmh(20), 0, airDensity(20), RIDER);
  const expectedIdx = Math.ceil((vTail * 30 * 60) / 200);                                       // metres ridden in 30 min at the TAILWIND speed / 200 m
  const constantClockIdx = Math.ceil((25 / 3.6 * 30 * 60) / 200);                                // where a constant 25 km/h clock would put the flip
  assert(firstHead > 0 && Math.abs(firstHead - expectedIdx) <= 1, `flip at segment ${firstHead}, expected ~${expectedIdx}`);
  assert(Math.abs(firstHead - constantClockIdx) > 10, `must differ from the constant-speed clock (${constantClockIdx})`);
});
t("profile: temperature is read at the arrival time (warming day -> warmer air later in the ride)", () => {
  const r = profile({ tempAt: (f, tm) => 10 + (tm - 600) / 60 });
  assert(r.tempC[99] > r.tempC[0]); for (let i = 1; i < 100; i++) assert(r.tempC[i] >= r.tempC[i - 1]);
});
t("each stretch of a profile satisfies the power balance at its own wind and density", () => {
  const r = profile({ windAt: (f) => ({ speedKmh: 8 + 20 * f, dirFromDeg: 250 + 60 * f }), tempAt: (f) => 5 + 20 * f });
  for (let i = 0; i < 100; i += 9) {
    const wMs = r.windKmh[i] / 3.6, cos = r.cosphi[i];
    assert(near(powerAtSpeed(r.speedMs[i], wMs * cos, wMs * Math.sqrt(1 - cos * cos), airDensity(r.tempC[i]), RIDER), P25, 1e-6), `segment ${i}`);
  }
});


// the "During the ride" series
t("buildRideSeries: km counted along the ride, the clock ascends, thinned evenly, ends included", () => {
  const lengths = Array(100).fill(25), tt = lengths.map((_, i) => 600 + i * 0.5);
  const f = buildRideSeries({ lengths, t: tt, windKmh: lengths.map((_, i) => i), windDir: null, airC: null, feelsC: null, maxPoints: 10 });
  assert.strictEqual(f.length, 10); assert.strictEqual(f[0].i, 0); assert.strictEqual(f[9].i, 99);
  assert(near(f[0].km, 0.0125, 1e-12) && near(f[9].km, 2.4875, 1e-12)); for (let k = 1; k < 10; k++) assert(f[k].t > f[k - 1].t && f[k].km > f[k - 1].km);
  assert.strictEqual(f[9].windKmh, 99); assert.strictEqual(f[0].windDir, null);
  assert.strictEqual(buildRideSeries({ lengths: [25], t: [1], windKmh: null, windDir: null, airC: [3], feelsC: [1], maxPoints: 140 }).length, 1);
  assert.strictEqual(buildRideSeries({ lengths, t: tt, windKmh: null, windDir: null, airC: null, feelsC: null }).length, 100, "default keeps up to 140");
});
t("seriesIndexAtTime: nearest point, clamped at both ends", () => {
  const pts = [10, 20, 30, 50].map((tm) => ({ t: tm }));
  assert.deepStrictEqual([0, 10, 14, 16, 20, 29, 39, 41, 50, 99].map((x) => seriesIndexAtTime(pts, x)), [0, 0, 0, 1, 1, 2, 2, 3, 3, 3]);
  assert.strictEqual(seriesIndexAtTime([], 5), -1);
});


// reversing the route: what was fetched for it stays valid, seen from the other end
t("mirrorLocations: places turn around (fractions 1 - f, order reversed), everything else is kept, the input is untouched", () => {
  const a = { frac: 0, temp: { t: [1], v: [5] } }, b = { frac: 0.4, temp: { t: [1], v: [6] } }, c = { frac: 1, temp: { t: [1], v: [7] } }, locs = [a, b, c];
  const m = mirrorLocations(locs);
  assert.deepStrictEqual(m.map((l) => l.frac), [0, 0.6, 1]); assert.deepStrictEqual(m.map((l) => l.temp.v[0]), [7, 6, 5]);
  assert.strictEqual(b.frac, 0.4, "the original is not modified"); assert.strictEqual(locs[0], a);
  assert.deepStrictEqual(mirrorLocations(mirrorLocations(locs)).map((l) => [l.frac, l.temp.v[0]]), locs.map((l) => [l.frac, l.temp.v[0]]), "twice is the identity");
});
t("mirrorTimeline: keeps the start time, mirrors the places, and null stays null", () => {
  const tl = { locations: [{ frac: 0, x: 1 }, { frac: 1, x: 2 }], startMin: 480 }, m = mirrorTimeline(tl);
  assert.strictEqual(m.startMin, 480); assert.deepStrictEqual(m.locations.map((l) => l.x), [2, 1]); assert.strictEqual(mirrorTimeline(null), null);
});

// units: US bounding box vs metric everywhere else
t("isUSLocation: mainland, Alaska and Hawaii are US; nearby non-US places are not", () => {
  assert(isUSLocation(39.5, -98.35));      // Kansas, dead centre of the mainland
  assert(isUSLocation(40.7, -74.0));       // New York
  assert(isUSLocation(34.0, -118.2));      // Los Angeles
  assert(isUSLocation(64.2, -149.5));      // Fairbanks, Alaska
  assert(isUSLocation(21.3, -157.8));      // Honolulu, Hawaii
  assert(!isUSLocation(51.3, 5.62));       // the Netherlands (the sample route)
  assert(!isUSLocation(51.5, -0.13));      // London
  assert(isUSLocation(45.5, -73.6), "Montreal sits inside the box too - a known limitation of a simple bounding box, documented above");
  assert(!isUSLocation(62.45, -114.4));    // Yellowknife: right latitude for the Alaska box, wrong longitude
  assert(!isUSLocation(19.4, -99.1));      // Mexico City, south of the mainland box
});
t("unit conversion constants: round trips are close to 1", () => {
  assert(near(1 * KM_TO_MI * (1 / KM_TO_MI), 1, 1e-9));
  assert(near(100 * M_TO_FT / 3.28084, 100, 1e-3));
  assert(near(25.4 * MM_TO_IN, 1, 1e-9));
});


console.log(`
${n} tests passed`);
