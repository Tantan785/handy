import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA2CZlDrnwzsJgDQQOTV8GEG9SDbtBt1eM",
    authDomain: "handy-bdec6.firebaseapp.com",
    projectId: "handy-bdec6",
    storageBucket: "handy-bdec6.firebasestorage.app",
    messagingSenderId: "42453550925",
    appId: "1:42453550925:web:259dbf0828297ec9e69904"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };