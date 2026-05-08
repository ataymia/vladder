import {
  collection,
  db,
  doc,
  firebaseInitError,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
} from './firebase.js';

const memberSearchInput = document.getElementById('member-search');
const memberOptions = document.getElementById('member-options');
const dateInput = document.getElementById('appointment-date');
const noteInput = document.getElementById('appointment-note');
const noteCount = document.getElementById('note-count');
const submissionForm = document.getElementById('submission-form');
const submissionStatus = document.getElementById('submission-status');
const leaderboardStatus = document.getElementById('leaderboard-status');
const leaderboardEl = document.getElementById('leaderboard');
const updatedLine = document.getElementById('last-updated');
const tabButtons = Array.from(document.querySelectorAll('.tab'));
const submissionModal = document.getElementById('submission-modal');
const submissionModalBackdrop = document.getElementById('submission-modal-backdrop');
const openSubmissionModalButton = document.getElementById('open-submission-modal');
const closeSubmissionModalButton = document.getElementById('close-submission-modal');
const cancelSubmissionModalButton = document.getElementById('cancel-submission-modal');

const DEFAULT_PHOTO =
  (window.VLADDER_CONFIG && window.VLADDER_CONFIG.defaultPhotoUrl) ||
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=240&q=80';

let allMembers = [];
let displayMembers = [];
let sortMode = 'bookedAppointments';
const previousRanks = new Map();
const recentlyUpdated = new Set();
const sortLabels = {
  bookedAppointments: 'Booked Appointments',
  demos: 'Demos',
  estimatedRevenue: 'Estimated Revenue',
};

let submissionSuccessTimeoutId = null;
let modalReturnFocusTarget = null;

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const calculateDemoRate = (demos) => {
  const parsed = Number(demos || 0);
  if (parsed >= 60) return 10;
  if (parsed >= 40) return 7;
  if (parsed >= 20) return 5;
  return 0;
};

const calculateBonusEstimate = (demos) => Number(demos || 0) * calculateDemoRate(demos);

const formatTier = (demos) => `$${calculateDemoRate(demos)}/demo tier`;
const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatSortMetric = (member, mode) => {
  if (mode === 'estimatedRevenue') {
    return formatCurrency(member.estimatedRevenue);
  }
  return Number(member[mode] || 0).toLocaleString('en-US');
};

const clearSubmissionSuccessTimer = () => {
  if (!submissionSuccessTimeoutId) return;
  window.clearTimeout(submissionSuccessTimeoutId);
  submissionSuccessTimeoutId = null;
};

const setStatus = (target, message, isError = false) => {
  target.textContent = message;
  target.className = `status ${message ? (isError ? 'error' : 'success') : ''}`.trim();
};

const sortMembers = (members, mode) => {
  const metric = (member, key) => Number(member[key] || 0);
  return members.slice().sort((a, b) => {
    const metricDiff = metric(b, mode) - metric(a, mode);
    if (metricDiff !== 0) return metricDiff;

    const tieBreakers = [
      ['demos', metric(b, 'demos') - metric(a, 'demos')],
      ['bookedAppointments', metric(b, 'bookedAppointments') - metric(a, 'bookedAppointments')],
      ['estimatedRevenue', metric(b, 'estimatedRevenue') - metric(a, 'estimatedRevenue')],
    ];

    for (const [, diff] of tieBreakers) {
      if (diff !== 0) return diff;
    }

    return (a.name || '').localeCompare(b.name || '');
  });
};

const buildBadges = (member, index, leaders, movedUp) => {
  const badges = [];
  if (index === 0) badges.push('Champion');
  if (member.id === leaders.topBookerId) badges.push('Top Booker');
  if (member.id === leaders.demoLeaderId) badges.push('Demo Leader');
  if (member.id === leaders.revenueLeaderId) badges.push('Revenue Leader');
  if (movedUp) badges.push('Climber');
  return badges;
};

const updateMemberAutocomplete = () => {
  const previous = memberSearchInput.value;
  memberOptions.innerHTML = '';

  if (!allMembers.length) {
    memberSearchInput.value = '';
    memberSearchInput.disabled = true;
    memberSearchInput.placeholder = 'No team members available yet';
    return;
  }

  memberSearchInput.disabled = false;
  memberSearchInput.placeholder = 'Type a team member name';
  allMembers
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .forEach((member) => {
      const option = document.createElement('option');
      option.value = member.name;
      memberOptions.append(option);
    });

  const exactExists = allMembers.some((member) => member.name === previous);
  memberSearchInput.value = exactExists ? previous : '';
};

const findMemberBySearchValue = () => {
  const normalized = memberSearchInput.value.trim().toLowerCase();
  return allMembers.find((member) => (member.name || '').toLowerCase() === normalized);
};

