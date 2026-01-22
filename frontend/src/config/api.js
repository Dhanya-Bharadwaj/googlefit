// API Configuration
// In development, use local backend. In production, use deployed backend URL.

// For LOCAL development, use localhost:
const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://googlefit-tracker.vercel.app'
  : 'http://localhost:5000';

// Uncomment below line to force production API (for testing deployed backend)
// const API_URL = 'https://googlefit-tracker.vercel.app';

// Uncomment below line to force local API (for local development)
// const API_URL = 'http://localhost:5000';

console.log('Using API_URL:', API_URL);

export default API_URL;
