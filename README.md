# VLadder

VLadder is a static HTML, CSS, and JavaScript leaderboard app with a public live scoreboard, modal appointment logging, and a Firebase-protected admin dashboard.

## Key Files

- `index.html` — public live leaderboard shell
- `admin.html` — admin bootstrap, login, and dashboard shell
- `styles.css` — shared UI styles for public and admin screens
- `app.js` — public leaderboard and appointment submission logic
- `admin.js` — Firebase-authenticated admin dashboard logic
- `firebase.js` — shared Firebase initialization and helpers
- `firebase-config.js` — generated browser Firebase config module
- `scripts/generate-config.mjs` — Cloudflare Pages build-time config generator
- `firestore.rules` — Firestore security rules
- `firebase.json` — Firebase deploy config for rules and indexes
- `FIREBASE_SETUP.md` — end-to-end Cloudflare Pages and Firebase setup guide

## Setup

See `FIREBASE_SETUP.md` for the full Firebase, Cloudflare Pages, Auth, Firestore, bootstrap-admin, and rules deployment workflow.