const closeSubmissionModal = ({ restoreFocus = true, clearStatus = false } = {}) => {
  if (!submissionModal) return;

  clearSubmissionSuccessTimer();
  submissionModal.classList.add('hidden');
  submissionModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');

  if (clearStatus) {
    setStatus(submissionStatus, '');
  }

  const focusTarget = modalReturnFocusTarget || openSubmissionModalButton;
  if (restoreFocus && focusTarget?.focus) {
    focusTarget.focus();
  }
};

const openSubmissionModal = () => {
  if (!submissionModal || openSubmissionModalButton?.disabled) return;

  clearSubmissionSuccessTimer();
  modalReturnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : openSubmissionModalButton;
  submissionModal.classList.remove('hidden');
  submissionModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setStatus(submissionStatus, '');

  const focusTarget = memberSearchInput.disabled ? dateInput : memberSearchInput;
  focusTarget.focus();
};

const bindSubmissionModal = () => {
  openSubmissionModalButton?.addEventListener('click', openSubmissionModal);
  closeSubmissionModalButton?.addEventListener('click', () => closeSubmissionModal({ clearStatus: true }));
  cancelSubmissionModalButton?.addEventListener('click', () => closeSubmissionModal({ clearStatus: true }));
  submissionModalBackdrop?.addEventListener('click', () => closeSubmissionModal({ clearStatus: true }));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && submissionModal && !submissionModal.classList.contains('hidden')) {
      closeSubmissionModal({ clearStatus: true });
    }
  });
};

