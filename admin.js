import {
  collection,
  db,
  doc,
  firebaseInitError,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from './firebase.js';

// Internal static-site gate only. Must be changed before deployment and does not replace server-side authentication.
const ADMIN_PASSWORD = 'CHANGE_ME';
const ACCESS_KEY = 'vladder_admin_access';
const DEFAULT_PHOTO =
  (window.VLADDER_CONFIG && window.VLADDER_CONFIG.defaultPhotoUrl) ||
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=240&q=80';

const adminGate = document.getElementById('admin-gate');
const adminConsole = document.getElementById('admin-console');
const adminLoginForm = document.getElementById('admin-login-form');
const adminPasswordInput = document.getElementById('admin-password');
const adminLoginStatus = document.getElementById('admin-login-status');

const memberForm = document.getElementById('member-form');
const memberEditSelect = document.getElementById('member-edit-select');
const memberNameInput = document.getElementById('member-name');
const memberPhotoInput = document.getElementById('member-photo');
const memberBookedInput = document.getElementById('member-booked');
const memberDemosInput = document.getElementById('member-demos');
const memberRevenueInput = document.getElementById('member-revenue');
const memberActiveInput = document.getElementById('member-active');
const memberFormStatus = document.getElementById('member-form-status');
const clearMemberButton = document.getElementById('clear-member-form');

const filterDateInput = document.getElementById('filter-date');
const filterMemberSelect = document.getElementById('filter-member');
const clearFiltersButton = document.getElementById('clear-filters');
const submissionsTableBody = document.getElementById('submission-table-body');
const submissionStatus = document.getElementById('submission-admin-status');

let members = [];
let submissions = [];

const setStatus = (target, message, isError = false) => {
  target.textContent = message;
  target.className = `status ${message ? (isError ? 'error' : 'success') : ''}`.trim();
};

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const parseNumber = (inputValue) => {
  const parsed = Number(inputValue);
  return Number.isFinite(parsed) ? parsed : NaN;
};
const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const clearMemberForm = () => {
  memberEditSelect.value = '';
  memberForm.reset();
  memberBookedInput.value = '0';
  memberDemosInput.value = '0';
  memberRevenueInput.value = '0';
  memberActiveInput.checked = true;
  setStatus(memberFormStatus, '');
};

const renderMemberSelects = () => {
  const previousEdit = memberEditSelect.value;
  const previousFilter = filterMemberSelect.value;

  const sortedMembers = members.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  memberEditSelect.innerHTML = '<option value="">Create new member</option>';
  filterMemberSelect.innerHTML = '<option value="">All team members</option>';

  sortedMembers.forEach((member) => {
    const label = `${member.name}${member.active === false ? ' (inactive)' : ''}`;

    const editOption = document.createElement('option');
    editOption.value = member.id;
    editOption.textContent = label;
    memberEditSelect.append(editOption);

    const filterOption = document.createElement('option');
    filterOption.value = member.id;
    filterOption.textContent = label;
    filterMemberSelect.append(filterOption);
  });

  if (sortedMembers.some((member) => member.id === previousEdit)) {
    memberEditSelect.value = previousEdit;
  }
  if (sortedMembers.some((member) => member.id === previousFilter)) {
    filterMemberSelect.value = previousFilter;
  }
};

const populateMemberForm = (memberId) => {
  const member = members.find((entry) => entry.id === memberId);
  if (!member) {
    clearMemberForm();
    return;
  }

  memberNameInput.value = member.name || '';
  memberPhotoInput.value = member.photoUrl || DEFAULT_PHOTO;
  memberBookedInput.value = String(Number(member.bookedAppointments || 0));
  memberDemosInput.value = String(Number(member.demos || 0));
  memberRevenueInput.value = String(Number(member.estimatedRevenue || 0));
  memberActiveInput.checked = member.active !== false;
  setStatus(memberFormStatus, '');
};

const applySubmissionFilters = () => {
  const dateFilter = filterDateInput.value;
  const memberFilter = filterMemberSelect.value;

  return submissions.filter((entry) => {
    const data = entry.data;
    const dateMatch = !dateFilter || data.appointmentDate === dateFilter;
    const memberMatch = !memberFilter || data.teamMemberId === memberFilter;
    return dateMatch && memberMatch;
  });
};

const renderSubmissions = () => {
  submissionsTableBody.innerHTML = '';
  const filtered = applySubmissionFilters();

  if (!filtered.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="6">No submissions yet.</td>';
    submissionsTableBody.append(row);
    return;
  }

  filtered.forEach((entry) => {
    const data = entry.data;
    const row = document.createElement('tr');
    const createdAt = data.createdAt?.toDate?.();
    const safeName = escapeHtml(data.teamMemberName || '-');
    const safeDate = escapeHtml(data.appointmentDate || '-');
    const safeNote = data.note ? escapeHtml(data.note) : '-';

    row.innerHTML = `
      <td>${safeName}</td>
      <td>${safeDate}</td>
      <td>${safeNote}</td>
      <td>
        <label class="reviewed-toggle">
          <input type="checkbox" data-action="toggle-reviewed" data-id="${entry.id}" ${data.reviewed ? 'checked' : ''} />
          ${data.reviewed ? 'Reviewed' : 'Pending'}
        </label>
      </td>
      <td>${createdAt ? createdAt.toLocaleString() : 'Pending...'}</td>
      <td>
        <div class="table-actions">
          <button type="button" class="small" data-action="delete-submission" data-id="${entry.id}">Delete</button>
        </div>
      </td>
    `;

    submissionsTableBody.append(row);
  });
};

const subscribeTeamMembers = () => {
  onSnapshot(
    collection(db, 'teamMembers'),
    (snapshot) => {
      members = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      renderMemberSelects();
      if (memberEditSelect.value) {
        populateMemberForm(memberEditSelect.value);
      }
      renderSubmissions();
    },
    (error) => {
      setStatus(memberFormStatus, `Unable to load team members: ${error.message}`, true);
    },
  );
};

const subscribeSubmissions = () => {
  const submissionsQuery = query(collection(db, 'appointmentSubmissions'), orderBy('createdAt', 'desc'));
  onSnapshot(
    submissionsQuery,
    (snapshot) => {
      submissions = snapshot.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }));
      renderSubmissions();
    },
    (error) => {
      setStatus(submissionStatus, `Unable to load submissions: ${error.message}`, true);
    },
  );
};

