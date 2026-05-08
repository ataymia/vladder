import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const config = window.VLADDER_CONFIG;
if (!config || !config.firebase) {
  throw new Error('Missing VLADDER_CONFIG.firebase in config.js');
}

const app = initializeApp(config.firebase);
const db = getFirestore(app);

export {
  Timestamp,
  addDoc,
  collection,
  config,
  db,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
};
