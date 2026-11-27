# Push notifications (FCM)

Status: wired end-to-end on mobile, inert until a Firebase project is added.

```
write (referral, session, grade, ADM, …)
  └─ fanoutNotification()          backend/src/lib/notify.ts
       ├─ Notification row         (in-app inbox, realtime, cache bust)
       └─ sendPushToUser()         backend/src/lib/push.ts
            └─ FCM multicast → DeviceToken rows (per user)
                 └─ mobile push_service.dart
                      ├─ foreground → local notification (Z icon)
                      └─ tap → go_router destination + mark read
```

`_self` notification types (the actor's own action echoing back) never push.

## 1. Backend

- **Model** `DeviceToken` (`backend/prisma/schema.prisma`): `userId`, unique
  `token`, `platform`, `createdAt`, `lastSeenAt`. Migration:
  `prisma/migrations/20261125100000_device_tokens`. Apply by hand like every
  other migration in this repo (`prisma migrate deploy` cannot bootstrap).
- **Endpoints** (`backend/src/modules/notifications/notifications.routes.ts`):
  - `POST /api/notifications/device-token` `{ token, platform }` — upsert for
    the signed-in user (an account switch on the same device re-points the row).
  - `POST /api/notifications/device-token/unregister` `{ token }` — removes
    only that user's row (sent on sign-out).
- **Env**: `FIREBASE_SERVICE_ACCOUNT_JSON` — service-account JSON, raw or
  base64. Empty ⇒ push is a no-op (development, CI, tests). Get it from
  Firebase console → Project settings → Service accounts → Generate new private
  key. Never commit it.
- **Sending**: `sendPushToUser` batches 500 tokens, uses Android channel
  `zentra_default` + `ic_stat_zentra`, the in-app blue accent `#2563EB`, and
  APNs `thread-id` = notification type. Notifications are deliberately
  text-only (no `imageUrl`): a BigPicture image collapses the body, and the
  message is the whole point. Tokens FCM reports as unregistered or invalid are
  deleted automatically. All failures are logged and swallowed — a push problem
  can never fail the write that triggered it.
- **Titles**: `pushTitle(type, sourceTable)` in `lib/push.ts` is intentionally a
  small type map (no message sniffing). The in-app inbox keeps its richer
  client-side label maps.

## 2. Mobile

- **Build config** (no `google-services.json` required — explicit
  `FirebaseOptions`):

  ```bash
  cp .env.example .env        # fill API_BASE_URL + FIREBASE_*
  flutter run --dart-define-from-file=.env
  ```

  The equivalent one-off form:

  ```bash
  flutter run \
    --dart-define=API_BASE_URL=http://10.0.2.2:4000 \
    --dart-define=FIREBASE_API_KEY=... \
    --dart-define=FIREBASE_APP_ID=... \
    --dart-define=FIREBASE_MESSAGING_SENDER_ID=... \
    --dart-define=FIREBASE_PROJECT_ID=...
  ```

  Optional: `FIREBASE_STORAGE_BUCKET`, `FIREBASE_IOS_BUNDLE_ID`. If the four
  required values are missing, `PushConfig.configured` is false and everything
  is skipped — the app builds and runs exactly as before. `mobile/.env` is
  gitignored; `mobile/.env.example` is the tracked template.

- **Readiness checks** (no credentials needed):
  - mobile: the first boot logs `[push] FCM not configured — push notifications
    are off.` while the defines are empty, and nothing at all once they land.
  - backend: boot log `Push notifications enabled|disabled`, and
    `GET /health` → `{ "status": "ok", "push": true|false }`.

- **Lifecycle** (`lib/core/push_service.dart`): `main.dart` boots the service
  after the router exists and attaches `router.go`; the background handler is
  registered before `runApp`. `AuthNotifier.login()` registers the device,
  `logout()` unregisters it, and `onTokenRefresh` re-registers rotated tokens.
  Session restore re-registers via the auth listener in `main.dart`.

- **Foreground**: FCM's OS banner is suppressed (`alert: false`) and
  `flutter_local_notifications` draws the notice instead, so the Z icon, blue
  accent and BigText body are identical on both paths.

- **Background / killed**: the backend `notification` payload is drawn by the
  OS: title, full body text (no image), white silhouette in the status bar and
  the accent blue.

- **Icons** (`android/app/src/main/res/`):
  - `drawable-*/ic_stat_zentra.png` — white-only silhouette of the Z + orbit +
    star mark (status-bar icons are a single-colour mask; a colour logo would
    render as a white blob). Generated from `assets/zentra.png` at
    24/36/48/72/96 px.
  - `drawable-nodpi/ic_zentra_large.png` — the same logo in full colour on a
    white background (192 px) for the expanded view, so it matches the app's
    light screens instead of inheriting the system notification background.
  - `values/colors.xml` → `zentra_accent` (`#2563EB`, matching the in-app
    unread blue); manifest meta-data sets the default icon, colour and channel
    so background pushes look the same as the foreground local notices.
  - Regenerate both from the source logo with
    `python3 scripts/gen_push_icons.py`; the invariant is: small icon = pure
    white mask, large icon = colour logo, both trimmed to the artwork.

- **Permissions**: `POST_NOTIFICATIONS` in the manifest (requested after first
  sign-in via `FirebaseMessaging.requestPermission`). iOS uses the standard
  system prompt and needs `UIBackgroundModes → remote-notification`
  (`ios/Runner/Info.plist`).

## 3. Tap routing

`pushDestination()` resolves one route for foreground, background and
cold-start taps. The same resolver is used for `getInitialMessage`, so a tap
that launches the app lands directly on the right screen.

| Notification | Destination |
| --- | --- |
| `interventions` / `intervention_detected` | `/adviser/interventions` |
| `referrals`, `counseling_sessions` | `/adviser/referrals` |
| `adm_*` (cases, meetings, devices, modules) | `/adviser/adm-cases` |
| grades, finals, grade flags | `/workspace/gradebook` |
| attendance | `/workspace/attendance` |
| timetable / schedule | `/adviser/schedule` |
| advisory modules | `/adviser/academic` |
| coordinator desk | `coordinatorNotificationTarget` (`/coordinator/*`) |
| student / parent portals | `portalNotificationTarget` (`/<portal>/modules` or `/<portal>/home`) |
| anything else | `/workspace/overview` |

Opening a push marks that notification read (`POST /api/notifications/read/:id`)
before navigating. Subject teachers never get adviser routes — their rows fall
back to the workspace screens instead.

## 4. Firebase setup checklist

1. Create the Firebase project, add an Android app with application id
   `com.msat.zentra.zentra_mobile` (and an iOS app for the bundle id in Xcode).
2. Backend: paste the service-account JSON into `FIREBASE_SERVICE_ACCOUNT_JSON`
   (`.env` locally, secret manager in deploy).
3. Mobile: pass the four `FIREBASE_*` dart-defines in the build/CI recipe.
4. iOS only: upload an APNs auth key in Firebase → Project settings → Cloud
   Messaging, then enable the Push Notifications capability + background
   remote-notifications for the Runner target.
5. Send a test from Firebase console → Messaging → New campaign; confirm the Z
   icon in the status bar, the coloured large icon in the expanded view, and
   that tapping opens the mapped screen.

## 5. Not in scope

- Web push (the Next.js app uses Supabase realtime + the in-app bell).
- Sending email/SMS.
- Per-user notification preferences (muting a desk) — the fanout ignores
  `Notification.channel` for now; add filtering there if preferences arrive.
