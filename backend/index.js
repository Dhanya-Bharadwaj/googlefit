const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const app = express();

// CORS - Allow both frontend URLs
app.use(cors({
  origin: ["https://googlefit.vercel.app", "https://googlefit-tracker.vercel.app", "http://localhost:3000"],
  credentials: true
}));
app.use(bodyParser.json());

// Google OAuth credentials from environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '771043035883-pd8m6muu3es7dcfn57so3onot8rk197h.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'postmessage';

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
    envSet: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    googleClientSecretSet: !!GOOGLE_CLIENT_SECRET
  });
});

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
// CRITICAL: This endpoint handles refresh tokens for offline access
app.post('/api/google-auth-callback', async (req, res) => {
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
    
    // Get user info
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    
    const googleUser = userInfoResponse.data;
    const cleanEmail = googleUser.email.trim().toLowerCase();
    
    // Save to Firebase with refresh token
    if (db) {
      try {
        const existingDoc = await db.collection('users').doc(cleanEmail).get();
        const existingData = existingDoc.exists ? existingDoc.data() : {};
        
        const updateData = {
          name: googleUser.name,
          email: cleanEmail,
          picture: googleUser.picture,
          steps: existingData.steps || 0,
          accessToken: access_token,
          tokenExpiry: Date.now() + (expires_in * 1000),
          lastLogin: new Date().toISOString(),
          googleFitEnabled: true
        };
        
        // Only update refreshToken if we received one
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
        steps: 0
      },
      accessToken: access_token,
      hasRefreshToken: !!refresh_token
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

// Get status of all users' refresh tokens (for dashboard)
app.get('/api/firebase/token-status', async (req, res) => {
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

// Sync a SINGLE user's steps using their refresh token
// This is useful for immediate sync when a user is logged in
app.post('/api/firebase/sync-user-steps', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  
  if (!db) return res.status(503).json({ message: 'Firebase not configured' });
  if (!GOOGLE_CLIENT_SECRET) return res.status(500).json({ message: 'GOOGLE_CLIENT_SECRET not configured' });
  
  const cleanEmail = email.trim().toLowerCase();

  // Helper to extract steps from Google Fit API response
  const extractStepsFromResponse = (response) => {
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

  // Calculate today's time range in IST (midnight IST to now)
  const getISTDayRange = () => {
    const now = new Date();
    // Convert current UTC time to IST
    const istNow = new Date(now.getTime() + (330 * 60 * 1000));
    // Get IST midnight for today
    const istMidnight = new Date(istNow);
    istMidnight.setHours(0, 0, 0, 0);
    // Convert IST midnight back to UTC millis
    const startTimeMillis = istMidnight.getTime() - (330 * 60 * 1000);
    const endTimeMillis = now.getTime();
    return { startTimeMillis, endTimeMillis, istDate: istMidnight.toISOString().split('T')[0] };
  };

  try {
    const userDoc = await db.collection('users').doc(cleanEmail).get();
    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userData = userDoc.data();
    const refreshToken = userData.refreshToken;
    let accessToken = userData.accessToken;

    if (!refreshToken && !accessToken) {
      return res.status(400).json({ message: 'No tokens available - user needs to login with Google' });
    }

    let usedToken = accessToken;
    let tokenRefreshed = false;

    // Try to refresh token if we have one
    if (refreshToken) {
      const newAccessToken = await refreshAccessToken(refreshToken);
      if (newAccessToken) {
        usedToken = newAccessToken;
        tokenRefreshed = true;
        await db.collection('users').doc(cleanEmail).set({
          accessToken: newAccessToken,
          tokenExpiry: Date.now() + (3600 * 1000)
        }, { merge: true });
        console.log(`[Sync-User] Token refreshed for ${cleanEmail}`);
      }
    }

    if (!usedToken) {
      return res.status(400).json({ message: 'Failed to get valid access token' });
    }

    const { startTimeMillis, endTimeMillis, istDate } = getISTDayRange();

    // Only use the main Google Fit step data source for the IST day
    const response = await axios.post(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
        bucketByTime: { durationMillis: endTimeMillis - startTimeMillis + 1 },
        startTimeMillis,
        endTimeMillis
      },
      { headers: { Authorization: `Bearer ${usedToken}` } }
    );
    const steps = extractStepsFromResponse(response);

    // Update user in Firebase
    await db.collection('users').doc(cleanEmail).set({
      steps,
      lastSynced: new Date().toISOString(),
      stepSource: 'com.google.step_count.delta',
      syncDate: istDate
    }, { merge: true });

    res.json({
      message: 'Steps synced successfully',
      email: cleanEmail,
      steps,
      source: 'com.google.step_count.delta',
      tokenRefreshed,
      syncDate: istDate,
      timeRange: {
        start: new Date(startTimeMillis).toISOString(),
        end: new Date(endTimeMillis).toISOString()
      }
    });

  } catch (error) {
    let reason = error.message;
    if (error.response?.status === 401) {
      reason = 'Token expired or revoked - please re-login with Google';
    } else if (error.response?.status === 403) {
      reason = 'Access denied - fitness permissions may be revoked';
    }
    res.status(500).json({ message: reason, error: error.response?.data || error.message });
  }
});

// Sync ALL users' steps using their stored REFRESH TOKENS (background sync)
app.post('/api/firebase/sync-all-steps', async (req, res) => {
  if (!db) {
    return res.status(503).json({ message: 'Firebase not configured' });
  }

  if (!GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ message: 'GOOGLE_CLIENT_SECRET not configured' });
  }

  const results = { success: [], failed: [], skipped: [] };

  // Helper to extract steps from Google Fit API response
  const extractStepsFromResponse = (response) => {
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

  // Calculate today's time range in IST (midnight IST to now)
  const getISTDayRange = () => {
    const now = new Date();
    // Convert current UTC time to IST
    const istNow = new Date(now.getTime() + (330 * 60 * 1000));
    // Get IST midnight for today
    const istMidnight = new Date(istNow);
    istMidnight.setHours(0, 0, 0, 0);
    // Convert IST midnight back to UTC millis
    const startTimeMillis = istMidnight.getTime() - (330 * 60 * 1000);
    const endTimeMillis = now.getTime();
    return { startTimeMillis, endTimeMillis, istDate: istMidnight.toISOString().split('T')[0] };
  };

  try {
    const snapshot = await db.collection('users').get();
    const { startTimeMillis, endTimeMillis, istDate } = getISTDayRange();

    for (const doc of snapshot.docs) {
      const userData = doc.data();
      const userEmail = userData.email;
      let accessToken = userData.accessToken;
      const refreshToken = userData.refreshToken;

      if (!refreshToken) {
        results.skipped.push({ email: userEmail, reason: 'No refresh token - user needs to re-login to enable offline sync' });
        continue;
      }

      try {
        let tokenRefreshed = false;
        let usedToken = accessToken;

        // Always try to refresh token first
        const newAccessToken = await refreshAccessToken(refreshToken);
        if (newAccessToken) {
          usedToken = newAccessToken;
          tokenRefreshed = true;
          await db.collection('users').doc(userEmail).set({
            accessToken: newAccessToken,
            tokenExpiry: Date.now() + (3600 * 1000)
          }, { merge: true });
        } else if (!accessToken) {
          throw new Error('Token refresh failed and no access token available');
        }

        // Only use the main Google Fit step data source for the IST day
        const response = await axios.post(
          'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
          {
            aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
            bucketByTime: { durationMillis: endTimeMillis - startTimeMillis + 1 },
            startTimeMillis,
            endTimeMillis
          },
          { headers: { Authorization: `Bearer ${usedToken}` } }
        );
        const steps = extractStepsFromResponse(response);

        await db.collection('users').doc(userEmail).set({
          steps,
          lastSynced: new Date().toISOString(),
          stepSource: 'com.google.step_count.delta',
          syncDate: istDate
        }, { merge: true });

        results.success.push({
          email: userEmail,
          steps,
          tokenRefreshed,
          source: 'com.google.step_count.delta'
        });

      } catch (fetchError) {
        let reason = fetchError.message;
        if (fetchError.response?.status === 401) {
          reason = 'Refresh token revoked or expired - user needs to re-login';
          await db.collection('users').doc(userEmail).set({
            tokenStatus: 'expired',
            lastSyncError: reason,
            lastSyncAttempt: new Date().toISOString()
          }, { merge: true });
        } else if (fetchError.response?.status === 403) {
          reason = 'Access denied - user may have revoked fitness permissions';
        }
        results.failed.push({ email: userEmail, reason });
      }
    }

    res.json({
      message: `Synced ${results.success.length} users, ${results.failed.length} failed, ${results.skipped.length} skipped`,
      results,
      syncDate: istDate,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
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
