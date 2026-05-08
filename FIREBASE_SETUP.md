# Firebase Setup For VLadder

This project assumes your Firebase project already exists. VLadder stays a static HTML, CSS, and JavaScript app and uses Cloudflare Pages for hosting.

## Prerequisites

1. Firestore is enabled.
2. Firebase Authentication is enabled.
3. Email and Password sign-in is enabled under Firebase Authentication.

Firebase Storage is intentionally disabled for now because billing is temporarily unavailable. VLadder still supports team member photos through pasted photo URLs.

## Cloudflare Pages Environment Variables

Add these environment variables in Cloudflare Pages for the VLadder project:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID` optional

Use this build command:

```bash
npm run build
```

The app remains static. The build step only generates `firebase-config.js` from the environment variables so the browser can import Firebase config safely.

## Important Security Note

Firebase web config is public browser configuration, not secret server data. Security comes from Firebase Authentication and Firestore security rules.

## Build Output

`scripts/generate-config.mjs` reads the Cloudflare Pages environment variables and writes `firebase-config.js`.

If required values are missing, the build still generates `firebase-config.js`, but the app will show a clear Firebase configuration error instead of white-screening.

## First Admin Setup

1. Deploy the app after setting the Cloudflare Pages environment variables.
2. Visit `admin.html`.
3. If `system/bootstrap` does not exist yet, the one-time `Create First Admin` screen appears.
4. Enter:
   - Name
   - Email
   - Password
   - Confirm Password
5. Submit the form.
6. VLadder creates:
   - The Firebase Authentication user
   - `admins/{uid}`
   - `system/bootstrap`
7. After setup succeeds, the admin dashboard loads.

After `system/bootstrap` exists, the first-admin setup screen disappears permanently and `admin.html` shows the normal admin login flow instead.

## Normal Admin Login

1. Visit `admin.html`.
2. Sign in with the email and password for an existing Firebase Auth admin account.
3. The app checks `admins/{uid}` and only unlocks the dashboard for users whose document has `role: "admin"`.

If a signed-in user does not have an admin document, VLadder blocks the dashboard and signs them back out.

## Firestore Collections Used

### `teamMembers`

- `name`
- `photoUrl`
- `bookedAppointments`
- `demos`
- `estimatedRevenue`
- `active`
- `createdAt`
- `updatedAt`

### `appointmentSubmissions`

- `teamMemberId`
- `teamMemberName`
- `appointmentDate`
- `note`
- `reviewed`
- `createdAt`

### `admins`

- document id must match the Firebase Auth UID
- `email`
- `name`
- `role`
- `createdAt`
- `bootstrapAdmin`

### `system/bootstrap`

- `completed`
- `completedBy`
- `completedAt`
- `adminEmail`

## Team Member Photos

For now, the admin dashboard supports team member photos through pasted photo URLs only.

- paste a public image URL into `Photo / Avatar URL`
- leave the field empty to use initials on the leaderboard
- if the image fails to load, VLadder falls back to initials automatically

Firebase Storage uploads are intentionally disabled until billing is available again. Storage-backed uploads can be added later without changing the public leaderboard flow.

## Deploying Rules And Indexes

Deploy Firestore rules and indexes with the Firebase CLI:

```bash
firebase deploy --only firestore
```

Or use the package script:

```bash
npm run deploy:rules
```

The repo includes:

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`

## Authorized Domains

Add every Cloudflare Pages hostname and every custom domain you use to Firebase Authentication authorized domains.

At minimum, add:

1. the default Cloudflare Pages domain
2. any preview or branch domain you rely on
3. your production custom domain if you use one

If the domain is missing from Firebase Authentication authorized domains, email and password login may fail even when the credentials are correct.

## Troubleshooting

### Missing config

If the public page or admin page says Firebase is not configured, verify the Cloudflare Pages environment variables and rerun the build.

### Permission denied

If reads, submissions, or admin actions fail with permission errors, deploy the latest `firestore.rules` and confirm the signed-in account has an `admins/{uid}` document.

### Auth domain issues

If login or first-admin setup fails with an auth domain error, add the Cloudflare Pages domain and any custom domains to Firebase Authentication authorized domains.

### Setup screen not appearing

If `admin.html` does not show the first-admin setup screen for a brand-new project, confirm the `system/bootstrap` document does not already exist and that Firestore rules are deployed.

### Setup already completed

If the setup screen no longer appears, check whether `system/bootstrap` already exists with `completed: true`. That document intentionally disables bootstrap forever unless you remove it manually.

### Photo URLs not showing

If a team member photo URL does not render, verify the image URL is publicly reachable and allows hotlinking. If the URL fails, VLadder will fall back to initials.