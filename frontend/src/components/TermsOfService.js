import React from 'react';
import '../styles/App.css';

const TermsOfService = () => {
  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', lineHeight: '1.6', color: '#333' }}>
      <h1>Terms of Service</h1>
      <p>Last updated: January 18, 2026</p>

      <h2>1. Agreement to Terms</h2>
      <p>By accessing or using our Fitness Tracker application, you agree to be bound by these Terms of Service.</p>

      <h2>2. User Accounts</h2>
      <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>

      <h2>3. Acceptable Use</h2>
      <p>You agree not to use the application for any unlawful purpose or to solicit others to perform or participate in any unlawful acts. You agree not to manipulate or falsify step count data.</p>

      <h2>4. Limitation of Liability</h2>
      <p>In no event shall Fitness Tracker at Velocity be liable for any indirect, incidental, special, consequential or punitive damages arising out of or related to your use of the application.</p>

      <h2>5. Changes to Terms</h2>
      <p>We reserve the right to modify these specific terms at any time. Your continued use of the service constitutes acceptance of those changes.</p>
    </div>
  );
};

export default TermsOfService;
