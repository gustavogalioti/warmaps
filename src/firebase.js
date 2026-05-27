import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from 'firebase/auth'
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            "AIzaSyDM-f0GLqTZjRmEbil33uVwSAAtqMtCeVc",
  authDomain:        "war-maps-5e8cf.firebaseapp.com",
  projectId:         "war-maps-5e8cf",
  storageBucket:     "war-maps-5e8cf.firebasestorage.app",
  messagingSenderId: "233503419698",
  appId:             "1:233503419698:web:1b1d6dd3d8caf46d537b2b",
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const auth = getAuth(app)
const db   = getFirestore(app)

export {
  auth, db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp,
}
