# Tailwind Tally on Google Play - plan

Status: plan only, nothing built yet (written 2026-09-28).
Goal: the same app Android users get from Google Play, with as little extra
maintenance as possible - like the iOS app, it shows the live site, so every
website release reaches Android too without a new store version.

> Requirements marked **(check)** change over time. Confirm them in the Play
> Console / Google's documentation at the moment you do that step.

---

## 1. Which kind of Android app

| Option | What it is | For | Against |
|---|---|---|---|
| **A. Trusted Web Activity (TWA)** - recommended | A thin Android app that opens the live site in Chrome, full screen, without browser bars. Built with Google's **Bubblewrap** tool (or PWABuilder). | Almost no code. It *is* Chrome: Strava login (also "Sign in with Google" on Strava's page), Save image downloads, the map, localStorage and the language switch all work as on the web. Updates come from the website. | Needs a verification file at the root of `ubrowz.github.io` (see 3.2). Opening a shared `.gpx` file needs extra work (phase 2). Needs Chrome (or another TWA browser) on the phone - true for nearly all Play users. |
| B. WebView shell (like the iOS app) | A Kotlin app with an Android WebView, same idea as `ios/TailwindTally`. | Full control, `.gpx` "Open with" is easy (intent filter + `loadGpxText`). | Google blocks its own sign-in in WebViews, so Strava users who log in to Strava with Google cannot connect. Save image (blob downloads) needs native code. More code to maintain. |
| C. Rebuild natively | Kotlin/Compose app. | Best possible Android feel. | A second app to build and keep in sync. Not worth it now. |

**Recommendation: A (TWA)**, with `.gpx` sharing added in a second phase.

---

## 2. Accounts and one-time costs

1. **Google Play Console developer account** - one-time fee of 25 USD **(check)**.
   Choose **Personal** (you are a private developer; an Organization account needs a D-U-N-S number).
2. **Identity verification**: Google asks for ID and verifies name and address **(check)**. What is
   shown publicly: developer name and a contact email (use the same Firefox Relay alias as for Apple).
   A public address is only required for developers who earn money through Play **(check)**.
3. **EU Digital Services Act**: Play Console also asks for **trader status**. Declare **non-trader**,
   as in App Store Connect (free app, no income).
4. **An Android phone for testing** - or the emulator in Android Studio on the Mac (free).
   A real phone is better for the final check (GPS-free, but touch, share sheet, downloads).

---

## 3. Website changes (branch `next` -> beta -> live, as usual)

### 3.1 Web app manifest and icons
- `manifest.webmanifest`: name "Tailwind Tally", `start_url: "/tailwind-tally/"`, `scope: "/tailwind-tally/"`,
  `display: "standalone"`, theme/background colour, and icons.
- Icons **192x192** and **512x512**, plus a **maskable** 512x512 (Android crops icons into circles/squircles,
  so the artwork needs a safe margin). Made from `ios/.../icon-1024.png` (the fixed one).
- Link the manifest from `index.html` (`<link rel="manifest">`, `<meta name="theme-color">`).
- A minimal **service worker** is optional for a TWA but makes the site an installable PWA; add one only
  if it does not cache the page (a stale cached page would break "every release reaches the app").

### 3.2 Digital Asset Links (proof that the site and the app belong together)
- Chrome only hides its URL bar in a TWA if the site proves it trusts the app: a file
  **`https://ubrowz.github.io/.well-known/assetlinks.json`** - at the root of the domain, not under `/tailwind-tally/`.
- That root is a *separate* GitHub Pages site: the repository **`ubrowz/ubrowz.github.io`** (a "user site").
  Create it (it can stay otherwise empty), add `.well-known/assetlinks.json` and a `.nojekyll` file
  (GitHub Pages hides folders starting with a dot unless Jekyll is off).
- The file lists the package name and the **SHA-256 fingerprint of the app signing key** from the Play Console
  (Setup -> App signing). Without it the app still works, but shows a URL bar at the top.
- Check: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://ubrowz.github.io&relation=delegate_permission/common.handle_all_urls`

### 3.3 Small in-page adjustments (probably none needed)
- The page already treats `Android ... Mobile` as a phone (hides the Full report, intro text, sweep table,
  How it works tab), so the Android app gets the phone layout automatically.
- The Strava callback returns to `ubrowz.github.io/tailwind-tally/` - inside the TWA, so it keeps working.
- If the app ever needs to know it runs as the Android app: `document.referrer` starts with `android-app://`.

---

## 4. Building the Android app (TWA)

1. Install Java (JDK 17) and Android command-line tools (Bubblewrap can install both), and Node.
2. `npx @bubblewrap/cli init --manifest https://ubrowz.github.io/tailwind-tally/manifest.webmanifest`
   - Package name: **`com.ubrowz.tailwindtally`** (same as iOS; cannot be changed after publishing).
   - App name "Tailwind Tally", launcher name "Tailwind Tally", status bar colour, splash colour.
   - Creates an **upload key** (keystore). Keep it and its password safe, outside the repository
     (with Play App Signing, Google holds the real signing key; a lost upload key can be reset, but it takes time).
