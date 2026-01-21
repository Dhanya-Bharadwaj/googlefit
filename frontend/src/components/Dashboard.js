import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Trophy, RefreshCw, LogOut, Users, TestTube2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
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

  const fetchLeaderboard = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/firebase/leaderboard`);
      const data = await response.json();
      setLeaderboard(data);
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

  const handleSyncGoogleFit = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
        try {
            const accessToken = tokenResponse.access_token;
            console.log("Access Token:", accessToken);

            // 0. First, get the Google account info of the person syncing
            const userInfoResponse = await axios.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const syncingUser = userInfoResponse.data;
            console.log("Syncing account:", syncingUser.email);

            // 1. Check if the user actually has Google Fit Data Sources
            let dsResponse;
            try {
                dsResponse = await axios.get(
                    'https://www.googleapis.com/fitness/v1/users/me/dataSources',
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
            } catch (dsError) {
                console.error("Data Sources Error:", dsError);
                alert(`Account "${syncingUser.email}" does not have Google Fit data or hasn't granted permission.\n\nPlease ensure:\n1. Google Fit app is installed on your phone\n2. You've logged into Google Fit with this account\n3. You've walked at least a few steps`);
                return;
            }
            
            console.log("Available Data Sources:", dsResponse.data.dataSource?.map(ds => ds.dataType.name));

            // 2. Fetch Step Count for Today (Start of day to Now)
            const now = new Date();
            
            // Set to beginning of TODAY in local time
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const startTimeMillis = startOfDay.getTime();
            
            // Set to end of TODAY (23:59:59) or just "now" for current progress
            // Using "now" is correct for current progress, but we'll add 1 minute buffer for safety against server clock skew
            const endTimeMillis = now.getTime() + 60000; 

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
                console.log("Method 1 failed, trying Method 2...");
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
                    console.log("Method 2 also failed");
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
                    console.log("Method 3 also failed");
                }
            }

            console.log("Final Total Steps:", totalSteps);

            // 3. Update the SYNCING USER's data in backend (not the logged-in user)
            const timeStr = new Date().toLocaleTimeString();
            setLastSyncTime(timeStr);
            localStorage.setItem('last_sync_time', timeStr);

            // Update backend for the Google account that was synced
            try {
                await fetch(`${API_URL}/api/firebase/update-steps`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: syncingUser.email, 
                        name: syncingUser.name,
                        steps: totalSteps,
                        isTestUser: true,
                        lastSynced: new Date().toISOString()
                    })
                });
                console.log(`Updated steps for ${syncingUser.email}: ${totalSteps}`);
            } catch (e) {
                console.error("Backend update failed", e);
            }

            // If the syncing user is the same as logged-in user, update local state too
            if (currentUser && syncingUser.email.toLowerCase() === currentUser.email?.toLowerCase()) {
                setSteps(totalSteps);
                const updatedUser = { ...currentUser, steps: totalSteps };
                setCurrentUser(updatedUser);
                localStorage.setItem('user', JSON.stringify(updatedUser));
            }
            
            // Refresh leaderboard to show updated data
            fetchLeaderboard();
            
            if (totalSteps > 0) {
                alert(`✅ Synced for: ${syncingUser.email}\n\nSteps: ${totalSteps.toLocaleString()}\nTime: ${timeStr}\n\nNote: If this is lower than your phone, please "Pull Down to Refresh" inside your mobile Google Fit app.`);
            } else {
                alert(`⚠️ Sync Complete for: ${syncingUser.email}\n\n0 steps found for today.\n\nPossible reasons:\n1. Phone hasn't synced to cloud yet (open Google Fit app and pull down)\n2. No walking activity recorded today\n3. Different Google account than the one on your phone`);
            }

        } catch (error) {
            console.error("Critical Sync Error:", error);
            if (error.response?.status === 403) {
                alert("Permission Denied: Ensure you haven't restricted access to physical activity data in the Google Consent Screen.");
            } else if (error.response?.status === 401) {
                alert("Authentication Error: Please try syncing again.");
            } else {
                alert("Failed to connect to Google Fit. Please try again or check your internet connection.\n\nError: " + (error.message || "Unknown"));
            }
        }
    },
    onError: error => {
        console.error("OAuth Error:", error);
        alert("Authentication failed. Please try again.");
    },
    scope: 'openid email profile https://www.googleapis.com/auth/fitness.activity.read'
  });

  const initiateSync = () => {
      // Consent Dialog
      const isReady = window.confirm(
          "We are about to connect to Google Fit to read your step count.\n\n" +
          "Are you ready to share your Google Fit data?"
      );
      if (isReady) {
          handleSyncGoogleFit();
      }
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
          
          <button className="sync-btn" onClick={initiateSync}>
            <RefreshCw size={20} />
            Sync with Google Fit
          </button>
          
          <p className="sync-note">
            Tap sync to update your steps from the cloud.
          </p>
          
          <div className="accuracy-tip">
            <h3>Syncing Issues?</h3>
            <ol>
              <li>Open <strong>Google Fit app</strong> on your phone.</li>
              <li>Pull down on the main screen to <strong>Force Sync</strong>.</li>
              <li>Wait 10 seconds, then click the sync button above.</li>
            </ol>
            <p>Last Synced: {lastSyncTime}</p>
          </div>
          
          {/* Debug Info for User */}
          <div style={{fontSize: '0.8rem', color: '#cbd5e1', marginTop: '10px', textAlign: 'center'}}>
             API Active
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
          
          {/* Test Users Section */}
          {leaderboard.filter(u => u.isTestUser).length > 0 && (
            <div className="test-users-section">
              <div className="test-users-header">
                <TestTube2 size={16} color="#8b5cf6" />
                <span>Test Users (Google Fit Synced)</span>
              </div>
              <div className="leaderboard-list">
                {leaderboard.filter(u => u.isTestUser).sort((a, b) => b.steps - a.steps).map((user, index) => (
                  <div 
                    key={`test-${index}`} 
                    className={`leaderboard-item test-user-item ${user.email === currentUser?.email ? 'current-user' : ''}`}
                  >
                    <div className="rank">{index + 1}</div>
                    <div className="user-info">
                      <span className="user-name">{user.name}</span>
                      <span className="user-email">{user.email}</span>
                    </div>
                    <div className="user-steps">{(user.steps || 0).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* All Users Section */}
          <div className="all-users-section">
            <div className="all-users-header">
              <Users size={16} color="#64748b" />
              <span>All Registered Users</span>
            </div>
            <div className="leaderboard-list">
              {leaderboard.length > 0 ? (
                leaderboard.map((user, index) => (
                  <div 
                    key={index} 
                    className={`leaderboard-item ${user.email === currentUser?.email ? 'current-user' : ''} ${user.isTestUser ? 'is-test-user' : ''}`}
                  >
                    <div className="rank">{index + 1}</div>
                    <div className="user-info">
                      <span className="user-name">
                        {user.name}
                        {user.isTestUser && <span className="test-badge">TEST</span>}
                      </span>
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
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
