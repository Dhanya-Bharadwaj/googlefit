import React, { useState } from 'react';
import InteractiveCreatures from './InteractiveCreatures';
import { Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/AuthPage.css';

const AuthPage = () => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage({ type: '', text: 'Processing...' });

    const endpoint = isSignUp ? 'http://localhost:5000/signup' : 'http://localhost:5000/signin';
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
        if (!isSignUp) {
          // Handle successful login (e.g., redirect or show dashboard)
          alert(`Welcome back, ${data.user.name}!`);
        } else {
             // Optional: switch to sign in or clear form
             setIsSignUp(false);
        }
      } else {
        setStatusMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      console.error('Error:', error);
      setStatusMessage({ type: 'error', text: 'Failed to connect to server. Ensure backend is running.' });
    }
  };

  const isPasswordFocused = focusedField === 'password' || showPassword;

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
          isTyping={focusedField && formData[focusedField]?.length > 0} 
          focusedField={focusedField}
        />
        
        <div className="visuals-logo">
          ZDAK
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
                    <a href="#" style={{ color: '#6200ea', textDecoration: 'none' }}>Forgot password?</a>
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
      </div>
    </div>
  );
};

export default AuthPage;
