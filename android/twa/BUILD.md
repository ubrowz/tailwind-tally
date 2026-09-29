# Building the Android app (Trusted Web Activity)

Generated with Bubblewrap from `twa-manifest.json`; the app opens
`https://ubrowz.github.io/tailwind-tally/` in Chrome, full screen.

- Upload key: `~/.android-keys/tailwind-tally-upload.jks`, alias `upload`.
  Password: macOS Keychain item "Tailwind Tally Android upload key". **Back up the .jks file.**
  Never commit it (see `.gitignore`).
- Java: the JDK inside Android Studio. SDK: `~/Library/Android/sdk` (API 36, build-tools 36.0.0).
- `bubblewrap build` refuses this SDK (it wants the separate command-line tools), so build with
  Gradle and sign by hand - the same steps Bubblewrap performs.

## After changing twa-manifest.json

```sh
~/.bubblewrap/cli/node_modules/.bin/bubblewrap update --skipVersionUpgrade   # regenerates the project
```

For a new Play upload, raise `appVersionCode` (and `appVersionName`) in `twa-manifest.json` first.

## Build and sign

```sh
cd android/twa
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ANDROID_HOME="$HOME/Library/Android/sdk"
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew --no-daemon -q assembleRelease bundleRelease

BT=$ANDROID_HOME/build-tools/36.0.0; K=$HOME/.android-keys/tailwind-tally-upload.jks
PW="$(security find-generic-password -a tailwind-tally-upload -s 'Tailwind Tally Android upload key' -w)"
V=$(python3 -c "import json;print(json.load(open('twa-manifest.json'))['appVersionName'])")
mkdir -p out
"$BT/zipalign" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk out/aligned.apk
"$BT/apksigner" sign --ks "$K" --ks-key-alias upload --ks-pass "pass:$PW" --key-pass "pass:$PW" --out out/tailwind-tally-$V.apk out/aligned.apk && rm out/aligned.apk
cp app/build/outputs/bundle/release/app-release.aab out/tailwind-tally-$V.aab
"$JAVA_HOME/bin/jarsigner" -keystore "$K" -storepass "$PW" -keypass "$PW" -sigalg SHA256withRSA -digestalg SHA-256 out/tailwind-tally-$V.aab upload
unset PW
```

- `out/tailwind-tally-<version>.aab` -> upload to the Play Console.
- `out/tailwind-tally-<version>.apk` -> install on the emulator / a phone: `adb install -r out/tailwind-tally-<version>.apk`.

## Before release: Digital Asset Links

`https://ubrowz.github.io/.well-known/assetlinks.json` (repository `ubrowz/ubrowz.github.io`, with `.nojekyll`)
must list `com.ubrowz.tailwindtally` with the SHA-256 of the **Play app signing key** (Play Console ->
Setup -> App signing). Also add the upload key's SHA-256 so locally installed test builds verify:
`46:23:CA:BF:59:4B:E9:4B:AC:91:A2:2C:4F:75:9D:25:48:13:4B:BB:10:32:BC:6C:F0:19:67:CE:43:4A:C1:A4`.
Without the file the app works but shows a URL bar.

## Location (Live tab)

`twa-manifest.json` has `features.locationDelegation` enabled, so the page's location request inside the
app is answered by the app (library `com.google.androidbrowserhelper:locationdelegation`). It declares
both ACCESS_COARSE_LOCATION and ACCESS_FINE_LOCATION. FINE is kept on purpose: the library checks for it
in its own code, so removing it would likely break Live. Android 12+ always lets the user pick
"Approximate" in the prompt, and the page rounds the position to about 11 km before sending it
(Data safety: approximate location only).

