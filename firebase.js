import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const config = window.VLADDER_CONFIG || {};
let db = null;
let firebaseInitError = null;

try {
  if (!config.firebase || !config.firebase.apiKey || !config.firebase.projectId || !config.firebase.appId) {
    throw new Error('Missing Firebase config. Update config.js with your project credentials.');
  }
  const app = initializeApp(config.firebase);
  db = getFirestore(app);
} catch (error) {
  firebaseInitError = error;
}

const requireDb = () => {
  if (!db) {
    throw firebaseInitError || new Error('Firebase initialization failed.');
  }
  return db;
};

export {
  addDoc,
  collection,
  config,
  db,
  deleteDoc,
  doc,
  firebaseInitError,
  increment,
  onSnapshot,
  orderBy,
  query,
  requireDb,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
};
