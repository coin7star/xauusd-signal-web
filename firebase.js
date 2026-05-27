// ============================================
// FIREBASE CONFIG
// Ganti dengan config Firebase lo sendiri
// Dapatkan dari: Firebase Console → Project Settings → Your Apps
// ============================================

const firebaseConfig = {
  apiKey: "ISI_API_KEY_FIREBASE_LO",
  authDomain: "ISI_AUTH_DOMAIN_LO",
  databaseURL: "ISI_DATABASE_URL_LO",
  projectId: "ISI_PROJECT_ID_LO",
  storageBucket: "ISI_STORAGE_BUCKET_LO",
  messagingSenderId: "ISI_SENDER_ID_LO",
  appId: "ISI_APP_ID_LO"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Export referensi ke database
window.xauRef = db.ref('xauusd/latest');      // Data terbaru
window.historyRef = db.ref('xauusd/history'); // Riwayat sinyal
