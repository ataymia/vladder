# The VLadder

Static HTML/CSS/JS live appointment leaderboard with Firebase Firestore.

## Files

- `/home/runner/work/vladder/vladder/index.html` – team page for live leaderboard + appointment submissions
- `/home/runner/work/vladder/vladder/admin.html` – password-gated admin page
- `/home/runner/work/vladder/vladder/styles.css` – navy/black polished visual design
- `/home/runner/work/vladder/vladder/app.js` – team page live Firestore logic
- `/home/runner/work/vladder/vladder/admin.js` – admin member/submission management logic
- `/home/runner/work/vladder/vladder/firebase.js` – shared Firebase app + Firestore setup

## Setup

1. Create a Firebase project and enable Firestore.
2. Copy `/home/runner/work/vladder/vladder/config.example.js` to `/home/runner/work/vladder/vladder/config.js` and fill in Firebase credentials + admin password.
3. Open `/home/runner/work/vladder/vladder/index.html` in a browser.

## Firestore Collections

- `members`: `name`, `photoUrl`, `appointmentsBooked`, `demos`, `revenue`, `bonusTier`, timestamps
- `submissions`: `memberId`, `memberName`, `appointmentDate`, `booked`, `createdAt`
