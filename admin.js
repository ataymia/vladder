import {
  COLLECTIONS,
  SYSTEM_DOCS,
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
  deleteUser,
  doc,
  firebaseInitError,
  getDoc,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  writeBatch,
} from './firebase.js';

const adminLoading = document.getElementById('admin-loading');
const adminLoadingStatus = document.getElementById('admin-loading-status');
const adminSetup = document.getElementById('admin-setup');
const adminSetupForm = document.getElementById('admin-setup-form');
const setupNameInput = document.getElementById('setup-name');
const setupEmailInput = document.getElementById('setup-email');
const setupPasswordInput = document.getElementById('setup-password');
const setupPasswordConfirmInput = document.getElementById('setup-password-confirm');
const adminSetupStatus = document.getElementById('admin-setup-status');
const adminGate = document.getElementById('admin-gate');
const adminConsole = document.getElementById('admin-console');
const adminLoginForm = document.getElementById('admin-login-form');
const adminEmailInput = document.getElementById('admin-email');
const adminPasswordInput = document.getElementById('admin-password');
const adminLoginStatus = document.getElementById('admin-login-status');
const logoutButton = document.getElementById('logout-button');
const adminSessionLabel = document.getElementById('admin-session-label');

const memberForm = document.getElementById('member-form');
const memberEditSelect = document.getElementById('member-edit-select');
const memberNameInput = document.getElementById('member-name');
const memberPhotoInput = document.getElementById('member-photo');
const memberPhotoPreview = document.getElementById('member-photo-preview');
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
let activeAdminProfile = null;
let bootstrapCompleted = false;
let bootstrapChecked = false;
let authStateResolved = false;
let adminAccessCheckInFlight = false;
let pendingLoginMessage = '';
let unsubscribeMembers = null;
let unsubscribeSubmissions = null;

