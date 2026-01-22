import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Trophy, RefreshCw, LogOut, Crown, AlertTriangle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
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
  const [hasRefreshToken, setHasRefreshToken] = useState(true); // Assume true until checked
  const [isReauthorizing, setIsReauthorizing] = useState(false);

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

  // Check if current user has a refresh token
  const checkRefreshTokenStatus = useCallback(async (email) => {
    try {
      const response = await fetch(`${API_URL}/api/firebase/token-status`);
      const data = await response.json();
      const userStatus = data.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (userStatus) {
        setHasRefreshToken(userStatus.hasRefreshToken);
        console.log(`[Token Check] ${email}: hasRefreshToken=${userStatus.hasRefreshToken}`);
      }
    } catch (e) {
      console.error('Token status check error:', e);
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

    // Check if user has refresh token for offline sync
    checkRefreshTokenStatus(parsedUser.email);

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

  }, [navigate, fetchLeaderboard, checkRefreshTokenStatus]); 

  // Sync ALL employees' steps using tokens stored in backend
  const syncAllEmployeesSteps = async () => {
    setIsSyncing(true);
    
    try {
      // First, update OUR token in the backend (in case it's newer)
      const accessToken = localStorage.getItem('google_access_token');
      if (accessToken && currentUser) {
        await fetch(`${API_URL}/api/google-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: currentUser.name,
            email: currentUser.email,
            accessToken: accessToken
          })
        });
      }
      
      // Now call the sync-all endpoint
      const response = await fetch(`${API_URL}/api/firebase/sync-all-steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      console.log("Sync-All Results:", data);
      
      // Refresh leaderboard
      await fetchLeaderboard();
      
      // Update local steps if we're in the results
      if (currentUser && data.results?.success) {
        const myResult = data.results.success.find(r => r.email.toLowerCase() === currentUser.email.toLowerCase());
        if (myResult) {
          setSteps(myResult.steps);
          const updatedUser = { ...currentUser, steps: myResult.steps };
          setCurrentUser(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
      }
      
      const timeStr = new Date().toLocaleTimeString();
      setLastSyncTime(timeStr);
      localStorage.setItem('last_sync_time', timeStr);
      
      // Build result message
      let message = `📊 SYNC ALL RESULTS\n━━━━━━━━━━━━━━━━━━\n`;
      message += `✅ Success: ${data.results?.success?.length || 0} users\n`;
      message += `❌ Failed: ${data.results?.failed?.length || 0} users\n`;
      message += `⏭️ Skipped: ${data.results?.skipped?.length || 0} users\n\n`;
      
      if (data.results?.success?.length > 0) {
        message += `✅ Synced Users:\n`;
        data.results.success.forEach(r => {
          message += `• ${r.email}: ${r.steps.toLocaleString()} steps${r.tokenRefreshed ? ' 🔄' : ''}\n`;
        });
      }
      
      if (data.results?.failed?.length > 0) {
        message += `\n❌ Failed (need to re-login with Google):\n`;
        data.results.failed.forEach(r => {
          message += `• ${r.email}: ${r.reason || 'Token expired'}\n`;
        });
      }
      
      if (data.results?.skipped?.length > 0) {
        message += `\n⏭️ Skipped (no refresh token):\n`;
        data.results.skipped.forEach(r => {
          message += `• ${r.email}: ${r.reason}\n`;
        });
      }
      
      message += `\n━━━━━━━━━━━━━━━━━━\n`;
      message += `🔄 = Token was refreshed (user was offline)\n`;
      message += `💡 Users with refresh tokens can be synced anytime!`;
      
      alert(message);
      
    } catch (error) {
      console.error("Sync-All Error:", error);
      alert("Failed to sync all employees. Error: " + (error.message || "Unknown"));
    } finally {
      setIsSyncing(false);
    }
  };

  const initiateSync = () => {
    syncAllEmployeesSteps(); // Sync ALL employees, not just the current user
  };

  // Re-authorize with Google to get a refresh token (for users who logged in before this feature)
  const handleReauthorize = useGoogleLogin({
    flow: 'auth-code',
    scope: 'openid email profile https://www.googleapis.com/auth/fitness.activity.read',
    access_type: 'offline',
    prompt: 'consent', // Force consent to ensure we get a refresh token
    onSuccess: async (codeResponse) => {
      try {
        setIsReauthorizing(true);
        console.log('Re-authorization code received');
        
        const backendResponse = await fetch(`${API_URL}/api/google-auth-callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeResponse.code })
        });
        
        const backendData = await backendResponse.json();
        
        if (!backendResponse.ok) {
          throw new Error(backendData.message || 'Re-authorization failed');
        }
        
        // Update local storage with new token
        if (backendData.accessToken) {
          localStorage.setItem('google_access_token', backendData.accessToken);
        }
        
        // Update current user
        const user = backendData.user;
        localStorage.setItem('user', JSON.stringify(user));
        setCurrentUser(user);
        
        // Mark as having refresh token now
        setHasRefreshToken(backendData.hasRefreshToken);
        
        alert(`✅ Re-authorization successful!\n\nYour account now has offline sync enabled. Your steps will be synced automatically even when you're not logged in.`);
        
        // Trigger a sync immediately
        syncAllEmployeesSteps();
        
      } catch (error) {
        console.error('Re-authorization error:', error);
        alert('Re-authorization failed: ' + error.message);
      } finally {
        setIsReauthorizing(false);
      }
    },
    onError: (error) => {
      console.error('Re-authorization error:', error);
      alert('Re-authorization failed: ' + (error.description || error.error || 'Unknown error'));
      setIsReauthorizing(false);
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_email');
    localStorage.removeItem('last_sync_time');
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
        {/* Reauthorization Banner for users without refresh tokens */}
        {!hasRefreshToken && (
          <div className="reauth-banner">
            <div className="reauth-content">
              <AlertTriangle size={24} color="#f59e0b" />
              <div className="reauth-text">
                <strong>Offline Sync Not Enabled</strong>
                <p>Your account was created before offline sync was available. Click below to enable automatic step syncing even when you're not logged in.</p>
              </div>
              <button 
                className="reauth-btn" 
                onClick={() => handleReauthorize()}
                disabled={isReauthorizing}
              >
                {isReauthorizing ? 'Authorizing...' : 'Enable Offline Sync'}
              </button>
            </div>
          </div>
        )}

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
