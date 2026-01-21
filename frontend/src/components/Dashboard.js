import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Trophy, RefreshCw, LogOut, Crown } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import API_URL from '../config/api';
import IntroAnimation from './IntroAnimation';
import '../styles/Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showIntro, setShowIntro] = useState(location.state?.showIntro || false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [steps, setSteps] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(localStorage.getItem('last_sync_time') || '--');
  const [topUser, setTopUser] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/firebase/leaderboard`);
      const data = await response.json();
      setLeaderboard(data);
      
      // Find top user (highest steps)
      if (data && data.length > 0) {
        const top = data.reduce((max, user) => (user.steps > max.steps ? user : max), data[0]);
        setTopUser(top);
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  }, []);

  useEffect(() => {
    // Load user from local storage (set during login)
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/');
      return;
    }
    const parsedUser = JSON.parse(storedUser);
    
    // Instead of trusting local storage completely, let's trust the backend for steps
    // We kept the rest of the user object for name/email
    setCurrentUser(parsedUser);

    // Initial Leaderboard Load
    fetchLeaderboard().then(() => {
       // After fetching leaderboard, update local 'steps' state from the cloud data if available
       // fetchLeaderboard sets state 'leaderboard', but React state updates are async, 
       // so better to fetch specific user doc or re-query for current user here.
       // For simplicity, we'll just re-query the collection or rely on the next render if we used a listener.
       // Let's just do a direct read for the user to be sure.
       // Actually, let's just piggyback on the list logic we just replaced.
       // Re-implementing the logic inside the promise chain of getDocs would be cleanest but I separated them.
    });

    // Fetch single user to sync steps immediately
    const fetchUserSteps = async () => {
         try {
            const response = await fetch(`${API_URL}/api/firebase/leaderboard`);
            const data = await response.json();
            setLeaderboard(data);
            
            const myRecord = data.find(u => u.email === parsedUser.email);
            if(myRecord) {
                setSteps(myRecord.steps);
            } else {
                setSteps(parsedUser.steps || 0);
            }
         } catch (e) { console.error(e); }
    };
    fetchUserSteps();

  }, [navigate, fetchLeaderboard]); 

  const updateBackendSteps = async (newSteps) => {
    if (currentUser) {
        try {
            await fetch(`${API_URL}/api/firebase/update-steps`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: currentUser.email, 
                    name: currentUser.name,
                    steps: newSteps 
                })
            });
            
            fetchLeaderboard(); // Refresh list
        } catch (e) {
            console.error("Sync failed", e);
        }
    }
  };

  // Sync function that uses the STORED access token from login (no new account selection)
  const syncGoogleFitSteps = async () => {
    const accessToken = localStorage.getItem('google_access_token');
    
    if (!accessToken) {
      alert("No Google account connected.\n\nPlease log out and sign in again with Google to enable step syncing.");
      return;
    }

    if (!currentUser) {
      alert("User not loaded. Please refresh the page.");
      return;
    }

    setIsSyncing(true);

    try {
      console.log("Using stored access token for:", currentUser.email);

      // 1. Fetch Step Count for Today (Start of day to Now)
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const startTimeMillis = startOfDay.getTime();
      const endTimeMillis = now.getTime() + 60000; // 1 min buffer

      console.log("Syncing range:", new Date(startTimeMillis).toLocaleString(), "to", new Date(endTimeMillis).toLocaleString());

      // Try multiple data sources for maximum accuracy
      let totalSteps = 0;

      // Method 1: Try the merged/estimated steps first (most accurate)
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
        console.log("Method 1 (estimated_steps):", totalSteps);
      } catch (e) {
        console.log("Method 1 failed, trying Method 2...", e.message);
      }

      // Method 2: If Method 1 returns 0, try the generic aggregation
      if (totalSteps === 0) {
        try {
          const response2 = await axios.post(
            'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
            {
              aggregateBy: [{
                dataTypeName: "com.google.step_count.delta"
              }],
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
          console.log("Method 2 (generic):", totalSteps);
        } catch (e) {
          console.log("Method 2 also failed", e.message);
        }
      }

      // Method 3: If still 0, try merge_step_deltas
      if (totalSteps === 0) {
        try {
          const response3 = await axios.post(
            'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
            {
              aggregateBy: [{
                dataTypeName: "com.google.step_count.delta",
                dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas"
              }],
              bucketByTime: { durationMillis: 86400000 },
              startTimeMillis,
              endTimeMillis
            },
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          if (response3.data.bucket && response3.data.bucket.length > 0) {
            response3.data.bucket.forEach(bucket => {
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
          console.log("Method 3 (merge_step_deltas):", totalSteps);
        } catch (e) {
          console.log("Method 3 also failed", e.message);
        }
      }

      console.log("Final Total Steps:", totalSteps);

      // Update the LOGGED IN user's steps (using their stored email, not a new OAuth)
      const timeStr = new Date().toLocaleTimeString();
      setLastSyncTime(timeStr);
      localStorage.setItem('last_sync_time', timeStr);

      // Update backend for the CURRENT logged-in user
      try {
        await fetch(`${API_URL}/api/firebase/update-steps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: currentUser.email,
            name: currentUser.name, // Keep the original name, don't overwrite
            steps: totalSteps,
            isTestUser: true,
            lastSynced: new Date().toISOString()
          })
        });
        console.log(`Updated steps for ${currentUser.email}: ${totalSteps}`);
      } catch (e) {
        console.error("Backend update failed", e);
      }

      // Update local state
      setSteps(totalSteps);
      const updatedUser = { ...currentUser, steps: totalSteps };
      setCurrentUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));

      // Refresh leaderboard
      fetchLeaderboard();

      if (totalSteps > 0) {
        alert(`✅ Synced Successfully!\n\nAccount: ${currentUser.email}\nSteps: ${totalSteps.toLocaleString()}\nTime: ${timeStr}\n\nIf this is lower than your phone, open Google Fit app and pull down to refresh.`);
      } else {
        alert(`⚠️ Sync Complete\n\nAccount: ${currentUser.email}\n0 steps found for today.\n\nTips:\n1. Open Google Fit app on phone and pull down to refresh\n2. Make sure you're logged into the same Google account\n3. Wait 10 seconds and sync again`);
      }

    } catch (error) {
      console.error("Sync Error:", error);

      // Token might be expired
      if (error.response?.status === 401) {
        alert("Session expired. Please log out and sign in again with Google.");
        localStorage.removeItem('google_access_token');
      } else if (error.response?.status === 403) {
        alert("Permission denied. Please log out and sign in again, and make sure to allow Google Fit access.");
      } else {
        alert("Failed to sync. Error: " + (error.message || "Unknown error"));
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const initiateSync = () => {
    syncGoogleFitSteps();
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  if (showIntro) {
      return <IntroAnimation onComplete={() => {
        setShowIntro(false);
        // Clear navigation state so refresh doesn't trigger animation again
        window.history.replaceState({}, document.title);
      }} />;
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="logo-section">
          <Activity color="#6200ea" size={32} />
          <h1>Fitness Tracker</h1>
        </div>
        <div className="user-section">
          <span>Welcome, {currentUser?.name}</span>
          <button onClick={handleLogout} className="logout-btn"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="dashboard-content">
        {/* Left Panel: Personal Stats */}
        <div 
            className="stats-card"
        >
          <h2>Your Activity</h2>
          <div className="step-display">
            <div className="step-circle">
                 <span className="step-count">{steps.toLocaleString()}</span>
            </div>
            <span className="step-label">steps today</span>
          </div>
          
          <button className="sync-btn" onClick={initiateSync} disabled={isSyncing}>
            <RefreshCw size={20} className={isSyncing ? 'spinning' : ''} />
            {isSyncing ? 'Syncing...' : 'Sync with Google Fit'}
          </button>
          
          <p className="sync-note">
            Syncing for: <strong>{currentUser?.email}</strong>
          </p>
          
          {/* Top User Card */}
          {topUser && (
            <div className="top-user-card">
              <div className="top-user-header">
                <Crown size={20} color="#eab308" />
                <span>Today's Leader</span>
              </div>
              <div className="top-user-info">
                <span className="top-user-name">{topUser.name}</span>
                <span className="top-user-steps">{(topUser.steps || 0).toLocaleString()} steps</span>
              </div>
            </div>
          )}
          
          <div className="accuracy-tip">
            <h3>Syncing Issues?</h3>
            <ol>
              <li>Open <strong>Google Fit app</strong> on your phone.</li>
              <li>Pull down on the main screen to <strong>Force Sync</strong>.</li>
              <li>Wait 10 seconds, then click the sync button above.</li>
            </ol>
            <p>Last Synced: {lastSyncTime}</p>
          </div>
        </div>

        {/* Right Panel: Leaderboard */}
        <div 
            className="leaderboard-card"
        >
          <div className="leaderboard-header">
            <Trophy color="#facc15" size={24} />
            <h2>Company Leaderboard</h2>
          </div>
          
          {/* All Users Leaderboard */}
          <div className="leaderboard-list">
            {leaderboard.length > 0 ? (
              leaderboard.map((user, index) => (
                <div 
                  key={index} 
                  className={`leaderboard-item ${user.email?.toLowerCase() === currentUser?.email?.toLowerCase() ? 'current-user' : ''}`}
                >
                  <div className="rank">{index + 1}</div>
                  <div className="user-info">
                    <span className="user-name">{user.name}</span>
                    <span className="user-email">{user.email}</span>
                  </div>
                  <div className="user-steps">{(user.steps || 0).toLocaleString()}</div>
                </div>
              ))
            ) : (
              <div style={{padding: '20px', textAlign: 'center', color: '#64748b'}}>
                Loading leaderboard...
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
