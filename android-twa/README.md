# NIL SparkLab — Android TWA build guide

This wraps the existing PWA (https://nilsparklab.github.io) in a Trusted Web
Activity. No app-side code changes — the Android shell just opens the live
website through installed Chrome. `twa-manifest.json` in this folder has
pre-filled values matching `manifest.json`; adjust `packageId` if you want a
different one before building (it can't be changed after publishing).

## Prerequisites (install once, on your own machine — needs internet + Android SDK)
- Node.js 18+
- JDK 17
- Android SDK (Android Studio, or just `cmdline-tools` + `sdkmanager`)

## Steps

1. Install bubblewrap:
   ```
   npm i -g @bubblewrap/cli
   ```

2. From this `android-twa/` folder, build the Android project:
   ```
   bubblewrap init --manifest twa-manifest.json
   ```
   It'll ask a few questions — defaults are already filled from
   `twa-manifest.json`, just confirm or press Enter. On first run it also
   offers to download/install the Android SDK + JDK if you don't have them.

   This generates a Java keystore (`android.keystore`) unless you point it
   to an existing one — **back this up**. Losing it means you can never
   update the app on Play Store again under the same package.

3. Get the signing key's SHA256 fingerprint:
   ```
   bubblewrap fingerprint
   ```
   (or: `keytool -list -v -keystore android.keystore -alias android`)

4. Put that fingerprint into `/.well-known/assetlinks.json` at the **root of
   the nilsparklab.github.io repo** (already scaffolded in this zip — just
   replace `REPLACE_WITH_YOUR_SIGNING_KEY_SHA256_FINGERPRINT` and push it
   live). Without this file matching, Chrome shows the address bar instead
   of a clean full-screen app (falls back out of "trusted" mode).

5. Build the release APK/AAB:
   ```
   bubblewrap build
   ```
   Produces `app-release-signed.apk` (for direct install/testing) and
   `app-release-bundle.aab` (for Play Store upload).

6. Verify the asset link is live and correct before publishing:
   https://developers.google.com/digital-asset-links/tools/generator

## Notes specific to this app
- Mic (voice input in the assistant) needs no extra Android permission —
  TWA delegates it through Chrome, same as the browser/PWA. The mic error
  handling in `index.html` (`bootMic`) already detects TWA context via
  `document.referrer` starting with `android-app://` and shows the correct
  "open Android App Info → Permissions" message if it's ever denied.
- `start_url` / `scope` in `manifest.json` are already `https://nilsparklab.github.io/`,
  matching `host` here — required for TWA validation to pass.
- `packageId` is set to `in.nilsparklab.app` — kept consistent across
  `twa-manifest.json` and `assetlinks.json`. This is permanent once
  published to Play Store, so confirm it before running `bubblewrap build`.
