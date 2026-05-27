# ChillBill — Android (Capacitor)

The React web app is wrapped as a native Android app with [Capacitor](https://capacitorjs.com/).
The WebView loads the bundled `dist/` build and talks to the production API.

## Layout

- `capacitor.config.ts` — app id `com.skdev.chillbill`, name `ChillBill`, `webDir: dist`
- `android/` — generated native Android project (commit it)
- `.env.production` — `VITE_API_BASE` + `VITE_GOOGLE_CLIENT_ID` used for native/prod builds

## Build & run

```bash
cd apps/web

# Build web + copy into the native project
npm run cap:sync

# Open in Android Studio (build / run / sign there)
npm run cap:open

# …or build & launch on a connected device/emulator directly
npm run cap:run
```

`cap:sync` runs `vite build` then `npx cap sync android`, so it always ships the
latest web build and plugins.

Requires the Android SDK and **JDK 21** (Capacitor 8 compiles against source 21;
JDK 17 fails with `invalid source release: 21`). Android Studio bundles a JDK 21
you can point at:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

# Command-line debug build (APK at app/build/outputs/apk/debug/app-debug.apk):
cd android && ./gradlew assembleDebug
```

## Google Sign-In on native

Native sign-in uses `@codetrix-studio/capacitor-google-auth`. Unlike the web
redirect flow, it returns a Google **ID token** that the app posts to
`POST /api/v1/auth/google/token`; the backend verifies it with `google-auth`
and returns our JWT pair.

To make it work you must set up Google credentials:

1. **Google Cloud Console → Credentials**
   - Create an **Android** OAuth client:
     - Package name: `com.skdev.chillbill`
     - SHA-1: from your signing key, e.g.
       `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
       (use the release keystore's SHA-1 for production builds).
   - You also need the existing **Web application** OAuth client ID — this is the
     value used as `serverClientId`/`clientId` for the plugin and as the audience
     the backend verifies against.

2. **Frontend** — set in `apps/web/.env.production`:
   ```
   VITE_GOOGLE_CLIENT_ID=<your-WEB-application-client-id>
   VITE_API_BASE=https://chillbill-api.skdev.one/api/v1
   ```
   The plugin is initialized with this client ID in `GoogleSignInButton.jsx`.

3. **Backend** — `GOOGLE_CLIENT_ID` must equal that same Web client ID, since the
   native ID token's `aud` is the Web client ID and the backend validates it.

After changing env or credentials, re-run `npm run cap:sync`.

> The web build is unchanged: in a browser `Capacitor.isNativePlatform()` is
> false, so it keeps using the server-side `/auth/google/login` redirect flow.