const describeFirebaseError = (error, fallback = 'Something went wrong.') => {
  const code = typeof error?.code === 'string' ? error.code.replace(/^(auth|firestore)\//, '') : '';

  switch (code) {
    case 'permission-denied':
      return 'You do not have permission to do that. Check admin access and Firestore rules.';
    case 'failed-precondition':
      return 'Firebase is missing required setup. Confirm Firestore and Authentication are enabled.';
    case 'unavailable':
      return 'Firebase is temporarily unavailable. Try again in a moment.';
    case 'wrong-password':
    case 'invalid-credential':
      return 'The email or password is incorrect.';
    case 'user-not-found':
      return 'No admin account was found for that email.';
    case 'email-already-in-use':
      return 'That email is already being used by another account.';
    default:
      return error?.message || fallback;
  }
};

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

const toggleHidden = (element, hidden) => {
  element.classList.toggle('hidden', hidden);
};

const getInitials = (name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'VL';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'VL';
};

const renderAvatarMarkup = (name, extraClass = '') =>
  `<div class="photo-preview-fallback ${extraClass}">${escapeHtml(getInitials(name))}</div>`;

const renderMemberPhotoPreview = ({ name = memberNameInput.value, photoUrl = memberPhotoInput.value.trim() } = {}) => {
  if (!photoUrl) {
    memberPhotoPreview.innerHTML = renderAvatarMarkup(name);
    return;
  }

  memberPhotoPreview.innerHTML = `<img class="photo-preview-image" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name || 'Team member preview')}" />`;
  const previewImage = memberPhotoPreview.querySelector('img');
  previewImage?.addEventListener(
    'error',
    () => {
      memberPhotoPreview.innerHTML = renderAvatarMarkup(name);
    },
    { once: true },
  );
};

const resetMemberFormStatus = () => setStatus(memberFormStatus, '');

const clearMemberForm = () => {
  memberEditSelect.value = '';
  memberForm.reset();
  memberBookedInput.value = '0';
  memberDemosInput.value = '0';
  memberRevenueInput.value = '0';
  memberActiveInput.checked = true;
  resetMemberFormStatus();
  renderMemberPhotoPreview({ name: '' });
};

const stopDashboardSubscriptions = () => {
  unsubscribeMembers?.();
  unsubscribeSubmissions?.();
  unsubscribeMembers = null;
  unsubscribeSubmissions = null;
  members = [];
  submissions = [];
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
  memberPhotoInput.value = member.photoUrl || '';
  memberBookedInput.value = String(Number(member.bookedAppointments || 0));
  memberDemosInput.value = String(Number(member.demos || 0));
  memberRevenueInput.value = String(Number(member.estimatedRevenue || 0));
  memberActiveInput.checked = member.active !== false;
  renderMemberPhotoPreview({ name: member.name, photoUrl: member.photoUrl || '' });
  resetMemberFormStatus();
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

const renderAdminState = () => {
  const showLoading = Boolean(firebaseInitError) || !bootstrapChecked || !authStateResolved || adminAccessCheckInFlight;
  const showSetup = !showLoading && !bootstrapCompleted;
  const showLogin = !showLoading && bootstrapCompleted && !auth.currentUser;
  const showDashboard = !showLoading && bootstrapCompleted && Boolean(activeAdminProfile?.role === 'admin' && auth.currentUser);

  toggleHidden(adminLoading, !showLoading);
  toggleHidden(adminSetup, !showSetup);
  toggleHidden(adminGate, !showLogin);
  toggleHidden(adminConsole, !showDashboard);
  toggleHidden(logoutButton, !showDashboard);
  toggleHidden(adminSessionLabel, !showDashboard);

  if (showDashboard && activeAdminProfile) {
    adminSessionLabel.textContent = activeAdminProfile.name || activeAdminProfile.email || auth.currentUser?.email || 'Admin';
  }

  if (showLogin && pendingLoginMessage) {
    setStatus(adminLoginStatus, pendingLoginMessage, true);
    pendingLoginMessage = '';
  }
};

const setFatalState = (message) => {
  bootstrapChecked = false;
  authStateResolved = false;
  adminAccessCheckInFlight = false;
  stopDashboardSubscriptions();
  setStatus(adminLoadingStatus, message, true);
  renderAdminState();
};

const refreshBootstrapState = async () => {
  setStatus(adminLoadingStatus, 'Checking first-admin bootstrap state...');

  const bootstrapSnapshot = await getDoc(doc(db, COLLECTIONS.system, SYSTEM_DOCS.bootstrap));
  bootstrapChecked = true;
  bootstrapCompleted = bootstrapSnapshot.exists() && bootstrapSnapshot.data().completed === true;

  if (bootstrapCompleted) {
    setStatus(adminLoadingStatus, 'Bootstrap completed. Checking admin session...');
    return;
  }

  setStatus(adminLoadingStatus, 'Bootstrap not completed yet.');
};

const startDashboardSubscriptions = () => {
  if (unsubscribeMembers || unsubscribeSubmissions) {
    return;
  }

  unsubscribeMembers = onSnapshot(
    collection(db, COLLECTIONS.teamMembers),
    (snapshot) => {
      members = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      renderMemberSelects();
      if (memberEditSelect.value) {
        populateMemberForm(memberEditSelect.value);
      }
      renderSubmissions();
    },
    (error) => {
      setStatus(memberFormStatus, `Unable to load team members: ${describeFirebaseError(error, 'Unable to load team members.')}`, true);
    },
  );

  unsubscribeSubmissions = onSnapshot(
    query(collection(db, COLLECTIONS.appointmentSubmissions), orderBy('createdAt', 'desc')),
    (snapshot) => {
      submissions = snapshot.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }));
      renderSubmissions();
    },
    (error) => {
      setStatus(submissionStatus, `Unable to load submissions: ${describeFirebaseError(error, 'Unable to load submissions.')}`, true);
    },
  );
};