const renderLeaderboard = () => {
  const previousCards = Array.from(leaderboardEl.children).reduce((map, card) => {
    map.set(card.dataset.memberId, card.getBoundingClientRect());
    return map;
  }, new Map());

  leaderboardEl.innerHTML = '';

  if (!displayMembers.length) {
    setStatus(leaderboardStatus, 'No active team members yet. Ask admin to add members.');
    return;
  }

  setStatus(leaderboardStatus, 'Leaderboard updated');

  const leaders = {
    topBookerId: sortMembers(displayMembers, 'bookedAppointments')[0]?.id,
    demoLeaderId: sortMembers(displayMembers, 'demos')[0]?.id,
    revenueLeaderId: sortMembers(displayMembers, 'estimatedRevenue')[0]?.id,
  };

  displayMembers.forEach((member, index) => {
    const rank = index + 1;
    const previousRank = previousRanks.get(member.id) || rank;
    const movedUp = rank < previousRank;
    const badges = buildBadges(member, index, leaders, movedUp);
    const badgeMarkup = badges.length
      ? `<div class="badge-row">${badges.map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`).join('')}</div>`
      : '';
    const bonusEstimate = calculateBonusEstimate(member.demos);
    const highlightValue = escapeHtml(formatSortMetric(member, sortMode));
    const highlightLabel = escapeHtml(sortLabels[sortMode] || 'Score');
    const bookedAppointments = Number(member.bookedAppointments || 0).toLocaleString('en-US');
    const demos = Number(member.demos || 0).toLocaleString('en-US');

    const card = document.createElement('article');
    card.dataset.memberId = member.id;
    card.className = `member-card rank-${Math.min(rank, 4)} ${recentlyUpdated.has(member.id) ? 'recent-update' : ''}`;
    const safeName = escapeHtml(member.name || 'Unknown');
    const safePhoto = escapeHtml(member.photoUrl || DEFAULT_PHOTO);
    card.innerHTML = `
      <div class="rank-pill">
        <span class="rank-number">#${rank}</span>
        <span class="rank-label">Rank</span>
      </div>
      <img class="member-photo" src="${safePhoto}" alt="${safeName}" loading="lazy" />
      <div class="member-main">
        <div class="member-name">${safeName}</div>
        ${badgeMarkup}
        <div class="metrics">
          <div class="stat-chip">
            <span>Booked Appointments</span>
            <strong>${bookedAppointments}</strong>
          </div>
          <div class="stat-chip">
            <span>Demos</span>
            <strong>${demos}</strong>
          </div>
          <div class="stat-chip">
            <span>Estimated Revenue</span>
            <strong>${formatCurrency(member.estimatedRevenue)}</strong>
          </div>
          <div class="stat-chip">
            <span>Demo Bonus Estimate</span>
            <strong>${formatCurrency(bonusEstimate)}</strong>
          </div>
          <div class="stat-chip stat-chip-wide">
            <span>Current Tier</span>
            <strong>${formatTier(member.demos)}</strong>
          </div>
        </div>
      </div>
      <div class="metric-highlight">
        ${highlightValue}
        <span>${highlightLabel}</span>
      </div>
    `;

    leaderboardEl.append(card);

    const oldRect = previousCards.get(member.id);
    if (oldRect) {
      const newRect = card.getBoundingClientRect();
      const deltaY = oldRect.top - newRect.top;
      if (Math.abs(deltaY) > 0.5) {
        card.animate(
          [
            { transform: `translateY(${deltaY}px)` },
            { transform: 'translateY(0)' },
          ],
          { duration: 400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        );
      }
    }

    previousRanks.set(member.id, rank);
  });

  updatedLine.textContent = `Last updated ${new Date().toLocaleTimeString()}`;
};

const bindTabs = () => {
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      sortMode = button.dataset.sort;
      tabButtons.forEach((tab) => {
        const isActive = tab === button;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
      });
      displayMembers = sortMembers(allMembers.filter((member) => member.active !== false), sortMode);
      renderLeaderboard();
    });
  });
};

const subscribeTeamMembers = () => {
  const membersQuery = query(collection(db, 'teamMembers'));
  onSnapshot(
    membersQuery,
    (snapshot) => {
      const previousById = new Map(allMembers.map((member) => [member.id, member]));
      const incoming = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

      recentlyUpdated.clear();
      incoming.forEach((member) => {
        const previous = previousById.get(member.id);
        if (!previous) return;
        const bookedChanged = Number(previous.bookedAppointments || 0) !== Number(member.bookedAppointments || 0);
        const demosChanged = Number(previous.demos || 0) !== Number(member.demos || 0);
        const revenueChanged = Number(previous.estimatedRevenue || 0) !== Number(member.estimatedRevenue || 0);
        if (bookedChanged || demosChanged || revenueChanged) {
          recentlyUpdated.add(member.id);
        }
      });

      allMembers = incoming;
      displayMembers = sortMembers(allMembers.filter((member) => member.active !== false), sortMode);
      updateMemberAutocomplete();
      renderLeaderboard();
    },
    (error) => {
      setStatus(leaderboardStatus, `Live update failed: ${error.message}`, true);
    },
  );
};

const bindSubmissionForm = () => {
  dateInput.valueAsDate = new Date();
  const refreshNoteCount = () => {
    noteCount.textContent = `${noteInput.value.length} / ${noteInput.maxLength}`;
  };
  refreshNoteCount();
  noteInput.addEventListener('input', refreshNoteCount);

  submissionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(submissionStatus, 'Submitting appointment...');

    const member = findMemberBySearchValue();
    const appointmentDate = dateInput.value;
    const note = noteInput.value.trim();
    const selectedDate = new Date(`${appointmentDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!member) {
      setStatus(submissionStatus, 'Select Team Member from the list.', true);
      return;
    }
    if (!appointmentDate || Number.isNaN(new Date(appointmentDate).getTime())) {
      setStatus(submissionStatus, 'Appointment Date is required.', true);
      return;
    }
    if (selectedDate > today) {
      setStatus(submissionStatus, 'Appointment Date cannot be in the future.', true);
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const memberRef = doc(db, 'teamMembers', member.id);
        transaction.update(memberRef, {
          bookedAppointments: increment(1),
          updatedAt: serverTimestamp(),
        });

        const submissionRef = doc(collection(db, 'appointmentSubmissions'));
        transaction.set(submissionRef, {
          teamMemberId: member.id,
          teamMemberName: member.name,
          appointmentDate,
          note,
          reviewed: false,
          createdAt: serverTimestamp(),
        });
      });

      setStatus(submissionStatus, 'Appointment submitted successfully. Leaderboard updated.');
      noteInput.value = '';
      refreshNoteCount();
      dateInput.valueAsDate = new Date();
      submissionSuccessTimeoutId = window.setTimeout(() => {
        closeSubmissionModal({ clearStatus: true });
      }, 800);
    } catch (error) {
      setStatus(submissionStatus, `Unable to submit appointment: ${error.message}`, true);
    }
  });
};

const showInitError = (message) => {
  setStatus(leaderboardStatus, message, true);
  setStatus(submissionStatus, message, true);
  submissionForm.querySelector('button[type="submit"]').disabled = true;
  if (openSubmissionModalButton) {
    openSubmissionModalButton.disabled = true;
  }
  memberSearchInput.disabled = true;
  dateInput.disabled = true;
  noteInput.disabled = true;
};

const init = () => {
  bindTabs();
  bindSubmissionModal();
  bindSubmissionForm();

  if (!db || firebaseInitError) {
    showInitError(firebaseInitError?.message || 'Firebase is not configured.');
    return;
  }

  subscribeTeamMembers();
};

init();
