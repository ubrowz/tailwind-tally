# App Store listing metadata

Draft copy for App Store Connect → your app → App Information / Pricing and
Availability / Prepare for Submission. Character counts verified against
Apple's actual limits; edit freely, just re-check lengths if you change
anything.

## App name (30 char max)

```
Tailwind Tally
```
14 chars.

## Subtitle (30 char max)

```
Wind impact by GPX route
```
30 chars. Shown under the app name in search results and on the product page.

Alternative, if you'd rather lead with the mechanic instead of the pitch:
`Tailwind vs headwind, by route` (30 chars).

## Promotional text (170 char max)

Editable any time without a new build submission, so it's a reasonable place
to update copy later without a full release.

```
See how much of a ride is tailwind vs headwind before you go, in either direction. Import a GPX file or connect Strava.
```
119 chars.

## Description (4000 char max)

```
Tailwind Tally shows how much of a bike route is tailwind versus headwind for a given wind direction, ridden forward or the other way around.

Load a route by dropping in a GPX file, sharing one from Strava, Mail, or Files, or connecting your Strava account and picking straight from your own routes.

The route map is colored by wind angle: full tailwind, tailwind, crosswind, headwind, full headwind. You get the split for the whole route and for just the second half, since that's usually the part that decides how a ride actually feels. A 360 degree sweep shows the easy fraction for every possible wind direction, so you can find the best wind for a given loop or check how bad a specific direction would really be. There is also a simple effort estimate: how much harder a given wind speed makes the ride at your normal cruising speed, compared to riding it on a calm day.

Everything runs on your device. Routes are not uploaded anywhere, there is no account to create, and nothing is stored. Connecting Strava is optional and only pulls what you ask it to, when you ask for it.
```
1085 chars.

## Keywords (100 char max, comma-separated)

```
cycling,wind,tailwind,headwind,strava,gpx,route planner,bike,ride,bicycle,weather,windfinder
```
92 chars. "Tailwind" overlaps with the app name, but keywords and the name
are indexed separately, so it's kept in the list too.

## Category

Primary: **Health & Fitness** (matches how Strava itself is categorized, and
this app is squarely a companion tool for cycling training/route planning).
**Sports** is a defensible alternative if Health & Fitness feels off for a
tool that doesn't track workouts itself - your call.

Secondary (optional): **Weather** or **Utilities** both fit reasonably, given
the wind-direction angle.

## URLs

- **Privacy Policy URL** (required): `https://ubrowz.github.io/tailwind-tally/privacy.html`
- **Support URL** (required): suggest `https://github.com/ubrowz/tailwind-tally/issues` -
  it's public, already exists, and lets people file real bugs. Swap for a
  dedicated page later if you want.
- **Marketing URL** (optional): `https://ubrowz.github.io/tailwind-tally/` -
  the web app doubles fine as its own marketing page.

## Copyright

```
© 2026 ubrowz
```
Replace with your legal name if you'd rather that be public instead of the
handle - this field is shown on the App Store listing.

## Age rating

The questionnaire should come out at **4+** - no objectionable content, no
user-generated content shared with other users (routes are private to the
person who loads them), no unrestricted web access (the app only ever shows
its own site plus Strava's login).

## Screenshots

In `Screenshots/6.5-inch-1242x2688/` and `Screenshots/6.7-inch-1284x2778/`,
at the exact pixel dimensions App Store Connect's upload screen asked for
(confirmed directly against the live form, not guessed - an earlier draft
of these used the newer iPhone 15/16 Pro Max resolution, 1290x2796, which
App Store Connect did not actually ask for at this screen; replaced with
the sizes it does ask for). Captured against the beta site (same UI the
release will ship) in its actual mobile layout via Chrome DevTools
Protocol: a device viewport at 3x scale AND a real iPhone Safari
user-agent string, both required - the app decides what to hide on a
phone (Full report, the How it works tab, the intro text, the sweep
table link) by matching `navigator.userAgent` against
`/iPhone|iPod|Android.*Mobile/`, not by screen width, so a first attempt
that only faked the viewport size still showed phone-only content that a
real device never would. The beta banner is hidden by loading
`?shots` on the URL (added to `tools/publish_beta.py` for exactly this),
not stripped from the page - simpler than removing it via a DOM script
each time.

Regenerated 2026-09-23 for the forecast/temperature/rain/climbs release
(the earlier pair, Route + Wind-direction sweep, predated that redesign
and the "if ridden reverse" comparison they showed no longer exists):

1. **01-route.png** - the Wind tab's Route map, tailwind/headwind coloured,
   using the app's own built-in sample route (flat, no rain, so it doesn't
   suit the other three below) with a real next-day forecast.
2. **02-temperature.png** - the Temperature tab's three feels-like cards,
   same sample route/forecast, chosen specifically to show the new "Feels
   like in full sun" card (a lower-bound estimate, see How it works
   section 10).
3. **03-rain.png** - the Rain tab's summary, chart and coloured map, using
   a different (hillier, real) local test route on a date picked because
   its real forecast actually shows rain there - the sample route's own
   location had none in the available window. Uploaded under the generic
   name "route.gpx", not its real filename.
4. **04-climbs.png** - the Climbs tab's numbered climbs (11, 969 m of
   climbing) on the map and the count/filters above it, same route as
   above (it has real hills; the sample route doesn't), elevation looked
   up live via the "Look up elevation online" button.

The Wind-direction sweep screenshot was dropped this round - correct, but
mostly empty space at this crop compared to the other four.

If App Store Connect asks for a different set of sizes by the time you
read this (Apple reshuffles required device classes over time), regenerate
from the live site at whatever exact dimensions it currently shows.
