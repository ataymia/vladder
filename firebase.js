import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import firebaseConfig, { firebaseConfigError } from './firebase-config.js';

const COLLECTIONS = Object.freeze({
  teamMembers: 'teamMembers',
  appointmentSubmissions: 'appointmentSubmissions',
  admins: 'admins',
  system: 'system',
});

const SYSTEM_DOCS = Object.freeze({
  bootstrap: 'bootstrap',
});

let app = null;
let db = null;
let auth = null;
let firebaseInitError = null;

try {
  if (firebaseConfigError) {
    throw new Error(firebaseConfigError);
  }

  const missingConfigKeys = ['apiKey', 'authDomain', 'projectId', 'messagingSenderId', 'appId'].filter(
    (configKey) => !firebaseConfig?.[configKey],
  );

  if (missingConfigKeys.length) {
    throw new Error(
      `Firebase configuration is incomplete. Missing: ${missingConfigKeys.join(', ')}. Run \`npm run build\` after setting the required environment variables.`,
    );
  }

  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  firebaseInitError = error;
}

const requireService = (service, serviceName) => {
  if (!service) {
    throw firebaseInitError || new Error(`${serviceName} is not available.`);
  }
  return service;
};

const requireDb = () => requireService(db, 'Firestore');
const requireAuth = () => requireService(auth, 'Firebase Auth');

export {
  COLLECTIONS,
  SYSTEM_DOCS,
  app,
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
  deleteDoc,
  deleteUser,
  doc,
  firebaseConfig,
  firebaseConfigError,
  firebaseInitError,
  getDoc,
  increment,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  requireAuth,
  requireDb,
  runTransaction,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  where,
  writeBatch,
};