const handleMemberSave = async (event) => {
  event.preventDefault();

  const name = memberNameInput.value.trim();
  const photoUrl = memberPhotoInput.value.trim() || DEFAULT_PHOTO;
  const bookedAppointments = parseNumber(memberBookedInput.value);
  const demos = parseNumber(memberDemosInput.value);
  const estimatedRevenue = parseNumber(memberRevenueInput.value);
  const active = memberActiveInput.checked;

  if (!name) {
    setStatus(memberFormStatus, 'Team Member Name is required.', true);
    return;
  }
  if (!photoUrl) {
    setStatus(memberFormStatus, 'Photo / Avatar URL is required.', true);
    return;
  }
  if ([bookedAppointments, demos, estimatedRevenue].some((value) => Number.isNaN(value) || value < 0)) {
    setStatus(memberFormStatus, 'Booked, demos, and revenue must be valid non-negative numbers.', true);
    return;
  }

  const selectedId = memberEditSelect.value;
  const memberId = selectedId || slugify(name);
  if (!memberId) {
    setStatus(memberFormStatus, 'Unable to create a member ID from this name.', true);
    return;
  }

  try {
    await setDoc(
      doc(db, 'teamMembers', memberId),
      {
        name,
        photoUrl,
        bookedAppointments,
        demos,
        estimatedRevenue,
        active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    setStatus(memberFormStatus, 'Team member saved.');
    if (!selectedId) {
      clearMemberForm();
    }
  } catch (error) {
    setStatus(memberFormStatus, `Failed to save team member: ${error.message}`, true);
  }
};

const handleSubmissionAction = async (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  const submissionId = trigger.dataset.id;
  const action = trigger.dataset.action;
  const selectedSubmission = submissions.find((entry) => entry.id === submissionId);

  if (!selectedSubmission) {
    setStatus(submissionStatus, 'Submission no longer exists.', true);
    return;
  }

  try {
    if (action === 'toggle-reviewed') {
      await updateDoc(doc(db, 'appointmentSubmissions', submissionId), {
        reviewed: Boolean(trigger.checked),
        updatedAt: serverTimestamp(),
      });
      setStatus(submissionStatus, 'Submission review status updated.');
      return;
    }

    if (action === 'delete-submission') {
      const { teamMemberId } = selectedSubmission.data;
      await runTransaction(db, async (transaction) => {
        transaction.delete(doc(db, 'appointmentSubmissions', submissionId));
        if (teamMemberId) {
          const memberRef = doc(db, 'teamMembers', teamMemberId);
          const memberSnapshot = await transaction.get(memberRef);
          if (memberSnapshot.exists()) {
            const bookedAppointments = Number(memberSnapshot.data().bookedAppointments || 0);
            transaction.update(memberRef, {
              bookedAppointments: Math.max(0, bookedAppointments - 1),
              updatedAt: serverTimestamp(),
            });
          }
        }
      });
      setStatus(submissionStatus, 'Submission deleted and stats corrected.');
    }
  } catch (error) {
    setStatus(submissionStatus, `Submission update failed: ${error.message}`, true);
  }
};

const bindEvents = () => {
  adminLoginForm.addEventListener('submit', (event) => {
    event.preventDefault();

    if (adminPasswordInput.value !== ADMIN_PASSWORD) {
      setStatus(adminLoginStatus, 'Incorrect password.', true);
      return;
    }

    sessionStorage.setItem(ACCESS_KEY, 'true');
    adminGate.classList.add('hidden');
    adminConsole.classList.remove('hidden');
    setStatus(adminLoginStatus, 'Access granted.');
  });

  memberEditSelect.addEventListener('change', () => populateMemberForm(memberEditSelect.value));
  memberForm.addEventListener('submit', handleMemberSave);
  clearMemberButton.addEventListener('click', clearMemberForm);

  filterDateInput.addEventListener('change', renderSubmissions);
  filterMemberSelect.addEventListener('change', renderSubmissions);
  clearFiltersButton.addEventListener('click', () => {
    filterDateInput.value = '';
    filterMemberSelect.value = '';
    renderSubmissions();
  });

  submissionsTableBody.addEventListener('click', handleSubmissionAction);
  submissionsTableBody.addEventListener('change', handleSubmissionAction);
};

const showAdminConsoleIfAuthorized = () => {
  const hasAccess = sessionStorage.getItem(ACCESS_KEY) === 'true';
  if (hasAccess) {
    adminGate.classList.add('hidden');
    adminConsole.classList.remove('hidden');
  }
};

const disableDashboard = (message) => {
  adminLoginForm.querySelector('button[type="submit"]').disabled = true;
  adminPasswordInput.disabled = true;
  setStatus(adminLoginStatus, message, true);
};

const init = () => {
  bindEvents();
  showAdminConsoleIfAuthorized();

  if (!db || firebaseInitError) {
    disableDashboard(firebaseInitError?.message || 'Firebase is not configured.');
    return;
  }

  subscribeTeamMembers();
  subscribeSubmissions();
};

init();
