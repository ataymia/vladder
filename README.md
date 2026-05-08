# The VLadder (Vault Roofing)

The VLadder is a static HTML/CSS/JS leaderboard app for Vault Roofing with real-time Firebase Firestore updates.

## Files

- `/home/runner/work/vladder/vladder/index.html` — team-facing live leaderboard and quick submission form
- `/home/runner/work/vladder/vladder/admin.html` — password-gated management dashboard
- `/home/runner/work/vladder/vladder/styles.css` — dark navy/black polished UI theme
- `/home/runner/work/vladder/vladder/firebase.js` — Firebase initialization and shared Firestore exports
- `/home/runner/work/vladder/vladder/app.js` — public leaderboard logic (sorting tabs, realtime cards, animated reordering)
- `/home/runner/work/vladder/vladder/admin.js` — admin member/submission management logic
- `/home/runner/work/vladder/vladder/config.example.js` — Firebase config template
- `/home/runner/work/vladder/vladder/config.js` — local Firebase config file

## Setup

1. Create a Firebase project and enable Firestore.
2. Copy `/home/runner/work/vladder/vladder/config.example.js` to `/home/runner/work/vladder/vladder/config.js`.
3. Fill in Firebase values in `config.js`.
4. Set `ADMIN_PASSWORD` in `/home/runner/work/vladder/vladder/admin.js`.
5. Open `/home/runner/work/vladder/vladder/index.html`.

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
