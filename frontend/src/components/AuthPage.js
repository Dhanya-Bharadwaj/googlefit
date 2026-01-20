import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import API_URL from '../config/api';
import InteractiveCreatures from './InteractiveCreatures';
import { Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/AuthPage.css';

const AuthPage = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    email: '',
    phone: '',
    password: '',
    loginIdentifier: '' 
  });
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  const handleMouseMove = (e) => {
    // Current mouse position
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const syncUserToFirebase = async (user) => {
    try {
      await fetch(`${API_URL}/api/firebase/sync-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          steps: user.steps || 0
        })
      });
    } catch (e) {
      console.error("Firebase Sync Error:", e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage({ type: '', text: 'Processing...' });

    const endpoint = isSignUp ? `${API_URL}/api/signup` : `${API_URL}/api/signin`;
    const payload = isSignUp 
      ? { name: formData.name, age: formData.age, email: formData.email, phone: formData.phone, password: formData.password }
      : { loginIdentifier: formData.email, password: formData.password }; // We re-use 'email' field state for loginIdentifier input

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setStatusMessage({ type: 'success', text: data.message });
        
        // Store user info for session
        const userToStore = isSignUp 
            ? { name: formData.name, email: formData.email, steps: 0 } // Signup: Init steps 0
            : data.user; // Signin: User comes from backend
            
        // Sync to Firebase (Fire & Forget)
        syncUserToFirebase(userToStore);

        localStorage.setItem('user', JSON.stringify(userToStore));
        
        // Navigate to dashboard after short delay
        setTimeout(() => {
            navigate('/dashboard', { state: { showIntro: true } });
        }, 1000);

      } else {
        setStatusMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      console.error('Error:', error);
      setStatusMessage({ type: 'error', text: 'Failed to connect to server. Ensure backend is running.' });
    }
  };

  const isPasswordFocused = focusedField === 'password' || showPassword;

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
        try {
            setStatusMessage({ type: '', text: 'Verifying Google Account...' });
            
            // Fetch User Info
            const userInfo = await axios.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } }
            );

            const googleUser = userInfo.data;

            // Register/Login user in Backend to ensure they exist for leaderboard
            let userToStore;
            try {
                const backendResponse = await fetch(`${API_URL}/api/google-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: googleUser.name,
                        email: googleUser.email,
                        picture: googleUser.picture
                    })
                });
                const backendData = await backendResponse.json();
                userToStore = backendData.user;
            } catch (err) {
                 console.error("Backend login failed", err);
                 // Fallback to local simulation if backend is down
                 userToStore = {
                    name: googleUser.name,
                    email: googleUser.email,
                    steps: 0,
                    picture: googleUser.picture 
                };
            }

            setStatusMessage({ type: 'success', text: `Welcome, ${googleUser.given_name}!` });
            
            // Sync to Firebase
            syncUserToFirebase(userToStore);

            localStorage.setItem('user', JSON.stringify(userToStore));
            
            setTimeout(() => {
                navigate('/dashboard', { state: { showIntro: true } });
            }, 1000);

        } catch (error) {
            console.error(error);
            setStatusMessage({ type: 'error', text: 'Google Login Failed' });
        }
    },
    onError: () => setStatusMessage({ type: 'error', text: 'Google Login Failed' }),
  });

  // Render Input Helper
  const renderInput = (name, placeholder, type = "text", label) => (
    <div className="input-group">
      <label className="input-label">
        {label}
      </label>
      <div className="input-wrapper">
        <input
          name={name}
          className="auth-input"
          type={name === 'password' ? (showPassword ? 'text' : 'password') : type}
          placeholder={placeholder}
          value={formData[name]}
          onChange={handleChange}
          onFocus={() => setFocusedField(name)}
          onBlur={() => setFocusedField(null)}
          style={{
            borderColor: focusedField === name ? '#6200ea' : '#d1d5db'
          }}
        />
        {name === 'password' && (
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div 
      className="auth-container" 
      onMouseMove={handleMouseMove}
    >
      {/* Left Side - Visuals/Creatures */}
      <div className="visuals-panel">
        {/* Background Decorative blob */}
        <div className="visuals-bg-blob" />
        
        <InteractiveCreatures 
          mousePos={mousePos} 
          isPasswordFocused={isPasswordFocused} 
          showPassword={showPassword}
          isTyping={focusedField && formData[focusedField]?.length > 0} 
          focusedField={focusedField}
        />
        
        <div style={{ position: 'absolute', bottom: '3rem', left: '3rem', zIndex: 10 }}>
            <h1 style={{ margin: 0, fontSize: '3rem', fontWeight: 'bold', color: '#e5e7eb', fontFamily: 'Inter, sans-serif' }}>
            Fitness Tracker
            </h1>
            <p style={{ color: '#e5e7eb', marginTop: '1rem', maxWidth: '350px', fontSize: '1.1rem', lineHeight: '1.5', opacity: 0.9 }}>
            Join the challenge. Sync your steps from Google Fit, compete with friends, and climb the leaderboard.
            </p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="form-panel">
        {/* Header Toggle */}
        <div className="auth-header-toggle">
          <button 
            onClick={() => setIsSignUp(false)}
            className={`toggle-btn ${!isSignUp ? 'active' : 'inactive'}`}
          >
            Sign In
          </button>
          <button 
            onClick={() => setIsSignUp(true)}
            className={`toggle-btn ${isSignUp ? 'active' : 'inactive'}`}
          >
            Sign Up
          </button>
        </div>

        <div className="auth-title-section">
          <h2 className="auth-title">
            {isSignUp ? 'Create an account' : 'Welcome back!'}
          </h2>
          <p className="auth-subtitle">
            {isSignUp ? 'Please enter your details to sign up.' : 'Please enter your details.'}
          </p>
          {statusMessage.text && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '0.75rem', 
              borderRadius: '0.5rem', 
              backgroundColor: statusMessage.type === 'success' ? '#d1fae5' : '#fee2e2',
              color: statusMessage.type === 'success' ? '#065f46' : '#991b1b',
              fontSize: '0.875rem'
            }}>
              {statusMessage.text}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <AnimatePresence mode="wait">
            <motion.div
              key={isSignUp ? 'signup' : 'signin'}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {isSignUp ? (
                <>
                  {renderInput('name', 'John Doe', 'text', 'Full Name')}
                  {renderInput('age', '25', 'number', 'Age')}
                  {renderInput('email', 'john@gmail.com', 'email', 'Email ID')}
                  {renderInput('phone', '+1 234 567 890', 'tel', 'Phone Number')}
                  {renderInput('password', '••••••••', 'password', 'Password')}
                  
                  <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', fontSize: '0.875rem' }}>
                    <input type="checkbox" id="terms" />
                    <label htmlFor="terms" style={{ color: '#6b7280' }}>I agree to the terms and conditions</label>
                  </div>
                </>
              ) : (
                <>
                  {renderInput('email', 'Phone or Email', 'text', 'Email or Phone')}
                  {renderInput('password', '••••••••', 'password', 'Password')}
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '1rem 0', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type="checkbox" id="remember" />
                      <label htmlFor="remember" style={{ color: '#6b7280' }}>Remember for 30 days</label>
                    </div>
                    <button type="button" style={{ background: 'none', border: 'none', color: '#6200ea', cursor: 'pointer', padding: 0, font: 'inherit' }}>Forgot password?</button>
                  </div>
                </>
              )}

              <button 
                type="submit"
                className="auth-submit-btn"
              >
                {isSignUp ? 'Sign Up' : 'Log In'}
              </button>

               <button 
                type="button"
                className="google-btn"
                onClick={() => handleGoogleLogin()}
              >
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" style={{ width: '20px', height: '20px' }} />
                Log in with Google
              </button>
            </motion.div>
          </AnimatePresence>
        </form>

        <div className="switch-auth">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="switch-auth-btn"
          >
             {isSignUp ? 'Log In' : 'Sign Up'}
          </button>
        </div>

        {/* Legal Links Footer */}
        <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy Policy</a>
            <span style={{color: '#d1d5db'}}>|</span>
            <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>Terms of Service</a>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
