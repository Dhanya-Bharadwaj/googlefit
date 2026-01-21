const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { db } = require('./firebaseAdmin');

const app = express();
const PORT = 5000;
const DB_FILE = path.join(__dirname, 'users.json');

app.use(cors());
app.use(bodyParser.json());

// Routes Prefix
const router = express.Router();
app.use('/api', router);

// Default Route
app.get('/', (req, res) => {
  res.send('Backend Server is Running. API available at /api');
});

// Load users from file
const loadUsers = () => {
  if (!fs.existsSync(DB_FILE)) {
    return [];
  }
  const data = fs.readFileSync(DB_FILE);
  return JSON.parse(data);
};

// Save users to file
const saveUsers = (users) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
};

// Sign Up Route
router.post('/signup', async (req, res) => {
  const { name, age, email, phone, password } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Name, Email, and Password are required.' });
  }

  const users = loadUsers();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone ? phone.trim() : '';

  // Check if user exists with same email
  const existingEmailUser = users.find(u => u.email.toLowerCase() === cleanEmail);
  if (existingEmailUser) {
    return res.status(409).json({ message: 'User with this email already exists. Please sign in instead.' });
  }

  // Check if user exists with same phone
  if (cleanPhone) {
    const existingPhoneUser = users.find(u => u.phone === cleanPhone);
    if (existingPhoneUser) {
      return res.status(409).json({ message: 'User with this phone number already exists. Please sign in instead.' });
    }
  }

  // Also check Firebase for existing user
  if (db) {
    try {
      const firebaseUser = await db.collection('users').doc(cleanEmail).get();
      if (firebaseUser.exists) {
        return res.status(409).json({ message: 'User with this email already exists. Please sign in instead.' });
      }
    } catch (e) {
      console.error('Firebase check error:', e);
    }
  }

  const newUser = {
    id: Date.now(),
    name,
    age,
    email: cleanEmail,
    phone: cleanPhone,
    password,
    steps: 0,
    isFirstLogin: true,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers(users);

  // Sync to Firebase
  if (db) {
    try {
      await db.collection('users').doc(cleanEmail).set({
        name,
        email: cleanEmail,
        phone: cleanPhone,
        steps: 0,
        createdAt: new Date().toISOString()
      });
      console.log(`[Firebase] New user synced: ${cleanEmail}`);
    } catch (e) {
      console.error('Firebase sync error:', e);
    }
  }

  res.status(201).json({ 
    message: 'User registered successfully!', 
    user: { name, email: cleanEmail, steps: 0, isFirstLogin: true } 
  });
});

// Sign In Route
router.post('/signin', (req, res) => {
  const { loginIdentifier, password } = req.body; 

  console.log(`[Login Attempt] ID: '${loginIdentifier}', Pass: '${password}'`);

  const users = loadUsers();

  // Mobile Fix: Trim spaces and handle case-insensitivity for email
  const cleanIdentifier = loginIdentifier ? loginIdentifier.trim().toLowerCase() : '';
  const cleanPassword = password ? password.trim() : '';

  const userIndex = users.findIndex(u => {
      const uEmail = u.email.toLowerCase();
      const uPhone = u.phone;
      return (uEmail === cleanIdentifier || uPhone === loginIdentifier) && u.password === cleanPassword;
  });

  if (userIndex !== -1) {
    const user = users[userIndex];
    const isFirstLogin = user.isFirstLogin || false;
    
    // Update isFirstLogin to false after first login
    if (isFirstLogin) {
      users[userIndex].isFirstLogin = false;
      saveUsers(users);
    }
    
    console.log(`[Login Success] User: ${user.name}, First Login: ${isFirstLogin}`);
    res.status(200).json({ 
      message: isFirstLogin ? 'Welcome! This is your first login.' : 'Login successful!', 
      user: { 
        name: user.name, 
        email: user.email, 
        steps: user.steps || 0,
        isFirstLogin: isFirstLogin
      } 
    });
  } else {
    console.log(`[Login Failed] No match found.`);
    res.status(401).json({ message: 'Invalid credentials. Check for typos or extra spaces.' });
  }
});

// Update Steps Route
router.post('/update-steps', (req, res) => {
  const { email, steps } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });

  const users = loadUsers();
  
  const userIndex = users.findIndex(u => u.email === email);
  if (userIndex !== -1) {
    users[userIndex].steps = steps;
    saveUsers(users);
    res.json({ message: 'Steps updated.', totalSteps: steps });
  } else {
    // If updating steps for a user not strictly in "Sign Up" flow (like Google Login first timer)
    // we should validly handle it or return 404. Since we have auto-create in google-login, this should exist.
    // BUT! Google login might have a slightly different email structure or case. Let's normalize.
    res.status(404).json({ message: 'User not found in DB. Please re-login.' });
  }
});

