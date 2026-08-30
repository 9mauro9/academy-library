import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBgAKn-9rWtVRd93WCZIIqSnmLNMOBic90",
  authDomain: "academy-live-builder.firebaseapp.com",
  projectId: "academy-live-builder",
  storageBucket: "academy-live-builder.firebasestorage.app",
  messagingSenderId: "353347356715",
  appId: "1:353347356715:web:f1ce65d5be524b058c826e",
  measurementId: "G-DJL7ZYL0M1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Use local emulators if running locally
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  console.log("Connecting to Firebase Emulators...");
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
  connectFunctionsEmulator(functions, "localhost", 5001);
}

export { app, auth, db, functions };
