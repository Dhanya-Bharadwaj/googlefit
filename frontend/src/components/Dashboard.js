import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Trophy, RefreshCw, LogOut } from 'lucide-react';
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

            // 1. Check if the user actually has Google Fit Data Sources
            // This helps identify if they've ever used the app with this account.
            const dsResponse = await axios.get(
                'https://www.googleapis.com/fitness/v1/users/me/dataSources',
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            
            const hasStepSource = dsResponse.data.dataSource.some(ds => 
                ds.dataType.name === "com.google.step_count.delta"
            );

            if (!hasStepSource) {
                 alert("Account Error: It looks like this Google account hasn't logged into the Google Fit app on a mobile device yet, or no activity data exists.");
                 return;
            }

            // 2. Fetch Step Count for Today (Start of day to Now)
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startTimeMillis = startOfDay.getTime();
            const endTimeMillis = now.getTime();

            const response = await axios.post(
                'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
                {
                    aggregateBy: [{
                        dataTypeName: "com.google.step_count.delta",
                        dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
                    }],
                    bucketByTime: { durationMillis: 86400000 }, // 24h bucket ensures we get the daily total
                    startTimeMillis,
                    endTimeMillis
                },
                {
                    headers: { Authorization: `Bearer ${accessToken}` }
                }
            );
            
            console.log("Google Fit Aggregate Response:", response.data);

            // Parse steps from the bucket
            let totalSteps = 0;
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

            console.log("Total Accurate Steps:", totalSteps);
            
            // Safety Check: Prevent accidental overwrites if cloud hasn't synced yet
            if (totalSteps === 0 && steps > 0) {
                 const confirmOverwrite = window.confirm(
                     `Google Fit is reporting 0 steps for today.\n\n` +
                     `If you have actually walked today, please open the Google Fit app on your phone and "Pull down to refresh" to sync your phone to the Google Cloud.\n\n` +
                     `Do you want to reset your progress to 0?`
                 );
                 if (!confirmOverwrite) return;
            }

            // 3. Update State & Backend
            setSteps(totalSteps);

            if (currentUser) {
                const updatedUser = { ...currentUser, steps: totalSteps };
                setCurrentUser(updatedUser);
                localStorage.setItem('user', JSON.stringify(updatedUser));
                updateBackendSteps(totalSteps);
            }
            
            const timeStr = new Date().toLocaleTimeString();
            if (totalSteps > 0) {
                alert(`Successfully Synced!\n\nSteps: ${totalSteps}\nTime: ${timeStr}\n\nNote: If this is lower than your phone, please "Pull Down to Refresh" inside your mobile Google Fit app.`);
            } else {
                alert(`Sync Complete.\n\n0 steps found for today.\n\nIf you have steps on your phone, ensure you are logged into the same account and have synced the mobile app to the cloud.`);
            }

        } catch (error) {
            console.error("Critical Sync Error:", error);
            if (error.response?.status === 403) {
                alert("Permission Denied: Ensure you haven't restricted access to physical activity data in the Google Consent Screen.");
            } else {
                alert("Failed to connect to Google Fit. Please try again or check your internet connection.");
            }
        }
    },
    onError: error => {
        console.error("OAuth Error:", error);
        alert("Authentication failed. Please try again.");
    },
    scope: 'https://www.googleapis.com/auth/fitness.activity.read'
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
          
          <div className="leaderboard-list">
            {leaderboard.length > 0 ? (
              leaderboard.map((user, index) => (
                <div 
                  key={index} 
                  className={`leaderboard-item ${user.name === currentUser?.name ? 'current-user' : ''}`}
                >
                  <div className="rank">{index + 1}</div>
                  <div className="user-info">
                    <span className="user-name">{user.name}</span>
                  </div>
                  <div className="user-steps">{user.steps.toLocaleString()}</div>
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
