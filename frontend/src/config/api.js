// API Configuration
// In development, use local backend. In production, use deployed backend URL.

const API_URL = process.env.REACT_APP_API_URL || 'https://googlefit-tracker.vercel.app';

export default API_URL;
