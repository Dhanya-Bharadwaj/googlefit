const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Initialize Firebase Admin SDK
let db = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    
    db = admin.firestore();
    console.log('Firebase Admin initialized successfully on Vercel');
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT not found in environment variables');
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error.message);
}

// Health check
app.get('/api', (req, res) => {
  res.json({ 
    status: 'Vercel API is Running',
    firebase: db ? 'Connected' : 'Not Connected'
  });
});

// Sign Up Route
app.post('/api/signup', async (req, res) => {
  const { name, age, email, phone, password } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Name, Email, and Password are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone ? phone.trim() : '';

  // Check Firebase for existing user
  if (db) {
    try {
      const userDoc = await db.collection('users').doc(cleanEmail).get();
      if (userDoc.exists) {
        return res.status(409).json({ message: 'User with this email already exists. Please sign in instead.' });
      }

      // Check phone duplicate
      if (cleanPhone) {
        const phoneQuery = await db.collection('users').where('phone', '==', cleanPhone).get();
        if (!phoneQuery.empty) {
          return res.status(409).json({ message: 'User with this phone number already exists. Please sign in instead.' });
        }
      }

      // Create new user in Firebase
      await db.collection('users').doc(cleanEmail).set({
        name,
        email: cleanEmail,
        phone: cleanPhone,
        steps: 0,
        password, // Note: In production, hash this!
        createdAt: new Date().toISOString()
      });

      res.status(201).json({ 
        message: 'User registered successfully!', 
        user: { name, email: cleanEmail, steps: 0, isFirstLogin: true } 
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ message: 'Registration failed. Please try again.' });
    }
  } else {
    res.status(503).json({ message: 'Database not available. Please try again later.' });
  }
});

// Sign In Route
app.post('/api/signin', async (req, res) => {
  const { loginIdentifier, password } = req.body;
  
  const cleanIdentifier = loginIdentifier ? loginIdentifier.trim().toLowerCase() : '';
  const cleanPassword = password ? password.trim() : '';

  if (!db) {
    return res.status(503).json({ message: 'Database not available.' });
  }

  try {
    // Try to find by email first
    let userDoc = await db.collection('users').doc(cleanIdentifier).get();
    let userData = userDoc.exists ? userDoc.data() : null;

    // If not found by email, try phone
    if (!userData) {
      const phoneQuery = await db.collection('users').where('phone', '==', loginIdentifier).get();
      if (!phoneQuery.empty) {
        userData = phoneQuery.docs[0].data();
      }
    }

    if (userData && userData.password === cleanPassword) {
      res.status(200).json({ 
        message: 'Login successful!', 
        user: { 
          name: userData.name, 
          email: userData.email, 
          steps: userData.steps || 0 
        } 
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials. Check for typos or extra spaces.' });
    }
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

// Google Login Route
app.post('/api/google-login', async (req, res) => {
  const { email, name, picture } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  
  const cleanEmail = email.trim().toLowerCase();

  if (!db) {
    return res.status(503).json({ message: 'Database not available.' });
  }

  try {
    const userRef = db.collection('users').doc(cleanEmail);
    const userDoc = await userRef.get();
    let isFirstLogin = false;
    let user;

    if (!userDoc.exists) {
      // New user
      isFirstLogin = true;
      user = {
        name: name || 'Google User',
        email: cleanEmail,
        steps: 0,
        picture,
        createdAt: new Date().toISOString()
      };
      await userRef.set(user);
    } else {
      user = userDoc.data();
      // Update last login
      await userRef.update({ 
        lastLogin: new Date().toISOString(),
        picture: picture || user.picture
      });
    }

    res.status(200).json({ 
      message: isFirstLogin ? 'Welcome! Account created.' : 'Login successful', 
      user: { ...user, isFirstLogin },
      isFirstLogin 
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

// Update Steps Route
app.post('/api/update-steps', async (req, res) => {
  const { email, steps } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });

  const cleanEmail = email.trim().toLowerCase();

  if (!db) {
    return res.status(503).json({ message: 'Database not available.' });
  }

  try {
    await db.collection('users').doc(cleanEmail).update({ steps });
    res.json({ message: 'Steps updated.', totalSteps: steps });
  } catch (error) {
    console.error('Update steps error:', error);
    res.status(500).json({ message: 'Failed to update steps.' });
  }
});

// Leaderboard Route
app.get('/api/leaderboard', async (req, res) => {
  if (!db) {
    return res.status(503).json({ message: 'Database not available.' });
  }

  try {
    const snapshot = await db.collection('users')
      .orderBy('steps', 'desc')
      .limit(50)
      .get();
    
    const leaderboard = snapshot.docs.map(doc => {
      const data = doc.data();
      return { name: data.name || 'Unknown', steps: data.steps || 0 };
    });

    res.json(leaderboard);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ message: 'Failed to fetch leaderboard.' });
  }
});

// Firebase-specific routes (for compatibility with frontend)
app.post('/api/firebase/sync-user', async (req, res) => {
  const { name, email, steps } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });

  if (!db) {
    return res.status(503).json({ message: 'Firebase not configured' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    await db.collection('users').doc(cleanEmail).set({
      name,
      email: cleanEmail,
      steps: steps || 0
    }, { merge: true });
    
    res.json({ message: 'User synced to Firebase' });
  } catch (error) {
    console.error('Firebase sync error:', error);
    res.status(500).json({ message: 'Firebase sync failed' });
  }
});

app.post('/api/firebase/update-steps', async (req, res) => {
  const { email, name, steps } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });

  if (!db) {
    return res.status(503).json({ message: 'Firebase not configured' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    await db.collection('users').doc(cleanEmail).set({ 
      steps, 
      name: name || 'Unknown',
      email: cleanEmail 
    }, { merge: true });
    
    res.json({ message: 'Steps updated in Firebase', steps });
  } catch (error) {
    console.error('Firebase update error:', error);
    res.status(500).json({ message: 'Firebase update failed' });
  }
});

app.get('/api/firebase/leaderboard', async (req, res) => {
  if (!db) {
    return res.status(503).json({ message: 'Firebase not configured' });
  }

  try {
    const snapshot = await db.collection('users')
      .orderBy('steps', 'desc')
      .get();
    
    const leaderboard = snapshot.docs.map(doc => doc.data());
    res.json(leaderboard);
  } catch (error) {
    console.error('Firebase leaderboard error:', error);
    res.status(500).json({ message: 'Failed to fetch leaderboard' });
  }
});

module.exports = app;
