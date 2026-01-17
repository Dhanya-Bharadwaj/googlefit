import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Activity, Trophy, RefreshCw, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import '../styles/Dashboard.css';

const Dashboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [steps, setSteps] = useState(0);
  const navigate = useNavigate();

  const API_URL = '/api';

  const fetchLeaderboard = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/leaderboard`);
      const data = await response.json();
      setLeaderboard(data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  }, [API_URL]);

  useEffect(() => {
    // Load user from local storage (set during login)
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/');
      return;
    }
    const parsedUser = JSON.parse(storedUser);
    setCurrentUser(parsedUser);
    setSteps(parsedUser.steps || 0);

    fetchLeaderboard();
  }, [navigate, fetchLeaderboard]);

  const updateBackendSteps = async (newSteps) => {
    if (currentUser) {
        try {
            await fetch(`${API_URL}/update-steps`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: currentUser.email, steps: newSteps })
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

            // Fetch Step Count for correct time range (Today)
            const midnight = new Date();
            midnight.setHours(0,0,0,0);
            const startTimeMillis = midnight.getTime();
            const endTimeMillis = Date.now();

            const response = await axios.post(
                'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
                {
                    aggregateBy: [{
                        dataTypeName: "com.google.step_count.delta",
                        dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps" 
                    }],
                    bucketByTime: { durationMillis: 86400000 }, // 1 day bucket
                    startTimeMillis,
                    endTimeMillis
                },
                {
                    headers: { Authorization: `Bearer ${accessToken}` }
                }
            );
            
            console.log("Google Fit Response:", response.data);

            // Parse Google Fit Response
            const bucket = response.data.bucket[0];
            let totalSteps = 0;
            
            if (bucket && bucket.dataset) {
                // Sum up all data points in the bucket (sometimes multiple segments returned)
                bucket.dataset.forEach(ds => {
                    ds.point.forEach(p => {
                         if (p.value && p.value.length > 0) {
                             totalSteps += p.value[0].intVal;
                         }
                    });
                });
            }

            console.log("Total Parsed Steps:", totalSteps);
            setSteps(totalSteps);
            updateBackendSteps(totalSteps);
            
            if (totalSteps === 0) {
                 alert("Synced! Google Fit returned 0 steps. \n\nEnsure you have 'Google Fit' installed on your phone and tracking enabled.");
            } else {
                 alert(`Synced! You have ${totalSteps} steps today.`);
            }

        } catch (error) {
            console.error("Error fetching Google Fit data:", error);
            alert("Failed to fetch steps from Google Fit.");
        }
    },
    onError: error => console.error("Login Failed:", error),
    scope: 'https://www.googleapis.com/auth/fitness.activity.read'
  });

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="logo-section">
          <Activity color="#6200ea" size={32} />
          <h1>FitTracker Corp</h1>
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
          
          <button className="sync-btn" onClick={() => handleSyncGoogleFit()}>
            <RefreshCw size={20} />
            Sync with Google Fit
          </button>
          
          <p className="sync-note">
            Tap sync to update your steps from the cloud.
          </p>
          
          {/* Debug Info for User */}
          <div style={{fontSize: '0.8rem', color: '#cbd5e1', marginTop: '10px', textAlign: 'center'}}>
             {process.env.REACT_APP_GOOGLE_CLIENT_ID ? 'API Active' : 'API Key Info Needed'}
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
