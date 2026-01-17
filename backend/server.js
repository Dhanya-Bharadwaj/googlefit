const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;
const DB_FILE = path.join(__dirname, 'users.json');

app.use(cors());
app.use(bodyParser.json());

// Default Route
app.get('/', (req, res) => {
  res.send('Backend Server is Running.');
});

// Load users from file
const loadUsers = () => {
  if (!fs.existsSync(DB_FILE)) {
    return [];
  }
  const data = fs.readFileSync(DB_FILE);
  return JSON.parse(data);
};

// Save users to file
const saveUsers = (users) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
};

// Sign Up Route
app.post('/signup', (req, res) => {
  const { name, age, email, phone, password } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Name, Email, and Password are required.' });
  }

  const users = loadUsers();

  // Check if user exists
  const existingUser = users.find(u => u.email === email || u.phone === phone);
  if (existingUser) {
    return res.status(409).json({ message: 'User with this email or phone already exists.' });
  }

  const newUser = {
    id: Date.now(),
    name,
    age,
    email,
    phone,
    password,
    steps: 0 // Initialize steps
  };

  users.push(newUser);
  saveUsers(users);

  res.status(201).json({ message: 'User registered successfully!', user: { name, email } });
});

// Sign In Route
app.post('/signin', (req, res) => {
  const { loginIdentifier, password } = req.body; // loginIdentifier can be email or phone

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
app.post('/update-steps', (req, res) => {
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
app.get('/leaderboard', (req, res) => {
  const users = loadUsers();
  // Return users sorted by steps (descending), masking sensitive data
  const leaderboard = users
    .map(u => ({ name: u.name, steps: u.steps || 0 }))
    .sort((a, b) => b.steps - a.steps);
  
  res.json(leaderboard);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
