const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();

// Use /tmp for writable storage in Vercel Serverless environment
const DB_FILE = path.join(os.tmpdir(), 'users.json');

app.use(cors());
app.use(bodyParser.json());

// Initialize dummy data if file doesn't exist (to prevent empty leaderboard on first load)
const initialData = [
  { id: 1, name: "Demo User", email: "demo@example.com", steps: 5000, password: "demo" }
];

// Load users helper
const loadUsers = () => {
  try {
    if (!fs.existsSync(DB_FILE)) {
      // Write initial data so it persists for the short life of the container
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData));
      return initialData;
    }
    const data = fs.readFileSync(DB_FILE);
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading DB:", error);
    return [];
  }
};

// Save users helper
const saveUsers = (users) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error("Error writing DB:", error);
  }
};

app.get('/api', (req, res) => {
  res.send('Vercel API is Running.');
});

// Sign Up Route
app.post('/api/signup', (req, res) => {
  const { name, age, email, phone, password } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Name, Email, and Password are required.' });
  }

  const users = loadUsers();
  const existingUser = users.find(u => u.email === email || u.phone === phone);
  
  if (existingUser) {
    return res.status(409).json({ message: 'User already exists.' });
  }

  const newUser = {
    id: Date.now(),
    name, age, email, phone, password,
    steps: 0
  };

  users.push(newUser);
  saveUsers(users);

  res.status(201).json({ message: 'User registered successfully!', user: { name, email } });
});

// Sign In Route
app.post('/api/signin', (req, res) => {
  const { loginIdentifier, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => 
    (u.email === loginIdentifier || u.phone === loginIdentifier) && u.password === password
  );

  if (user) {
    res.status(200).json({ message: 'Login successful!', user: { name: user.name, email: user.email, steps: user.steps || 0 } });
  } else {
    res.status(401).json({ message: 'Invalid credentials.' });
  }
});

// Update Steps Route
app.post('/api/update-steps', (req, res) => {
  const { email, steps } = req.body;
  const users = loadUsers();
  
  const userIndex = users.findIndex(u => u.email === email);
  if (userIndex !== -1) {
    users[userIndex].steps = steps;
    saveUsers(users);
    res.json({ message: 'Steps updated.', totalSteps: steps });
  } else {
    res.status(404).json({ message: 'User not found.' });
  }
});

// Leaderboard Route
app.get('/api/leaderboard', (req, res) => {
  const users = loadUsers();
  const leaderboard = users
    .map(u => ({ name: u.name || "Unknown", steps: u.steps || 0 }))
    .sort((a, b) => b.steps - a.steps);
  
  res.json(leaderboard);
});

module.exports = app;