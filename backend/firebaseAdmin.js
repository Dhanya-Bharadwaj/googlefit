const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
// For LOCAL development: Uses the JSON file in backend folder
// For VERCEL/Production: Uses FIREBASE_SERVICE_ACCOUNT environment variable

let db;

try {
  let serviceAccount;
  
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Production: Parse from environment variable
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('Using Firebase credentials from environment variable');
  } else {
    // Local Development: Load from file
    const serviceAccountPath = path.join(__dirname, 'fitness-tracker-85542-firebase-adminsdk-fbsvc-a269c0ff18.json');
    serviceAccount = require(serviceAccountPath);
    console.log('Using Firebase credentials from local file');
  }
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  db = admin.firestore();
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Firebase Admin initialization error:', error.message);
  db = null;
}

module.exports = { db, admin };
