require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { db } = require('./firebaseAdmin');

const app = express();
const PORT = 5000;
const DB_FILE = path.join(__dirname, 'users.json');

// Google OAuth credentials - set these in environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '771043035883-pd8m6muu3es7dcfn57so3onot8rk197h.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''; // You need to set this!
// CRITICAL: For @react-oauth/google with auth-code flow, use 'postmessage' as redirect_uri
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'postmessage';

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

// Helper function to refresh access token using refresh token
const refreshAccessToken = async (refreshToken) => {
  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Failed to refresh token:', error.response?.data || error.message);
    return null;
  }
};

// Google Auth Callback - Exchange auth code for tokens (including refresh token)
// CRITICAL: This endpoint properly handles refresh tokens for offline access
router.post('/google-auth-callback', async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ message: 'Authorization code required' });
  }
  
  if (!GOOGLE_CLIENT_SECRET) {
    console.error('GOOGLE_CLIENT_SECRET is not set!');
    return res.status(500).json({ message: 'Server configuration error: Client secret not set' });
  }
  
  try {
    // Exchange authorization code for tokens
    // Using 'postmessage' as redirect_uri for @react-oauth/google popup flow
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    console.log('=== TOKEN EXCHANGE SUCCESS ===');
    console.log('Access token received:', !!access_token);
    console.log('Refresh token received:', !!refresh_token);
    console.log('Expires in:', expires_in, 'seconds');
    
    // Get user info
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    
    const googleUser = userInfoResponse.data;
    const cleanEmail = googleUser.email.trim().toLowerCase();
    
    // Save/update user in local DB
    const users = loadUsers();
    let userIndex = users.findIndex(u => u.email.toLowerCase() === cleanEmail);
    let user;
    
    if (userIndex === -1) {
      user = {
        id: Date.now(),
        name: googleUser.name,
        email: cleanEmail,
        picture: googleUser.picture,
        steps: 0,
        createdAt: new Date().toISOString()
      };
      users.push(user);
    } else {
      user = users[userIndex];
    }
    saveUsers(users);
    
    // Save to Firebase with refresh token (for sync-all feature)
    // CRITICAL: Only update refresh token if we received a new one (never overwrite with null)
    if (db) {
      try {
        // First, get existing user data to preserve refresh token if not received
        const existingDoc = await db.collection('users').doc(cleanEmail).get();
        const existingData = existingDoc.exists ? existingDoc.data() : {};
        
        // Build update object - NEVER overwrite refresh token with null/undefined
        const updateData = {
          name: googleUser.name,
          email: cleanEmail,
          picture: googleUser.picture,
          steps: user.steps || existingData.steps || 0,
          accessToken: access_token,
          tokenExpiry: Date.now() + (expires_in * 1000),
          lastLogin: new Date().toISOString(),
          googleFitEnabled: true
        };
        
        // CRITICAL: Only update refreshToken if we actually received one
        // This prevents overwriting stored refresh token with null on subsequent logins
        if (refresh_token) {
          updateData.refreshToken = refresh_token;
          console.log(`[Firebase] NEW refresh token stored for ${cleanEmail}`);
        } else if (existingData.refreshToken) {
          console.log(`[Firebase] Keeping existing refresh token for ${cleanEmail}`);
        } else {
          console.warn(`[Firebase] WARNING: No refresh token available for ${cleanEmail}`);
        }
        
        await db.collection('users').doc(cleanEmail).set(updateData, { merge: true });
        console.log(`[Firebase] User saved: ${cleanEmail}`);
      } catch (e) {
        console.error('Firebase save error:', e);
      }
    }
    
    res.json({
      message: 'Login successful',
      user: {
        name: googleUser.name,
        email: cleanEmail,
        picture: googleUser.picture,
        steps: user.steps || 0
      },
      accessToken: access_token,
      hasRefreshToken: !!refresh_token // Let frontend know if refresh token was stored
    });
    
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    res.status(500).json({ 
      message: 'Failed to authenticate with Google',
      error: error.response?.data?.error_description || error.message 
    });
  }
});

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

