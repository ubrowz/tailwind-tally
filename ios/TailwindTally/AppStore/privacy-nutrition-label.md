# App Privacy ("Nutrition Label") — answer key

Filled out in **App Store Connect → your app → App Privacy → Get Started/Edit**.
This can't be submitted by anyone but the account holder (needs Apple Developer
login), so this is a reference to click through, not something automated.

Apple's form works in two steps: pick which **data types** you collect from a
fixed list, then for each one, answer three sub-questions (linked to identity?
used for tracking? purpose?).

## Data types to select

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| **Name** (Strava first/last name) | Yes | Yes | No | App Functionality |
| **User ID** (Strava athlete id) | Yes | Yes | No | App Functionality |
| **Other User Content** (route/GPS track data) | Yes | No | No | App Functionality |
| **Product Interaction** (under Usage Data — GoatCounter page views) | Yes | No | No | Analytics |

Everything else in Apple's list — Location, Contacts, Health & Fitness,
Financial Info, Browsing History, Search History, Photos/Videos, Purchases,
Diagnostics, Precise/Coarse Location — should be left **unselected**.

## Why each answer

- **Name / User ID**: Strava hands these to the app (via the backend,
  transiently, during token exchange) so it can show "Connected as ___" and
  fetch that person's own routes. Both are clearly tied to that specific
  person, so "linked to identity" is Yes. Nothing is shared with ad networks
  or data brokers, so tracking is No.
- **Other User Content** (the route data itself): classified as user content
  rather than under Apple's "Location" category — that category is
  specifically about live device positioning via Location Services APIs,
  which this app never touches (no CoreLocation, no location permission
  anywhere in the code). This is closer to "a file the user supplied."
  "Linked to identity" is No because there's no database anywhere in this
  stack associating route content with a persistent user record — nothing
  is stored at all.
- **Product Interaction** (GoatCounter): page-view counts only. GoatCounter
  explicitly avoids persistent identifiers (daily-rotating salt, no raw IP
  storage), so not linked to identity, not used for tracking.
- **IP address**: technically present in every web request (as with any
  website), but doesn't need its own line — Apple's guidance exempts IP
  that's only used momentarily for the connection itself and not logged or
  linked to build a profile, which matches how GitHub Pages/Render/
  GoatCounter are actually used here.
- **Diagnostics/crash data**: nothing to disclose — the app has no
  crash-reporting SDK (Crashlytics, Sentry, etc.). Apple's own OS-level
  crash collection (the "Share With App Developers" toggle) is separate and
  not something you disclose in your own app's label.

## One honest flag

The "Other User Content" classification for route data is the most
judgment-call-y line in this table — Apple's taxonomy doesn't have a clean
bucket for "user-uploaded historical GPS track that never touches Location
Services." This is the recommended, defensible answer, but it's the account
holder's call to make when certifying it to Apple.
