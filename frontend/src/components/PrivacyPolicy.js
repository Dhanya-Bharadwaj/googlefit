import React from 'react';
import '../styles/App.css'; 

const PrivacyPolicy = () => {
  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', lineHeight: '1.6', color: '#333' }}>
      <h1>Privacy Policy</h1>
      <p>Last updated: January 18, 2026</p>

      <h2>1. Introduction</h2>
      <p>Welcome to Fitness Tracker at Velocity ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains what information we collect, how we use it, and your rights.</p>

      <h2>2. Information We Collect</h2>
      <p>We collect personal information that you provide to us, such as name, email address, and contact information. We also collect fitness data (step counts) synced from Google Fit upon your clear consent.</p>

      <h2>3. How We Use Your Information</h2>
      <p>We use your information to operate the fitness leaderboard, track your progress, and provide you with insights into your activity levels. We do not sell your personal data to third parties.</p>

      <h2>4. Google Fit Data</h2>
      <p>Our application integrates with the Google Fit API. We only read data (step counts) that you explicitly authorize. This data is used solely for display on your dashboard and the company leaderboard.</p>

      <h2>5. Contact Us</h2>
      <p>If you have any questions about this policy, please contact us at support@elocity.com.</p>
    </div>
  );
};

export default PrivacyPolicy;
