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

// Routes Prefix
const router = express.Router();
app.use('/api', router);

// Default Route
app.get('/', (req, res) => {
  res.send('Backend Server is Running. API available at /api');
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
router.post('/signup', (req, res) => {
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
router.post('/signin', (req, res) => {
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
router.post('/update-steps', (req, res) => {
  const { email, steps } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });

  const users = loadUsers();
  
  const userIndex = users.findIndex(u => u.email === email);
  if (userIndex !== -1) {
    users[userIndex].steps = steps;
    saveUsers(users);
    res.json({ message: 'Steps updated.', totalSteps: steps });
  } else {
    // If updating steps for a user not strictly in "Sign Up" flow (like Google Login first timer)
    // we should validly handle it or return 404. Since we have auto-create in google-login, this should exist.
    // BUT! Google login might have a slightly different email structure or case. Let's normalize.
    res.status(404).json({ message: 'User not found in DB. Please re-login.' });
  }
});

// Google Login / Upsert Route
router.post('/google-login', (req, res) => {
  const { email, name, picture } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  
  const users = loadUsers();
  let user = users.find(u => u.email === email);
  
  if (!user) {
    // Create new user for Google Login
    user = {
      id: Date.now(),
      name: name || 'Google User',
      email,
      steps: 0,
      picture
    };
    users.push(user);
    saveUsers(users);
  } else {
     // Optional: Update picture or name if changed? 
     // For now, just return existing user
  }
  
  res.status(200).json({ message: 'Login successful', user });
});


// Leaderboard Route
router.get('/leaderboard', (req, res) => {
  const users = loadUsers();
  // Return users sorted by steps (descending), masking sensitive data
  const leaderboard = users
    .map(u => ({ name: u.name, steps: u.steps || 0 }))
    .sort((a, b) => b.steps - a.steps);
  
  res.json(leaderboard);
});

// For Vercel Serverless (Export the App)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
