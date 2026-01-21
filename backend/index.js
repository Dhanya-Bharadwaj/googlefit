const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const app = express();

// CORS - Allow both frontend URLs
app.use(cors({
  origin: ["https://googlefit.vercel.app", "https://googlefit-tracker.vercel.app"],
  credentials: true
}));
app.use(bodyParser.json());

// Initialize Firebase Admin SDK
let db = null;
let firebaseError = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('FIREBASE_SERVICE_ACCOUNT found, length:', process.env.FIREBASE_SERVICE_ACCOUNT.length);
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('Parsed service account for project:', serviceAccount.project_id);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    
    db = admin.firestore();
    console.log('Firebase Admin initialized successfully');
  } else {
    firebaseError = 'FIREBASE_SERVICE_ACCOUNT environment variable not found';
    console.warn(firebaseError);
  }
} catch (error) {
  firebaseError = error.message;
  console.error('Firebase Admin initialization error:', error.message);
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: "✅ API running on Vercel",
    status: 'Backend API is Running',
    firebase: db ? 'Connected' : 'Not Connected',
    error: firebaseError || undefined,
    envSet: !!process.env.FIREBASE_SERVICE_ACCOUNT
  });
});

app.get('/api', (req, res) => {
  res.json({ 
    message: "✅ API running on Vercel",
    status: 'Backend API is Running',
    firebase: db ? 'Connected' : 'Not Connected',
    error: firebaseError || undefined,
    envSet: !!process.env.FIREBASE_SERVICE_ACCOUNT
  });
});

