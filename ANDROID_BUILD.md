# TravelKo Android App Build Guide (TWA)

## Prerequisites
- Node.js 18+
- Java JDK 11+ (for Android signing)
- Android SDK (or Android Studio installed)

## Step 1: Install Bubblewrap
```bash
npm install -g @nicedoc/bubblewrap-cli
# or
npm install -g @nicedoc/nicedoc
```

## Step 2: Initialize TWA project
```bash
# In a separate directory (not inside the web project)
mkdir travelko-android && cd travelko-android
bubblewrap init --manifest="https://travel.koinfo.kr/manifest.json"
```

Bubblewrap will ask for:
- **Package name**: `kr.koinfo.travel`
- **App name**: `TravelKo`
- **Signing key**: Create new or use existing

## Step 3: Build APK/AAB
```bash
bubblewrap build
```

This generates:
- `app-release-bundle.aab` (for Google Play)
- `app-release-signed.apk` (for testing)

## Step 4: Get signing key SHA-256 fingerprint
```bash
keytool -list -v -keystore travelko-release.keystore -alias travelko
```

Copy the `SHA256:` fingerprint value.

## Step 5: Update assetlinks.json
Edit `.well-known/assetlinks.json` and replace the placeholder:
```json
"sha256_cert_fingerprints": [
  "AA:BB:CC:DD:... (your actual SHA-256 fingerprint)"
]
```

Deploy the website so the assetlinks.json is live before submitting to Google Play.

## Step 6: Verify Digital Asset Links
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://travel.koinfo.kr&relation=delegate_permission/common.handle_all_urls
```

## Step 7: Test on device
```bash
adb install app-release-signed.apk
```

Verify:
- App opens in full-screen (no browser UI)
- Navigation works correctly
- Offline page shows when disconnected

## Step 8: Google Play Console submission
1. Create new app in Google Play Console
2. Upload `app-release-bundle.aab`
3. Fill in store listing:
   - **Title**: TravelKo - Korea Trip Planner
   - **Short description**: Discover Korea's best travel spots with AI-powered trip planning
   - **Category**: Travel & Local
   - **Content rating**: Everyone
4. Set up Privacy Policy URL: `https://travel.koinfo.kr/privacy`
5. Submit for review

## Important Notes
- The website MUST be deployed with `manifest.json` and `sw.js` working before building
- `assetlinks.json` must be accessible at `https://travel.koinfo.kr/.well-known/assetlinks.json`
- The SHA-256 fingerprint must match the signing key used to build the AAB
- Google Play requires 512x512 app icon and feature graphic (1024x500)