// Sync ALL users' steps using their stored REFRESH TOKENS (background sync - no user login needed)
// This is the CORRECT way to fetch steps for offline users
router.post('/firebase/sync-all-steps', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'Firebase not configured' });
  
  if (!GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ message: 'GOOGLE_CLIENT_SECRET not configured - cannot refresh tokens' });
  }
  
  const results = { success: [], failed: [], skipped: [] };
  
  // Helper function to fetch steps with a given token
  // Tries MULTIPLE data sources and returns the HIGHEST value for accuracy
  async function fetchStepsWithToken(token, startTimeMillis, endTimeMillis, userEmail) {
    const stepCounts = [];
    
    console.log(`[FetchSteps] ${userEmail}: Fetching from ${new Date(startTimeMillis).toISOString()} to ${new Date(endTimeMillis).toISOString()}`);
    
    // Helper to extract steps from response
    const extractSteps = (response) => {
      let steps = 0;
      if (response.data.bucket && response.data.bucket.length > 0) {
        response.data.bucket.forEach(bucket => {
          if (bucket.dataset) {
            bucket.dataset.forEach(ds => {
              if (ds.point) {
                ds.point.forEach(p => {
                  if (p.value && p.value.length > 0) {
                    steps += p.value[0].intVal || 0;
                  }
                });
              }
            });
          }
        });
      }
      return steps;
    };
    
    try {
      // Method 1: Query WITHOUT dataSourceId (gets merged data from ALL sources - most accurate)
      try {
        const mergedResponse = await axios.post(
          'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
          {
            aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
            bucketByTime: { durationMillis: endTimeMillis - startTimeMillis },
            startTimeMillis,
            endTimeMillis
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const mergedSteps = extractSteps(mergedResponse);
        stepCounts.push({ source: 'merged', steps: mergedSteps });
        console.log(`[FetchSteps] ${userEmail}: Merged sources = ${mergedSteps} steps`);
      } catch (e) {
        console.log(`[FetchSteps] ${userEmail}: Merged query failed:`, e.message);
      }
      
      // Method 2: Try estimated_steps (Google's calculated estimate)
      try {
        const estimatedResponse = await axios.post(
          'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
          {
            aggregateBy: [{
              dataTypeName: "com.google.step_count.delta",
              dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
            }],
            bucketByTime: { durationMillis: endTimeMillis - startTimeMillis },
            startTimeMillis,
            endTimeMillis
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const estimatedSteps = extractSteps(estimatedResponse);
        stepCounts.push({ source: 'estimated_steps', steps: estimatedSteps });
        console.log(`[FetchSteps] ${userEmail}: Estimated steps = ${estimatedSteps} steps`);
      } catch (e) {
        console.log(`[FetchSteps] ${userEmail}: Estimated query failed:`, e.message);
      }
      
      // Method 3: Try merge_step_deltas (another merged source)
      try {
        const mergeResponse = await axios.post(
          'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
          {
            aggregateBy: [{
              dataTypeName: "com.google.step_count.delta",
              dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas"
            }],
            bucketByTime: { durationMillis: endTimeMillis - startTimeMillis },
            startTimeMillis,
            endTimeMillis
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const mergeSteps = extractSteps(mergeResponse);
        stepCounts.push({ source: 'merge_step_deltas', steps: mergeSteps });
        console.log(`[FetchSteps] ${userEmail}: Merge deltas = ${mergeSteps} steps`);
      } catch (e) {
        console.log(`[FetchSteps] ${userEmail}: Merge deltas query failed:`, e.message);
      }
      
    } catch (fetchError) {
      console.error(`[FetchSteps] ${userEmail}: API Error:`, fetchError.response?.data || fetchError.message);
      throw fetchError;
    }
    
    // Return the HIGHEST step count from all sources (most accurate)
    const maxSteps = stepCounts.length > 0 ? Math.max(...stepCounts.map(s => s.steps)) : 0;
    const bestSource = stepCounts.find(s => s.steps === maxSteps);
    
    console.log(`[FetchSteps] ${userEmail}: All sources: ${JSON.stringify(stepCounts)}`);
    console.log(`[FetchSteps] ${userEmail}: BEST = ${maxSteps} steps (from ${bestSource?.source || 'none'})`);
    
    return maxSteps;
  }
  
  try {
    // Get all users from Firebase
    const snapshot = await db.collection('users').get();
    console.log(`[Sync-All] Processing ${snapshot.docs.length} users...`);
    
    for (const doc of snapshot.docs) {
      const userData = doc.data();
      const userEmail = userData.email;
      let accessToken = userData.accessToken;
      const refreshToken = userData.refreshToken;
      
      // CRITICAL: Prioritize refresh token - this enables offline sync
      if (!refreshToken) {
        if (!accessToken) {
          results.skipped.push({ email: userEmail, reason: 'No tokens stored - user needs to login with Google' });
        } else {
          results.skipped.push({ email: userEmail, reason: 'No refresh token - user needs to re-login to enable offline sync' });
        }
        continue;
      }
      
      try {
        // Calculate time range in IST (Indian Standard Time, UTC+5:30)
        // This ensures we get "today's" steps in the user's local timezone
        const now = new Date();
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        
        // Get current time as IST
        const nowIST = new Date(now.getTime() + IST_OFFSET_MS + (now.getTimezoneOffset() * 60 * 1000));
        
        // Calculate start of day in IST (midnight IST)
        const startOfDayIST = new Date(nowIST);
        startOfDayIST.setHours(0, 0, 0, 0);
        
        // Convert back to UTC milliseconds for Google Fit API
        const startTimeMillis = startOfDayIST.getTime() - IST_OFFSET_MS - (now.getTimezoneOffset() * 60 * 1000);
        const endTimeMillis = now.getTime();
        
        console.log(`[Sync-All] ${userEmail}: IST Date = ${nowIST.toISOString().split('T')[0]}, Start = ${new Date(startTimeMillis).toISOString()}, End = ${new Date(endTimeMillis).toISOString()}`);
        
        let totalSteps = 0;
        let tokenRefreshed = false;
        let usedToken = accessToken;
        
        // ALWAYS try to refresh token first for reliability (access tokens expire in 1 hour)
        // This ensures we can sync even if user hasn't opened the app for days
        console.log(`[Sync-All] Refreshing token for ${userEmail}...`);
        const newAccessToken = await refreshAccessToken(refreshToken);
        
        if (newAccessToken) {
          usedToken = newAccessToken;
          tokenRefreshed = true;
          
          // Update stored access token in Firebase
          await db.collection('users').doc(userEmail).set({
            accessToken: newAccessToken,
            tokenExpiry: Date.now() + (3600 * 1000) // 1 hour from now
          }, { merge: true });
          
          console.log(`[Sync-All] Token refreshed for ${userEmail}`);
        } else if (accessToken) {
          // Refresh failed but we have an access token, try it anyway
          console.log(`[Sync-All] Refresh failed for ${userEmail}, trying existing access token...`);
          usedToken = accessToken;
        } else {
          throw new Error('Token refresh failed and no access token available');
        }
        
        // Fetch steps using the token
        totalSteps = await fetchStepsWithToken(usedToken, startTimeMillis, endTimeMillis, userEmail);
        
        // Update user's steps in Firebase
        await db.collection('users').doc(userEmail).set({
          steps: totalSteps,
          lastSynced: new Date().toISOString()
        }, { merge: true });
        
        results.success.push({ 
          email: userEmail, 
          steps: totalSteps,
          tokenRefreshed 
        });
        console.log(`[Sync-All] ✅ ${userEmail}: ${totalSteps} steps${tokenRefreshed ? ' (token refreshed)' : ''}`);
        
      } catch (fetchError) {
        console.error(`[Sync-All] ❌ Failed for ${userEmail}:`, fetchError.response?.data || fetchError.message);
        
        let reason = fetchError.message;
        if (fetchError.response?.status === 401) {
          reason = 'Refresh token revoked or expired - user needs to re-login';
          // Mark this user as needing re-authentication
          await db.collection('users').doc(userEmail).set({
            tokenStatus: 'expired',
            lastSyncError: reason,
            lastSyncAttempt: new Date().toISOString()
          }, { merge: true });
        } else if (fetchError.response?.status === 403) {
          reason = 'Access denied - user may have revoked fitness permissions';
        }
        
        results.failed.push({ 
          email: userEmail, 
          reason 
        });
      }
    }
    
    console.log(`[Sync-All] Complete: ${results.success.length} success, ${results.failed.length} failed, ${results.skipped.length} skipped`);
    
    res.json({
      message: `Synced ${results.success.length} users, ${results.failed.length} failed, ${results.skipped.length} skipped`,
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Sync-all error:', error);
    res.status(500).json({ message: 'Sync-all failed', error: error.message });
  }
});

// Get status of all users' refresh tokens (for admin dashboard)
router.get('/firebase/token-status', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'Firebase not configured' });
  
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        email: data.email,
        name: data.name,
        hasRefreshToken: !!data.refreshToken,
        hasAccessToken: !!data.accessToken,
        lastLogin: data.lastLogin,
        lastSynced: data.lastSynced,
        tokenStatus: data.tokenStatus || (data.refreshToken ? 'valid' : 'missing'),
        googleFitEnabled: data.googleFitEnabled || false
      };
    });
    
    const summary = {
      total: users.length,
      withRefreshToken: users.filter(u => u.hasRefreshToken).length,
      withoutRefreshToken: users.filter(u => !u.hasRefreshToken).length,
      canSyncOffline: users.filter(u => u.hasRefreshToken).length
    };
    
    res.json({ users, summary });
  } catch (error) {
    console.error('Token status error:', error);
    res.status(500).json({ message: 'Failed to get token status' });
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
