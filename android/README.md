# Empire Streets for Android

A full-screen WebView app that ships the built game inside the APK. Nothing is downloaded at
run time; it plays offline. The game detects the app and shows its touch controls (a stick on the
left, buttons on the right, drag to look) and uses its phone graphics profile.

## Build it

1. Build the web game and copy it into the app (from the project folder):

   ```bash
   npm run build
   scripts/android-sync.sh        # copies dist/ into android/app/src/main/assets/www/
   ```

   If `npm run build` fails with *Cannot find module @rollup/rollup-…* (rollup's native binary
   isn't installed for this machine, e.g. node_modules copied from another OS), use the esbuild
   build instead; it makes the same `dist/`: `npm run build:android:esbuild`.

2. Open the `android` folder in **Android Studio** (Hedgehog 2023.1 or newer, with an Android SDK
   34 and JDK 17: Studio installs both). Let it sync Gradle.
3. Plug in a phone with USB debugging on (or start an emulator with Play services and GPU
   acceleration) and press **Run**. For a shareable APK: **Build → Build Bundle(s) / APK(s) →
   Build APK(s)**; it lands in `app/build/outputs/apk/debug/`.

For a Play Store build use **Build → Generate Signed Bundle / APK** and sign it with your own key.

## Build it without Android Studio (GitHub Actions)

Push the project to GitHub and the **Android APK** workflow (`.github/workflows/android.yml`)
builds the game, copies it in and runs Gradle with the Android SDK. Open the run under
**Actions → Android APK** and download `empire-streets-apk`; tag a commit `v1.1` (for example)
and the APK is also attached to a GitHub release. It's debug-signed: allow "Install unknown apps"
for the app you open it from.

## Controls on a phone

- **Move**: touch anywhere on the left third and drag: the stick appears under your thumb.
  Push it all the way out to sprint (or tap RUN to lock a sprint on).
- **Look**: drag anywhere on the right. While you aim or fire a gun, the view eases onto the
  target nearest the crosshair (police first); your thumb always wins.
- **The green pill** low in the middle of the screen says what you can do right here and does it: *Go into
  Sal's Corner Deli*, *Talk*, *Get in the Sedan*, *Climb out*, *Open the vault box*, *Climb down
  to the deep drains*… It's the E key of the desktop game.
- On foot: JUMP, FIRE, AIM (tap to hold), FIGHT, THROW, WPN, RUN, USE; TEAM, MAP and QUICK along
  the top. Driving: GAS (or push the stick forward), BRAKE, HAND, NOS, HORN, CAM, OUT.
- Conversations, shops and menus are tapped directly. Back pauses; the buttons buzz lightly.

## Phone performance

On a phone the game starts at a lower pixel ratio with smaller shadows, a shorter draw distance,
and a thinner crowd (fewer people, less traffic, fewer wild Streetmon and flyers: 50–70% of the
desktop numbers depending on the phone). The dynamic resolution scaler adjusts from there. The
app asks Android for sustained-performance clocks where the phone supports it, so it doesn't
throttle after ten minutes.

## What's inside

- `app/src/main/java/.../MainActivity.kt`: the WebView. The files are served by
  `WebViewAssetLoader` from `https://appassets.androidplatform.net/assets/www/`, a secure origin,
  so ES modules, `fetch`, WebGL 2, Web Audio and local storage behave as in Chrome. The user agent
  gets an `EmpireStreets/1.0` suffix the game checks. Back pauses and resumes; the app pauses the
  game when it goes to the background; the screen stays on.
- `app/build.gradle.kts`: minSdk 26 (Android 8), targetSdk 34, `noCompress` for the models, music
  and bundles so they are read straight from the APK.
- `app/src/main/assets/www/`: the game, written by `scripts/android-sync.sh` (ignored by git).

## Size and performance

The APK is about the size of `dist/` (~90 MB, mostly music and models). On a phone the game
starts at a lower pixel ratio, with smaller shadow maps, no bloom and a shorter draw distance; the
resolution scaler adjusts from there. A 2020-or-newer mid-range phone runs it at 30-60 fps.

## The other way: install from the web

The published site (GitHub Pages) is a PWA: open it in Chrome on Android and choose **Add to Home
screen**. It installs with the same icon, runs full screen in landscape and works offline once
loaded. No APK needed.
