---
name: phone-preview
description: Run the Delta Reservations mobile app (Expo Go) on the owner's Android phone over USB and take screenshots of it with adb, so Claude can see the app. Use when asked to run, preview, show or screenshot the app on the phone, to check a UI change on the device, or when the phone, Metro or adb need to be reconnected.
---

# Preview the app on the phone

By default the app talks to the **production API** (`https://airtable-reservation-form.vercel.app`, which currently serves the Neon `dev` branch: nine apartments with made-up details and 25 fake reservations, see ADR 0005). Only Metro (the Expo dev server) runs locally. Claude sees the screen through adb screenshots; the owner sees it on the phone.

## Prerequisites

- Phone connected by USB with USB debugging on, awake and unlocked, with **Expo Go** installed (package `host.exp.exponent`).
- `adb`. If it is not on PATH in the current session, use the WinGet install:
  `$adb = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe"`
- `apps/mobile/.env.local` must **not** exist (it would point the app at a local API). Never print secrets from any env file.

## Steps (PowerShell, from the repo root)

1. **Check the phone:** `adb devices` must list a serial with state `device`.
   - `unauthorized`: the owner accepts the prompt on the phone.
   - Empty list or a hang: `Get-Process adb | Stop-Process -Force`, then `adb start-server`, then check again (check the cable and USB debugging if it stays empty).
2. **Forward Metro's port:** `adb reverse tcp:8081 tcp:8081`. Repeat after every reconnect of the cable. Avoid `adb reverse --list`: it can hang the adb server (restart it as in step 1).
3. **Start Metro in the background** from `apps/mobile`: `npx expo start --port 8081 -c` (`-c` clears the cache, so env and config changes apply). Wait until `http://127.0.0.1:8081/status` answers `packager-status:running`; a cold start takes about a minute.
   - If port 8081 is already taken, find the owner with `Get-NetTCPConnection -LocalPort 8081 -State Listen`. Ask before stopping something the owner started.
4. **Open the app in Expo Go:** wake the phone with `adb shell input keyevent KEYCODE_WAKEUP`, then
   `adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081" host.exp.exponent`.
   The first bundle takes about 40 seconds.
5. **Take a screenshot.** Windows PowerShell 5.1 corrupts binary redirection, so go through `cmd`:
   `cmd /c "`"$adb`" exec-out screencap -p > `"<scratchpad>\shot.png`""`
   then read the PNG. Use the session scratchpad directory for screenshots and never commit them.

## Interacting with the app

- Tap `adb shell input tap X Y`, swipe `adb shell input swipe x1 y1 x2 y2 <ms>`, back `adb shell input keyevent KEYCODE_BACK`. Coordinates are in pixels of the screenshot (for example 2340x1080 in landscape).
- Code changes show up through Fast Refresh. If the screen looks stale (for example a scroll position left from an earlier session), force-stop and reopen: `adb shell am force-stop host.exp.exponent`, then step 4.
- To test landscape: `adb shell settings put system accelerometer_rotation 0` then `adb shell settings put system user_rotation 1` (0 is portrait). Afterwards restore the phone's automatic rotation with `adb shell settings put system accelerometer_rotation 1`. Relaunching Expo Go can reset the orientation; set it again.
- The round gear at the top right is Expo Go's developer menu button, not part of the app.
- When finished, stop the Metro background task and check that port 8081 is free.

## Optional: test API changes locally against the Neon dev branch

Only when a change in `api/` must be tried before it is deployed:

1. `npm run dev:api` from the repo root serves `api/` on `http://127.0.0.1:3000` against the Neon `dev` branch. It refuses unsafe settings (role `delta_app`, branch `dev`). Restart it after editing a file in `api/`.
2. `adb reverse tcp:3000 tcp:3000`.
3. Create `apps/mobile/.env.local` (git-ignored) containing `EXPO_PUBLIC_API_URL=http://localhost:3000`, and restart Metro with `-c`.

Go back to production by deleting that file, restarting Metro with `-c` and stopping the local API.

## Troubleshooting

- **"Could not load calendar" in the app:** check `curl https://airtable-reservation-form.vercel.app/api/calendar?month=YYYY-MM`. Also check that no `apps/mobile/.env.local` points at a local API that is not running.
- **Expo Go reports an incompatible SDK:** the app is on Expo SDK 58; update Expo Go on the phone.
- **Blank screen after the first launch:** wait for the first bundle (watch the Metro output), then relaunch.
- **The data looks old:** the seeded reservations are laid out relative to the day the seed ran; see "Seeding the dev branch" in `docs/database-migrations.md`.
