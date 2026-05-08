# The VLadder (Vault Roofing)

The VLadder is a static HTML/CSS/JS leaderboard app for Vault Roofing with real-time Firebase Firestore updates.

## Files

- `index.html` — team-facing live leaderboard and quick submission form
- `admin.html` — password-gated management dashboard
- `styles.css` — dark navy/black polished UI theme
- `firebase.js` — Firebase initialization and shared Firestore exports
- `app.js` — public leaderboard logic (sorting tabs, realtime cards, animated reordering)
- `admin.js` — admin member/submission management logic
- `config.example.js` — Firebase config template
- `config.js` — local Firebase config file

## Setup

1. Create a Firebase project and enable Firestore.
2. Copy `config.example.js` to `config.js`.
3. Fill in Firebase values in `config.js`.
4. Set `ADMIN_PASSWORD` in `admin.js` (or set `adminPassword` in `config.js`).
5. Open `index.html`.

## Firestore Collections

### `teamMembers`

- `name` (string)
- `photoUrl` (string)
- `bookedAppointments` (number)
- `demos` (number)
- `estimatedRevenue` (number)
- `active` (boolean)
- `createdAt`, `updatedAt`

### `appointmentSubmissions`

- `teamMemberId` (string)
- `teamMemberName` (string)
- `appointmentDate` (YYYY-MM-DD string)
- `note` (string)
- `reviewed` (boolean)
- `createdAt`

## Notes

- Public page only allows submissions for existing team members.
- Booked appointments are incremented atomically with Firestore `increment(1)` in a transaction.
- Leaderboard supports ranking tabs: Booked Appointments, Demos, and Estimated Revenue.
- Admin can add/edit/deactivate team members, filter/mark/delete submissions, and manually correct stats.
- `admin.html` password gating is client-side only and not secure for public internet exposure. Use real server-side authentication for production security.
