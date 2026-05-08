import {
  addDoc,
  collection,
  config,
  db,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from './firebase.js';

const memberSelect = document.getElementById('member-select');
const dateInput = document.getElementById('appointment-date');
const appointmentsInput = document.getElementById('appointments-booked');
const submissionForm = document.getElementById('submission-form');
const statusLine = document.getElementById('submission-status');
const leaderboardEl = document.getElementById('leaderboard');
const updatedLine = document.getElementById('last-updated');

const defaultPhoto = config.defaultPhotoUrl || 'https://via.placeholder.com/120x120.png?text=VL';
let members = [];

const formatMoney = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const compareMembers = (a, b) =>
  Number(b.appointmentsBooked || 0) - Number(a.appointmentsBooked || 0) ||
  Number(b.demos || 0) - Number(a.demos || 0) ||
  Number(b.revenue || 0) - Number(a.revenue || 0) ||
  (a.name || '').localeCompare(b.name || '');

const setStatus = (message, isError = false) => {
  statusLine.textContent = message;
  statusLine.className = `status ${message ? (isError ? 'error' : 'success') : ''}`.trim();
};

const updateMemberSelect = () => {
  const previousValue = memberSelect.value;
  memberSelect.innerHTML = '';

  if (!members.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No members available yet';
    memberSelect.append(option);
    memberSelect.disabled = true;
    return;
  }

  memberSelect.disabled = false;
  members.forEach((member) => {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = member.name;
    memberSelect.append(option);
  });

  if (members.some((member) => member.id === previousValue)) {
    memberSelect.value = previousValue;
  }
};

const renderLeaderboard = () => {
  const cards = Array.from(leaderboardEl.children).reduce((acc, child) => {
    acc[child.dataset.memberId] = child;
    return acc;
  }, {});

  const firstRects = {};
  Object.entries(cards).forEach(([id, node]) => {
    firstRects[id] = node.getBoundingClientRect();
  });

  leaderboardEl.innerHTML = '';

  members.forEach((member, index) => {
    const rank = index + 1;
    const card = document.createElement('article');
    card.className = `member-card rank-${rank}`;
    card.dataset.memberId = member.id;
    card.innerHTML = `
      <div class="rank-pill">#${rank}</div>
      <img class="member-photo" src="${member.photoUrl || defaultPhoto}" alt="${member.name}" loading="lazy" />
      <div>
        <div class="member-name">${member.name}</div>
        <div class="metrics">
          <span>Booked: <strong>${Number(member.appointmentsBooked || 0)}</strong></span>
          <span>Demos: <strong>${Number(member.demos || 0)}</strong></span>
          <span>Revenue: <strong>${formatMoney(member.revenue)}</strong></span>
          <span>Bonus Tier: <strong>${member.bonusTier || 'Starter'}</strong></span>
        </div>
      </div>
      <div class="metric-highlight">
        ${Number(member.appointmentsBooked || 0)}
        <span>appointments</span>
      </div>
    `;
    leaderboardEl.append(card);

    const oldRect = firstRects[member.id];
    if (oldRect) {
      const newRect = card.getBoundingClientRect();
      const deltaY = oldRect.top - newRect.top;
      if (Math.abs(deltaY) > 0.5) {
        card.animate(
          [
            { transform: `translateY(${deltaY}px)` },
            { transform: 'translateY(0)' },
          ],
          { duration: 360, easing: 'ease-out' },
        );
      }
    }
  });
};

const subscribeMembers = () => {
  const membersQuery = query(collection(db, 'members'));
  onSnapshot(
    membersQuery,
    (snapshot) => {
      members = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .sort(compareMembers);
      updateMemberSelect();
      renderLeaderboard();
      updatedLine.textContent = `Last updated ${new Date().toLocaleTimeString()}`;
    },
    (error) => {
      setStatus(`Live update failed: ${error.message}`, true);
    },
  );
};

const initializeForm = () => {
  dateInput.valueAsDate = new Date();

  submissionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Submitting...');

    const memberId = memberSelect.value;
    const member = members.find((item) => item.id === memberId);
    const booked = Number(appointmentsInput.value);

    if (!memberId || !member) {
      setStatus('Select a valid team member.', true);
      return;
    }
    if (!Number.isFinite(booked) || booked < 1) {
      setStatus('Booked appointments must be at least 1.', true);
      return;
    }

    try {
      const memberRef = doc(db, 'members', memberId);
      await runTransaction(db, async (transaction) => {
        const memberSnap = await transaction.get(memberRef);
        if (!memberSnap.exists()) {
          throw new Error('Member not found.');
        }

        const currentAppointments = Number(memberSnap.data().appointmentsBooked || 0);
        transaction.update(memberRef, { appointmentsBooked: currentAppointments + booked });
        transaction.set(doc(collection(db, 'submissions')), {
          memberId,
          memberName: member.name,
          appointmentDate: dateInput.value,
          booked,
          createdAt: serverTimestamp(),
        });
      });

      submissionForm.reset();
      dateInput.valueAsDate = new Date();
      setStatus('Submission recorded successfully.');
    } catch (error) {
      setStatus(`Unable to submit: ${error.message}`, true);
    }
  });
};

subscribeMembers();
initializeForm();