// Google Login / Upsert Route
router.post('/google-login', async (req, res) => {
  const { email, name, picture, accessToken } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  
  const cleanEmail = email.trim().toLowerCase();
  const users = loadUsers();
  let userIndex = users.findIndex(u => u.email.toLowerCase() === cleanEmail);
  let isFirstLogin = false;
  let user;
  
  if (userIndex === -1) {
    // Create new user for Google Login (First time)
    isFirstLogin = true;
    user = {
      id: Date.now(),
      name: name || 'Google User',
      email: cleanEmail,
      steps: 0,
      picture,
      isFirstLogin: false, // Will be false after this login
      createdAt: new Date().toISOString()
    };
    users.push(user);
    saveUsers(users);
  } else {
    user = users[userIndex];
    isFirstLogin = user.isFirstLogin || false;
    
    // Update isFirstLogin to false
    if (isFirstLogin) {
      users[userIndex].isFirstLogin = false;
      saveUsers(users);
    }
  }
  
  // ALWAYS sync to Firebase (for both new and existing users)
  if (db) {
    try {
      const userRef = db.collection('users').doc(cleanEmail);
      await userRef.set({
        name: user.name,
        email: cleanEmail,
        steps: user.steps || 0,
        picture: picture || '',
        lastLogin: new Date().toISOString(),
        // Store the access token for sync-all feature (tokens expire in ~1 hour)
        accessToken: accessToken || null,
        tokenUpdated: accessToken ? new Date().toISOString() : null
      }, { merge: true });
      console.log(`[Firebase] User synced: ${cleanEmail}`);
    } catch (e) {
      console.error('Firebase sync error:', e);
    }
  } else {
    console.warn('[Firebase] DB not initialized - skipping sync');
  }
  
  res.status(200).json({ 
    message: isFirstLogin ? 'Welcome! Account created successfully.' : 'Login successful', 
    user: { ...user, isFirstLogin },
    isFirstLogin 
  });
});


// Leaderboard Route
router.get('/leaderboard', (req, res) => {
  const users = loadUsers();
  // Return users sorted by steps (descending), masking sensitive data
  const leaderboard = users
    .map(u => ({ name: u.name, steps: u.steps || 0 }))
    .sort((a, b) => b.steps - a.steps);
  
  res.json(leaderboard);
});

// ==================== FIREBASE ROUTES ====================

// Sync user to Firebase (with duplicate check)
router.post('/firebase/sync-user', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'Firebase not configured' });
  
  const { name, email, phone, steps, checkDuplicate } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  
  const cleanEmail = email.trim().toLowerCase();
  
  try {
    const userRef = db.collection('users').doc(cleanEmail);
    const userSnap = await userRef.get();
    
    // If checking for duplicates during signup
    if (checkDuplicate && userSnap.exists) {
      return res.status(409).json({ message: 'User with this email already exists.' });
    }
    
    // Check phone number duplicate if provided
    if (checkDuplicate && phone) {
      const phoneQuery = await db.collection('users').where('phone', '==', phone).get();
      if (!phoneQuery.empty) {
        return res.status(409).json({ message: 'User with this phone number already exists.' });
      }
    }
    
    if (!userSnap.exists) {
      // New user
      await userRef.set({ 
        name, 
        email: cleanEmail, 
        phone: phone || '',
        steps: steps || 0,
        isFirstLogin: true,
        createdAt: new Date().toISOString()
      });
      res.json({ message: 'User created in Firebase', isFirstLogin: true });
    } else {
      // Existing user - just update name if changed
      await userRef.set({ name, email: cleanEmail }, { merge: true });
      res.json({ message: 'User synced to Firebase', isFirstLogin: false });
    }
  } catch (error) {
    console.error('Firebase sync error:', error);
    res.status(500).json({ message: 'Firebase sync failed' });
  }
});

// Update steps in Firebase
router.post('/firebase/update-steps', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'Firebase not configured' });
  
  const { email, name, steps, isTestUser, lastSynced } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  
  try {
    const cleanEmail = email.trim().toLowerCase();
    const userRef = db.collection('users').doc(cleanEmail);
    await userRef.set({ 
      steps, 
      name: name || 'Unknown',
      email: cleanEmail,
      isTestUser: isTestUser || false,
      lastSynced: lastSynced || new Date().toISOString()
    }, { merge: true });
    
    res.json({ message: 'Steps updated in Firebase', steps, email: cleanEmail });
  } catch (error) {
    console.error('Firebase update error:', error);
    res.status(500).json({ message: 'Firebase update failed' });
  }
});

// Get leaderboard from Firebase
router.get('/firebase/leaderboard', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'Firebase not configured' });
  
  try {
    const snapshot = await db.collection('users')
      .orderBy('steps', 'desc')
      .get();
    
    const leaderboard = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        name: data.name,
        email: data.email,
        steps: data.steps || 0,
        isTestUser: data.isTestUser || false,
        lastSynced: data.lastSynced || null
      };
    });
    res.json(leaderboard);
  } catch (error) {
    console.error('Firebase leaderboard error:', error);
    res.status(500).json({ message: 'Failed to fetch leaderboard' });
  }
});

// Get user steps from Firebase
router.get('/firebase/user-steps/:email', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'Firebase not configured' });
  
  const { email } = req.params;
  
  try {
    const userRef = db.collection('users').doc(email);
    const userSnap = await userRef.get();
    
    if (userSnap.exists) {
      res.json({ steps: userSnap.data().steps || 0 });
    } else {
      res.json({ steps: 0 });
    }
  } catch (error) {
    console.error('Firebase get steps error:', error);
    res.status(500).json({ message: 'Failed to get steps' });
  }
});

// Sync ALL users' steps using their stored tokens
router.post('/firebase/sync-all-steps', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'Firebase not configured' });
  
  const axios = require('axios');
  const results = { success: [], failed: [], skipped: [] };
  
  try {
    // Get all users with tokens
    const snapshot = await db.collection('users').get();
    
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
          lastSynced: new Date().toISOString(),
          isTestUser: true
        }, { merge: true });
        
        results.success.push({ email: userEmail, steps: totalSteps });
        console.log(`[Sync-All] ${userEmail}: ${totalSteps} steps`);
        
      } catch (fetchError) {
        console.error(`[Sync-All] Failed for ${userEmail}:`, fetchError.message);
        results.failed.push({ email: userEmail, reason: fetchError.response?.status === 401 ? 'Token expired' : fetchError.message });
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

// ==================== END FIREBASE ROUTES ====================

// For Vercel Serverless (Export the App)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
