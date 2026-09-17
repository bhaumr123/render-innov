# tripcraft-app/mobile

A minimal native Android (Kotlin) client for TripCraft. It has a single
screen that calls the backend's `GET /api/health` endpoint and displays
the returned status, uptime, and timestamp (with a button to re-check).

It's the **output** of FeatureForge's `mobile` stream, built by describing
features to `POST /api/features/mobile/plan`, reviewing the diff, then
`POST /api/features/mobile/apply`.

## Project layout

- `app/src/main/java/com/tripcraft/mobile/MainActivity.kt` — the single
  screen; checks health on load and via a button.
- `app/src/main/java/com/tripcraft/mobile/network/` — Retrofit API
  interface and client pointed at the backend.
- `app/src/main/res/xml/network_security_config.xml` — allows plain HTTP
  to `10.0.2.2` (the Android emulator's alias for the host machine's
  `localhost`), since Android blocks cleartext HTTP to non-localhost
  hosts by default.

## Running against the backend

1. In `tripcraft-app/backend` (the `fullstack` stream's output), run
   `npm install && npm start` — this serves the API on `http://localhost:3001`.
2. Open this `mobile/` directory in Android Studio, let Gradle sync (this
   also generates the Gradle wrapper's binary jar — not something a
   text-only tool can produce), and run the app on an emulator.
3. The emulator reaches the host machine's `localhost:3001` via the
   special address `10.0.2.2`, which is what `ApiClient.kt` uses as the
   base URL. If running against a real deployed backend instead, update
   `BASE_URL` in `ApiClient.kt` to an `https://` URL and remove the
   cleartext exception in the network security config.

**Building a real APK from this needs Android Studio (or the Android SDK
+ Gradle) on your own machine.** FeatureForge generates real, valid Kotlin
source and Gradle build files, but it can't compile or package an APK
itself — that needs the Android SDK's build tools (`aapt2`, `d8`,
`apksigner`), which live only on Google's servers and aren't reachable from
where FeatureForge runs. Clone this directory, open it in Android Studio,
let it sync, and build from there.
