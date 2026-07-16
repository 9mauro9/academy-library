import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// Setup config. When using emulators, these can be placeholder values, but 
// pointing to the target project ensures production config aligns.
const firebaseConfig = {
  apiKey: "AIzaSyFakeKeyForAcademyRecommendations1234",
  authDomain: "academy-library.firebaseapp.com",
  projectId: "academy-library",
  storageBucket: "academy-library.appspot.com",
  messagingSenderId: "353347356715",
  appId: "1:353347356715:web:abcdef1234567890"
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