3. `npx @bubblewrap/cli build` -> an **`.aab`** (Android App Bundle, what Play wants) and a test `.apk`.
4. Store the generated Android project in `android/` in this repository (without the keystore).
5. **Target API level**: Play requires a recent Android target SDK every year **(check)**; Bubblewrap updates
   handle this - rebuild once a year before Google's deadline (usually 31 August).
6. Test the `.apk` on the emulator / phone: route from Files, Strava connect, forecast, all three tabs,
   Save image (does the file land in Downloads?), NL/EN switch and that the choice is remembered.

---

## 5. Store listing (Play Console)

| Item | Requirement | Source |
|---|---|---|
| App name | max 30 characters | "Tailwind Tally" |
| Short description | max 80 characters | e.g. "Tailwind, headwind, temperature and rain along your cycling route." (67) |
| Full description | max 4000 characters | adapt `ios/TailwindTally/AppStore/app-store-metadata.md` |
| App icon | 512x512 PNG, 32-bit | from icon-1024 |
| **Feature graphic** | **1024x500**, required, no Apple equivalent | new: icon + name + a route map crop |
| Phone screenshots | 2 to 8, portrait 9:16 works, 320-3840 px per side **(check)** | re-run `tools/appstore_screenshots.js` with an Android Chrome user agent and a 1080x1920 (or 1080x2400) viewport |
| Privacy policy | URL | `https://ubrowz.github.io/tailwind-tally/privacy.html` |
| Category | | Sports (or Health & Fitness) |
| Contact email | public | the Firefox Relay alias |

Languages: English first; Dutch listing can be added later (same as the App Store).

---

## 6. Declarations in Play Console ("App content")

- **Data safety** (Google's version of Apple's privacy label) - same facts as
  `ios/TailwindTally/AppStore/privacy-nutrition-label.md`:
  - *Approximate location*: collected/shared with a third party (Open-Meteo), for app functionality, optional
    (only when the rider asks for a forecast), not stored by us.
  - *Name* and *User IDs* (Strava): processed for app functionality when the user connects Strava, not shared, not stored.
  - *App activity / page views*: GoatCounter counts visits without personal data - check Google's definitions
    whether cookieless aggregate counting needs declaring **(check)**.
  - Data encrypted in transit: yes (https). Users can request deletion: nothing is stored, say so.
  - No ads, no data sold.
- **Ads**: no ads.
- **App access**: all features usable without login; Strava is optional (explain; no test account needed).
- **Content rating** questionnaire (IARC): no violence etc. -> "Everyone" / PEGI 3.
- **Target audience**: 13+ or 18+ (not directed at children), matching the privacy policy.
- **News app / government / financial features**: no.

---

## 7. Testing requirement before going public

For **personal** developer accounts created after November 2023, Google requires a **closed test with at
least 12 testers who stay opted in for 14 days in a row** before you can apply for production access
**(check - it was 20 testers until late 2024)**.

1. Create a **closed testing** track, upload the `.aab`, add testers by email list (Google accounts).
2. Find **12+ Android users** (cycling club, friends, family). They opt in via a link and install from Play.
3. Keep them opted in for 14 days; ask them to actually open the app a few times.
4. Then apply for **production access** (a short questionnaire about the test), and after approval
   release to production. Google reviews each release (usually hours to a few days).

This is the longest step: plan roughly **3 to 4 weeks** from first upload to public.

---

## 8. Phase 2 - opening a shared .gpx file

In the iOS app a `.gpx` can be shared to Tailwind Tally ("Open in..."). For the TWA, two ways:

- **Web Share Target** in the manifest (`share_target` with `files: [{ accept: [".gpx", ...] }]`):
  Android then lists Tailwind Tally in the share sheet. The file arrives as a POST, which a static
  GitHub Pages site cannot receive - a small **service worker** intercepts it, stores the file, and the page
  loads it with `loadGpxText`. Works in Chrome/TWA.
- Or native code in the TWA project (an Activity with an intent filter that passes the file to the page) -
  more Android-specific code.

Start with the share target; test with Strava's app, Files and Gmail attachments.

---

## 9. Ongoing work after launch

- Website releases reach the Android app automatically (like iOS; ~10 minutes browser cache).
- Once a year: rebuild with the new target API level (Bubblewrap update) and upload.
- Keep the Data safety form in step with the privacy policy whenever a feature sends something new.
- Screenshots when the design changes (same script, Android viewport).

---

## 10. Order of work (checklist)

1. [ ] Create the Play Console account (personal), verify identity, declare non-trader.
2. [ ] Website (via `next` -> beta -> live): manifest, Android icons (incl. maskable).
3. [ ] Create repo `ubrowz/ubrowz.github.io` with `.nojekyll` (assetlinks.json follows in step 6).
4. [ ] Bubblewrap: init + build, keystore stored safely; Android project in `android/`.
5. [ ] Create the app in Play Console (`com.ubrowz.tailwindtally`), enable Play App Signing, upload the first `.aab` to closed testing.
6. [ ] Put the Play signing key's SHA-256 in `assetlinks.json`; confirm the URL bar disappears.
7. [ ] Store listing: descriptions, icon, feature graphic, Android screenshots, privacy URL.
8. [ ] App content: Data safety, ads, access, content rating, target audience.
9. [ ] Closed test: 12+ testers, 14 days.
10. [ ] Apply for production access, release.
11. [ ] Phase 2: `.gpx` share target.
