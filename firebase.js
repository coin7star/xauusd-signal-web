// ============================================
// FIREBASE CONFIG
// Ganti dengan config Firebase lo sendiri
// Dapatkan dari: Firebase Console → Project Settings → Your Apps
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyAu4cQilVo_L47UZexNk4BQ8J2w1LI4Vr0",
  authDomain: "xauusd-signal-web.firebaseapp.com",
  databaseURL: "https://xauusd-signal-web-default-rtdb.firebaseio.com",
  projectId: "xauusd-signal-web",
  storageBucket: "xauusd-signal-web.firebasestorage.app",
  messagingSenderId: "854389377912",
  appId: "1:854389377912:web:0fad2bbbd1ae13b207968d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Export referensi ke database
window.xauRef = db.ref('xauusd/latest');      // Data terbaru
window.historyRef = db.ref('xauusd/history'); // Riwayat sinyal
