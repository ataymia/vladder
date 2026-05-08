import {
  collection,
  config,
  db,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from './firebase.js';

const adminGate = document.getElementById('admin-gate');
const adminConsole = document.getElementById('admin-console');
const adminLoginForm = document.getElementById('admin-login-form');
const adminPasswordInput = document.getElementById('admin-password');
const adminLoginStatus = document.getElementById('admin-login-status');

const memberForm = document.getElementById('member-form');
const memberEditSelect = document.getElementById('member-edit-select');
const memberNameInput = document.getElementById('member-name');
const memberPhotoInput = document.getElementById('member-photo');
const memberAppointmentsInput = document.getElementById('member-appointments');
const memberDemosInput = document.getElementById('member-demos');
const memberRevenueInput = document.getElementById('member-revenue');
const memberBonusInput = document.getElementById('member-bonus');
const memberFormStatus = document.getElementById('member-form-status');
const clearMemberButton = document.getElementById('clear-member-form');

const submissionsTable = document.getElementById('submission-table-body');
const submissionStatus = document.getElementById('submission-admin-status');

const defaultPhoto = config.defaultPhotoUrl || 'https://via.placeholder.com/120x120.png?text=VL';
const adminPassword = config.adminPassword || 'change-me';

let members = [];

const setStatus = (target, message, isError = false) => {
  target.textContent = message;
  target.className = `status ${message ? (isError ? 'error' : 'success') : ''}`.trim();
};

const memberFromForm = () => ({
  name: memberNameInput.value.trim(),
  photoUrl: memberPhotoInput.value.trim() || defaultPhoto,
  appointmentsBooked: Number(memberAppointmentsInput.value || 0),
  demos: Number(memberDemosInput.value || 0),
  revenue: Number(memberRevenueInput.value || 0),
  bonusTier: memberBonusInput.value || 'Starter',
  updatedAt: serverTimestamp(),
});

const clearMemberForm = () => {
  memberEditSelect.value = '';
  memberForm.reset();
  memberAppointmentsInput.value = '0';
  memberDemosInput.value = '0';
  memberRevenueInput.value = '0';
  memberBonusInput.value = 'Starter';
  memberFormStatus.textContent = '';
};

const renderMemberSelect = () => {
  const selected = memberEditSelect.value;
  memberEditSelect.innerHTML = '<option value="">Create new member</option>';
  members
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((member) => {
      const option = document.createElement('option');
      option.value = member.id;
      option.textContent = member.name;
      memberEditSelect.append(option);
    });

  if (members.some((member) => member.id === selected)) {
    memberEditSelect.value = selected;
  }
};

const populateForm = (memberId) => {
  const member = members.find((item) => item.id === memberId);
  if (!member) {
    clearMemberForm();
    return;
  }
  memberNameInput.value = member.name || '';
  memberPhotoInput.value = member.photoUrl || '';
  memberAppointmentsInput.value = String(Number(member.appointmentsBooked || 0));
  memberDemosInput.value = String(Number(member.demos || 0));
  memberRevenueInput.value = String(Number(member.revenue || 0));
  memberBonusInput.value = member.bonusTier || 'Starter';
};

const subscribeMembers = () => {
  onSnapshot(collection(db, 'members'), (snapshot) => {
    members = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderMemberSelect();
  });
};

const renderSubmissions = (docs) => {
  submissionsTable.innerHTML = '';
  if (!docs.length) {
    const empty = document.createElement('tr');
    empty.innerHTML = '<td colspan="5">No submissions yet.</td>';
    submissionsTable.append(empty);
    return;
  }

  docs.forEach((entry) => {
    const data = entry.data();
    const row = document.createElement('tr');
    const submittedAt = data.createdAt?.toDate?.() || null;
    row.innerHTML = `
      <td>${data.memberName || '-'}</td>
      <td>${data.appointmentDate || '-'}</td>
      <td>${Number(data.booked || 0)}</td>
      <td>${submittedAt ? submittedAt.toLocaleString() : 'Pending...'}</td>
      <td><button data-submission-id="${entry.id}">Delete</button></td>
    `;
    submissionsTable.append(row);
  });
};

const subscribeSubmissions = () => {
  const submissionsQuery = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
  onSnapshot(submissionsQuery, (snapshot) => {
    renderSubmissions(snapshot.docs);
  });
};

const bindLogin = () => {
  adminLoginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (adminPasswordInput.value !== adminPassword) {
      setStatus(adminLoginStatus, 'Incorrect password.', true);
      return;
    }
    setStatus(adminLoginStatus, 'Access granted.');
    adminGate.classList.add('hidden');
    adminConsole.classList.remove('hidden');
  });
};

const bindMemberForm = () => {
  memberEditSelect.addEventListener('change', () => populateForm(memberEditSelect.value));

  memberForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = memberFromForm();

    if (!payload.name) {
      setStatus(memberFormStatus, 'Member name is required.', true);
      return;
    }

    if (!Number.isFinite(payload.appointmentsBooked) || payload.appointmentsBooked < 0) {
      setStatus(memberFormStatus, 'Appointments must be 0 or greater.', true);
      return;
    }

    const memberId = memberEditSelect.value || payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    try {
      await setDoc(
        doc(db, 'members', memberId),
        {
          ...payload,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      setStatus(memberFormStatus, 'Member saved successfully.');
      if (!memberEditSelect.value) {
        clearMemberForm();
      }
    } catch (error) {
      setStatus(memberFormStatus, `Unable to save member: ${error.message}`, true);
    }
  });

  clearMemberButton.addEventListener('click', clearMemberForm);
};

const bindSubmissionActions = () => {
  submissionsTable.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-submission-id]');
    if (!button) {
      return;
    }

    const submissionId = button.dataset.submissionId;
    const row = button.closest('tr');
    const booked = Number(row?.children?.[2]?.textContent || 0);
    const memberName = row?.children?.[0]?.textContent || '';
    const member = members.find((entry) => entry.name === memberName);

    try {
      await runTransaction(db, async (transaction) => {
        const submissionRef = doc(db, 'submissions', submissionId);
        transaction.delete(submissionRef);

        if (member?.id) {
          const memberRef = doc(db, 'members', member.id);
          const memberSnap = await transaction.get(memberRef);
          if (memberSnap.exists()) {
            const current = Number(memberSnap.data().appointmentsBooked || 0);
            transaction.update(memberRef, {
              appointmentsBooked: Math.max(0, current - booked),
            });
          }
        }
      });
      setStatus(submissionStatus, 'Submission deleted.');
    } catch (error) {
      setStatus(submissionStatus, `Delete failed: ${error.message}`, true);
    }
  });
};

bindLogin();
bindMemberForm();
bindSubmissionActions();
subscribeMembers();
subscribeSubmissions();
