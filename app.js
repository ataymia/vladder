import {
  COLLECTIONS,
  collection,
  db,
  doc,
  firebaseInitError,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
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

const describeFirebaseError = (error, fallback = 'Something went wrong.') => {
  const code = typeof error?.code === 'string' ? error.code.replace(/^(auth|firestore)\//, '') : '';

  switch (code) {
    case 'permission-denied':
      return 'You do not have permission to do that. Check Firebase access and Firestore rules.';
    case 'failed-precondition':
      return 'Firebase is missing required setup. Confirm Firestore and Authentication are enabled.';
    case 'unavailable':
      return 'Firebase is temporarily unavailable. Try again in a moment.';
    default:
      return error?.message || fallback;
  }
};

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

const getInitials = (name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'VL';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'VL';
};

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

const createFallbackPhotoElement = (member) => {
  const fallback = document.createElement('div');
  fallback.className = 'member-photo member-photo-fallback';
  fallback.textContent = getInitials(member.name);
  fallback.setAttribute('aria-label', `${member.name || 'Team member'} photo fallback`);
  return fallback;
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
    const safeName = escapeHtml(member.name || 'Unknown');
    const safeInitials = escapeHtml(getInitials(member.name));
    const photoMarkup = member.photoUrl
      ? `<img class="member-photo" src="${escapeHtml(member.photoUrl)}" alt="${safeName}" loading="lazy" />`
      : `<div class="member-photo member-photo-fallback" aria-hidden="true">${safeInitials}</div>`;

    const card = document.createElement('article');
    card.dataset.memberId = member.id;
    card.className = `member-card rank-${Math.min(rank, 4)} ${recentlyUpdated.has(member.id) ? 'recent-update' : ''}`;
    card.innerHTML = `
      <div class="rank-pill">
        <span class="rank-number">#${rank}</span>
        <span class="rank-label">Rank</span>
      </div>
      ${photoMarkup}
      <div class="member-main">
        <div class="member-header">
          <div class="member-heading">
            <div class="member-name">${safeName}</div>
            ${badgeMarkup}
          </div>
          <div class="metric-highlight" aria-label="Current ${highlightLabel}">
            <strong>${highlightValue}</strong>
            <span>${highlightLabel}</span>
          </div>
        </div>
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
          <div class="stat-chip stat-chip-tier">
            <span>Current Tier</span>
            <strong>${formatTier(member.demos)}</strong>
          </div>
        </div>
      </div>
    `;

    leaderboardEl.append(card);

    const photoElement = card.querySelector('img.member-photo');
    if (photoElement) {
      photoElement.addEventListener(
        'error',
        () => {
          photoElement.replaceWith(createFallbackPhotoElement(member));
        },
        { once: true },
      );
    }

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
      displayMembers = sortMembers(allMembers, sortMode);
      renderLeaderboard();
    });
  });
};

const subscribeTeamMembers = () => {
  const membersQuery = query(collection(db, COLLECTIONS.teamMembers), where('active', '==', true));
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
      displayMembers = sortMembers(allMembers, sortMode);
      updateMemberAutocomplete();
      renderLeaderboard();
    },
    (error) => {
      setStatus(leaderboardStatus, `Live update failed: ${describeFirebaseError(error, 'Unable to load leaderboard.')}`, true);
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
        const memberRef = doc(db, COLLECTIONS.teamMembers, member.id);
        const memberSnapshot = await transaction.get(memberRef);

        if (!memberSnapshot.exists()) {
          throw new Error('The selected team member is no longer available. Refresh the leaderboard and try again.');
        }

        const memberData = memberSnapshot.data();
        if (memberData.active === false) {
          throw new Error('The selected team member is inactive and cannot receive new booked appointments.');
        }

        transaction.update(memberRef, {
          bookedAppointments: Number(memberData.bookedAppointments || 0) + 1,
          updatedAt: serverTimestamp(),
        });

        const submissionRef = doc(collection(db, COLLECTIONS.appointmentSubmissions));
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
      memberSearchInput.value = '';
      noteInput.value = '';
      refreshNoteCount();
      dateInput.valueAsDate = new Date();
      submissionSuccessTimeoutId = window.setTimeout(() => {
        closeSubmissionModal({ clearStatus: true });
      }, 800);
    } catch (error) {
      setStatus(submissionStatus, `Unable to submit appointment: ${describeFirebaseError(error, 'Unable to submit appointment.')}`, true);
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