const verifyAdminAccess = async (user) => {
  adminAccessCheckInFlight = true;
  renderAdminState();
  setStatus(adminLoadingStatus, 'Checking admin access...');

  try {
    const adminSnapshot = await getDoc(doc(db, COLLECTIONS.admins, user.uid));
    if (!adminSnapshot.exists() || adminSnapshot.data().role !== 'admin') {
      pendingLoginMessage = 'You do not have admin access.';
      activeAdminProfile = null;
      stopDashboardSubscriptions();
      await signOut(auth);
      return;
    }

    activeAdminProfile = { id: adminSnapshot.id, ...adminSnapshot.data() };
    startDashboardSubscriptions();
  } catch (error) {
    pendingLoginMessage = `Unable to verify admin access: ${describeFirebaseError(error, 'Unable to verify admin access.')}`;
    activeAdminProfile = null;
    stopDashboardSubscriptions();
    await signOut(auth);
  } finally {
    adminAccessCheckInFlight = false;
    authStateResolved = true;
    renderAdminState();
  }
};

const handleMemberSave = async (event) => {
  event.preventDefault();

  const name = memberNameInput.value.trim();
  const photoUrl = memberPhotoInput.value.trim();
  const bookedAppointments = parseNumber(memberBookedInput.value);
  const demos = parseNumber(memberDemosInput.value);
  const estimatedRevenue = parseNumber(memberRevenueInput.value);
  const active = memberActiveInput.checked;

  if (!name) {
    setStatus(memberFormStatus, 'Team member name is required.', true);
    return;
  }

  if ([bookedAppointments, demos, estimatedRevenue].some((value) => Number.isNaN(value) || value < 0)) {
    setStatus(memberFormStatus, 'Booked appointments, demos, and revenue must be valid non-negative numbers.', true);
    return;
  }

  const selectedId = memberEditSelect.value;
  const memberId = selectedId || slugify(name);
  if (!memberId) {
    setStatus(memberFormStatus, 'Unable to create a member ID from this name.', true);
    return;
  }

  try {
    setStatus(memberFormStatus, 'Saving team member...');

    const memberRef = doc(db, COLLECTIONS.teamMembers, memberId);
    await runTransaction(db, async (transaction) => {
      const memberSnapshot = await transaction.get(memberRef);
      if (!selectedId && memberSnapshot.exists()) {
        throw new Error('A team member with this name already exists. Choose a different name or edit the existing member.');
      }

      const payload = {
        name,
        photoUrl,
        bookedAppointments,
        demos,
        estimatedRevenue,
        active,
        updatedAt: serverTimestamp(),
      };

      if (!memberSnapshot.exists()) {
        payload.createdAt = serverTimestamp();
      }

      transaction.set(memberRef, payload, { merge: true });
    });

    setStatus(memberFormStatus, 'Team member saved.');
    if (!selectedId) {
      clearMemberForm();
      return;
    }

    renderMemberPhotoPreview({ name, photoUrl });
  } catch (error) {
    setStatus(memberFormStatus, `Failed to save team member: ${describeFirebaseError(error, 'Unable to save team member.')}`, true);
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
      await updateDoc(doc(db, COLLECTIONS.appointmentSubmissions, submissionId), {
        reviewed: Boolean(trigger.checked),
        updatedAt: serverTimestamp(),
      });
      setStatus(submissionStatus, 'Submission review status updated.');
      return;
    }

    if (action === 'delete-submission') {
      const { teamMemberId } = selectedSubmission.data;
      await runTransaction(db, async (transaction) => {
        transaction.delete(doc(db, COLLECTIONS.appointmentSubmissions, submissionId));

        if (!teamMemberId) return;

        const memberRef = doc(db, COLLECTIONS.teamMembers, teamMemberId);
        const memberSnapshot = await transaction.get(memberRef);
        if (!memberSnapshot.exists()) return;

        const bookedAppointments = Number(memberSnapshot.data().bookedAppointments || 0);
        transaction.update(memberRef, {
          bookedAppointments: Math.max(0, bookedAppointments - 1),
          updatedAt: serverTimestamp(),
        });
      });

      setStatus(submissionStatus, 'Submission deleted and booked appointments corrected.');
    }
  } catch (error) {
    setStatus(submissionStatus, `Submission update failed: ${describeFirebaseError(error, 'Unable to update submission.')}`, true);
  }
};

