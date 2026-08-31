# RealSignal Cast Sender for Android

This is a native Android companion sender for RealSignal. It uses Google's Android Cast SDK for device discovery and session management, then sends the same `REALSIGNAL_STATE` packet understood by `realsignal_cast_receiver.html`.

## What this solves

- Discovery is owned by Android's Cast framework instead of Chrome/PWA behavior.
- The standard Cast picker is available through `MediaRouteButton`.
- The published receiver ID and RealSignal custom namespace are kept identical to the web sender.
- Native power and channel controls can launch the existing RealSignal Custom Web Receiver.

## Current prerequisites

- Android Studio with the Android SDK installed.
- JDK 17 or newer.
- Android API 35 platform/tools.
- A physical Android device with Google Play services for the discovery test.
- The receiver app `A0A5CD01` must remain published in the Google Cast Developer Console.

On Android 13 and newer, the first launch asks for the Nearby devices permission. Allow it; Android uses that permission for local Wi-Fi media-casting discovery. On Android 12 and older, allow the compatibility location prompt and keep Location turned on while testing discovery.

The current Codex workstation has Java 8 but does not have Android Studio, the Android SDK, or Gradle installed, so the project is source-complete but still needs an Android build environment for an APK build.

## Build

Open this `android-sender` directory in Android Studio, allow Gradle sync, then run the `app` configuration on a physical Android device. Android Studio will create the local Gradle wrapper/cache as part of the normal project setup.

## First device test

1. Put the Android phone and Cast receiver on the same non-guest Wi-Fi network.
2. Open the app and tap the Cast icon.
3. Select the receiver from the native Cast dialog.
4. Leave Power on and tap Send state. The receiver should load RealSignal and show the selected channel.
5. Change the channel and tap Send state again. The receiver should receive the new channel without another discovery step.