// Sign Up Route
app.post('/api/signup', async (req, res) => {
  const { name, age, email, phone, password } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Name, Email, and Password are required.' });
  }

  // 1. Email Validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const cleanEmail = email.trim().toLowerCase();
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  // 2. Phone Validation (Must be exactly 10 digits)
  // Remove any non-numeric characters to check length
  let cleanPhone = phone ? phone.toString().replace(/\D/g, '') : '';
  
  // If it starts with 91 and has 12 digits, strip the 91
  if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
    cleanPhone = cleanPhone.substring(2);
  }

  if (cleanPhone.length !== 10) {
    return res.status(400).json({ message: 'Phone number must be exactly 10 digits.' });
  }

  // Add Indian Prefix +91
  const formattedPhone = `+91${cleanPhone}`;

  if (!db) {
    return res.status(503).json({ message: 'Database not available. Please try again later.' });
  }

  try {
    const userDoc = await db.collection('users').doc(cleanEmail).get();
    if (userDoc.exists) {
      return res.status(409).json({ message: 'User with this email already exists. Please sign in instead.' });
    }

    // Check phone duplicate (using the formatted +91 version)
    const phoneQuery = await db.collection('users').where('phone', '==', formattedPhone).get();
    if (!phoneQuery.empty) {
      return res.status(409).json({ message: 'User with this phone number already exists. Please sign in instead.' });
    }

    // Hash the password before saving
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user in Firebase
    await db.collection('users').doc(cleanEmail).set({
      name,
      email: cleanEmail,
      phone: formattedPhone,
      steps: 0,
      password: hashedPassword, // Store hashed password
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
});

// Sign In Route
app.post('/api/signin', async (req, res) => {
  const { loginIdentifier, password } = req.body;
  
  let cleanIdentifier = loginIdentifier ? loginIdentifier.trim().toLowerCase() : '';
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
      // Check if it's a 10-digit number, then format with +91
      let searchPhone = cleanIdentifier.replace(/\D/g, '');
      if (searchPhone.length === 12 && searchPhone.startsWith('91')) searchPhone = searchPhone.substring(2);
      
      const formattedSearchPhone = searchPhone.length === 10 ? `+91${searchPhone}` : cleanIdentifier;

      const phoneQuery = await db.collection('users').where('phone', '==', formattedSearchPhone).get();
      if (!phoneQuery.empty) {
        userData = phoneQuery.docs[0].data();
      }
    }

    if (userData) {
      // Compare provided password with hashed password in DB
      const isMatch = await bcrypt.compare(cleanPassword, userData.password);

      if (isMatch) {
        return res.status(200).json({ 
          message: 'Login successful!', 
          user: { 
            name: userData.name, 
            email: userData.email, 
            steps: userData.steps || 0 
          } 
        });
      }
    }

    res.status(401).json({ message: 'Invalid credentials. Check for typos or extra spaces.' });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

// Google Login Route
app.post('/api/google-login', async (req, res) => {
  const { email, name, picture, accessToken } = req.body;
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
    }
    
    // Always update token and last login
    await userRef.set({ 
      lastLogin: new Date().toISOString(),
      picture: picture || user.picture,
      accessToken: accessToken || null,
      tokenUpdated: accessToken ? new Date().toISOString() : null
    }, { merge: true });
    
    console.log(`[Google Login] User: ${cleanEmail}, Token stored: ${!!accessToken}`);

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

// Firebase-specific routes
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

// Sync ALL users' steps using their stored access tokens
app.post('/api/firebase/sync-all-steps', async (req, res) => {
  if (!db) {
    return res.status(503).json({ message: 'Firebase not configured' });
  }
  
  const results = { success: [], failed: [], skipped: [] };
  
  try {
    // Get all users with tokens
    const snapshot = await db.collection('users').get();
    console.log(`[Sync-All] Found ${snapshot.docs.length} users`);
    
    for (const doc of snapshot.docs) {
      const userData = doc.data();
      const userEmail = userData.email;
      const accessToken = userData.accessToken;
      
      if (!accessToken) {
        results.skipped.push({ email: userEmail, reason: 'No token stored' });
        continue;
      }
      
      try {
        // Fetch steps from Google Fit for this user
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const startTimeMillis = startOfDay.getTime();
        const endTimeMillis = now.getTime() + 60000;
        
        let totalSteps = 0;
        
        // Try estimated_steps first
        try {
          const response = await axios.post(
            'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
            {
              aggregateBy: [{
                dataTypeName: "com.google.step_count.delta",
                dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
              }],
              bucketByTime: { durationMillis: 86400000 },
              startTimeMillis,
              endTimeMillis
            },
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          
          if (response.data.bucket && response.data.bucket.length > 0) {
            response.data.bucket.forEach(bucket => {
              if (bucket.dataset) {
                bucket.dataset.forEach(ds => {
                  ds.point.forEach(p => {
                    if (p.value && p.value.length > 0) {
                      totalSteps += p.value[0].intVal;
                    }
                  });
                });
              }
            });
          }
        } catch (e) {
          // Try generic method
          try {
            const response2 = await axios.post(
              'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
              {
                aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
                bucketByTime: { durationMillis: 86400000 },
                startTimeMillis,
                endTimeMillis
              },
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            
            if (response2.data.bucket && response2.data.bucket.length > 0) {
              response2.data.bucket.forEach(bucket => {
                if (bucket.dataset) {
                  bucket.dataset.forEach(ds => {
                    ds.point.forEach(p => {
                      if (p.value && p.value.length > 0) {
                        totalSteps += p.value[0].intVal;
                      }
                    });
                  });
                }
              });
            }
          } catch (e2) {
            throw new Error('All fetch methods failed');
          }
        }
        
        // Update user's steps in Firebase
        await db.collection('users').doc(userEmail).set({
          steps: totalSteps,
          lastSynced: new Date().toISOString()
        }, { merge: true });
        
        results.success.push({ email: userEmail, steps: totalSteps });
        console.log(`[Sync-All] ${userEmail}: ${totalSteps} steps`);
        
      } catch (fetchError) {
        console.error(`[Sync-All] Failed for ${userEmail}:`, fetchError.message);
        results.failed.push({ 
          email: userEmail, 
          reason: fetchError.response?.status === 401 ? 'Token expired' : fetchError.message 
        });
      }
    }
    
    res.json({
      message: `Synced ${results.success.length} users, ${results.failed.length} failed, ${results.skipped.length} skipped`,
      results
    });
    
  } catch (error) {
    console.error('Sync-all error:', error);
    res.status(500).json({ message: 'Sync-all failed', error: error.message });
  }
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