const handleFirstAdminSetup = async (event) => {
  event.preventDefault();

  const name = setupNameInput.value.trim();
  const email = setupEmailInput.value.trim();
  const password = setupPasswordInput.value;
  const confirmPassword = setupPasswordConfirmInput.value;

  if (!name || !email || !password || !confirmPassword) {
    setStatus(adminSetupStatus, 'Name, email, password, and confirmation are required.', true);
    return;
  }

  if (password !== confirmPassword) {
    setStatus(adminSetupStatus, 'Passwords do not match.', true);
    return;
  }

  let createdUser = null;

  try {
    setStatus(adminSetupStatus, 'Creating first admin...');
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    createdUser = userCredential.user;

    const adminRef = doc(db, COLLECTIONS.admins, createdUser.uid);
    const bootstrapRef = doc(db, COLLECTIONS.system, SYSTEM_DOCS.bootstrap);
    const batch = writeBatch(db);
    batch.set(adminRef, {
      email,
      name,
      role: 'admin',
      createdAt: serverTimestamp(),
      bootstrapAdmin: true,
    });
    batch.set(bootstrapRef, {
      completed: true,
      completedBy: createdUser.uid,
      completedAt: serverTimestamp(),
      adminEmail: email,
    });
    await batch.commit();

    bootstrapCompleted = true;
    bootstrapChecked = true;
    activeAdminProfile = {
      id: createdUser.uid,
      email,
      name,
      role: 'admin',
      bootstrapAdmin: true,
    };
    authStateResolved = true;
    setStatus(adminSetupStatus, 'First admin created. Loading dashboard...');
    startDashboardSubscriptions();
    renderAdminState();
  } catch (error) {
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch (rollbackError) {
        console.warn('Unable to roll back partially created user:', rollbackError);
      }
    }
    setStatus(adminSetupStatus, `Unable to create the first admin: ${describeFirebaseError(error, 'Unable to create the first admin.')}`, true);
  }
};

const handleAdminLogin = async (event) => {
  event.preventDefault();
  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value;

  if (!email || !password) {
    setStatus(adminLoginStatus, 'Email and password are required.', true);
    return;
  }

  try {
    setStatus(adminLoginStatus, 'Signing in...');
    await signInWithEmailAndPassword(auth, email, password);
    setStatus(adminLoginStatus, '');
  } catch (error) {
    setStatus(adminLoginStatus, `Unable to sign in: ${describeFirebaseError(error, 'Unable to sign in.')}`, true);
  }
};

const handleLogout = async () => {
  try {
    setStatus(adminLoadingStatus, 'Signing out...');
    await signOut(auth);
  } catch (error) {
    setStatus(adminLoginStatus, `Unable to sign out: ${describeFirebaseError(error, 'Unable to sign out.')}`, true);
  }
};

const bindEvents = () => {
  adminSetupForm.addEventListener('submit', handleFirstAdminSetup);
  adminLoginForm.addEventListener('submit', handleAdminLogin);
  logoutButton.addEventListener('click', handleLogout);

  memberEditSelect.addEventListener('change', () => populateMemberForm(memberEditSelect.value));
  memberForm.addEventListener('submit', handleMemberSave);
  clearMemberButton.addEventListener('click', clearMemberForm);
  memberNameInput.addEventListener('input', () => renderMemberPhotoPreview());
  memberPhotoInput.addEventListener('input', () => renderMemberPhotoPreview());

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

const init = async () => {
  bindEvents();
  renderMemberPhotoPreview({ name: '' });

  if (!db || !auth || firebaseInitError) {
    setFatalState(firebaseInitError?.message || 'Firebase is not configured.');
    return;
  }

  try {
    await refreshBootstrapState();
  } catch (error) {
    setFatalState(`Unable to check bootstrap state: ${describeFirebaseError(error, 'Unable to check bootstrap state.')}`);
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    authStateResolved = false;
    activeAdminProfile = null;
    stopDashboardSubscriptions();
    renderAdminState();

    if (!user) {
      authStateResolved = true;
      renderAdminState();
      return;
    }

    if (!bootstrapCompleted) {
      authStateResolved = true;
      renderAdminState();
      return;
    }

    await verifyAdminAccess(user);
  });

  authStateResolved = false;
  renderAdminState();
};

init();
