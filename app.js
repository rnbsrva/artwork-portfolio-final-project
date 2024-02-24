// Import required modules
const express = require('express');
const bcrypt = require('bcrypt')
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser')
const { sendEmail, sendGreeting, sendNotification } = require('./emailService');
const mongoose = require('./db');
const User = require('./models/User');
const Artwork = require('./models/Artwork');
const uuid = require('uuid')
var dotenv = require("dotenv")
dotenv.config()

class Session {
  constructor(username, expiresAt) {
      this.username = username
      this.expiresAt = expiresAt
  }

  isExpired() {
      this.expiresAt < (new Date())
  }
}

const sessions = {}

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

  
app.post('/register', async (req, res) => {
    console.log(req.body);

    const {username, firstName, lastName, country, age, email, password } = req.body;
    try {
        // Check if the user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
                return res.status(400).send('User already exists');
        }

        const existingUser2 = await User.findOne({ email });
        if (existingUser2) {
                return res.status(400).send('User already exists');

            }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, firstName, lastName, country, age, email, password : hashedPassword, role: "user" });
        await newUser.save();
        sendGreeting(email, newUser.firstName);

        const sessionToken = uuid.v4()
        const now = new Date()
        const expiresAt = new Date(+now + 120 * 1000)
        const session = new Session(username, expiresAt)
        sessions[sessionToken] = session
        res.cookie("session_token", sessionToken, { expires: expiresAt });
        res.json(newUser)
        res.end();
      } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
      }
  
  });

  app.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
  
      const user = await User.findOne({ username });
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
  
      const sessionToken = uuid.v4()

      const now = new Date()
      const expiresAt = new Date(+now + 900 * 1000)
      const session = new Session(username, expiresAt)
      sessions[sessionToken] = session
      res.cookie("session_token", sessionToken, { expires: expiresAt })
      res.status(200).json({ message: 'Login successful', userId: user._id });
      res.end();
    } catch (error) { 
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });


  app.post('/logout', async (req, res) => {
    if (!req.cookies) {
        res.status(401).end()
        return
    }

    const sessionToken = req.cookies['session_token']
    if (!sessionToken) {
        res.status(401).end()
        return
    }

    delete sessions[sessionToken]

    res.cookie("session_token", "", { expires: new Date() })
    res.end()
  });

  app.post('/refresh', async (req, res) => {
    
    if (!req.cookies) {
        res.status(401).end()
        return
    }

    const sessionToken = req.cookies['session_token']
    if (!sessionToken) {
        res.status(401).end()
        return
    }

    userSession = sessions[sessionToken]
    if (!userSession) {
        res.status(401).end()
        return
    }
    if (userSession.isExpired()) {
        delete sessions[sessionToken]
        res.status(401).end()
        return
    }
    const newSessionToken = uuid.v4()

    const now = new Date()
    const expiresAt = new Date(+now + 120 * 1000)
    const session = new Session(userSession.username, expiresAt)

    sessions[newSessionToken] = session
    delete sessions[sessionToken]

    res.cookie("session_token", newSessionToken, { expires: expiresAt })
    res.status(200);
    res.end()
  });


  const isAuthenticated = (req) => {
    if (!req.cookies) {
      console.log("no cook")
        return false;
    }


    const sessionToken = req.cookies['session_token'];
    if (!sessionToken) {
      console.log("no session_token")
        return false;
    }

    userSession = sessions[sessionToken];
    if (!userSession) {
      console.log("no userSession")
        return false;
    }
    if (userSession.isExpired()) {
        delete sessions[sessionToken];
        return false;
    }

    return true;
};


  

app.post('/artworks', async (req, res) => {
  try {
    if (!isAuthenticated(req, res)) {
      res.status(401).end();
      console.log(isAuthenticated)
      return;
  }
  const sessionToken = req.cookies['session_token'];
  const userSession = sessions[sessionToken];

  const user = await User.findOne({ username: userSession.username });

  if (!user) {
    console.log("User not found");
    return res.status(404).json({ error: 'User not found' });
  }
  if(user.role!="admin"){
    return res.status(403).json({ error: 'Forbidden action' });
  }

    const { name, description } = req.body;
    if (!name) {
      console.log("Name is required");
      return res.status(400).json({ error: 'Name is required' });
    }

    const artwork = new Artwork({ name, description, user: user._id });
    const savedArtwork = await artwork.save();
    sendNotification(user.email, user.firstName);
    res.status(201).json(savedArtwork);
  } catch (error) {
    console.log(error)
    res.status(500).json({ error});
  }
});


app.get('/artworks', async (req, res) => {
  
  if (!req.cookies) {
    res.status(401).end()
    return
}

const sessionToken = req.cookies['session_token']
if (!sessionToken) {
    res.status(401).end()
    return
}

userSession = sessions[sessionToken]
if (!userSession) {
    res.status(401).end()
    return
}
if (userSession.isExpired()) {
    delete sessions[sessionToken]
    res.status(401).end()
    return
}

  try {
    const artworks = await Artwork.find();
    res.json(artworks);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Retrieve a single task by ID
app.get('/artworks/:id', async (req, res) => {
  try {
    if (!isAuthenticated(req, res)) {
      res.status(401).end();
      return;
  }

    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(artwork);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update a task by ID
app.put('/artworks/:id', async (req, res) => {

    if (!isAuthenticated(req, res)) {
      res.status(401).end();
      return;
  }

  const sessionToken = req.cookies['session_token'];
  const userSession = sessions[sessionToken];

  const user = await User.findOne({ username: userSession.username });

  if (!user) {
    console.log("User not found");
    return res.status(404).json({ error: 'User not found' });
  }


  if(user.role!="admin"){
    return res.status(403).json({ error: 'Forbidden action' });
  }

  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const updatedArtwork = await Artwork.findByIdAndUpdate(
      req.params.id,
      { name, description, user: user._id },
      { new: true }
    );

    res.json(updatedArtwork);
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Delete a task by ID
app.delete('/artworks/:id', async (req, res) => {

  if (!isAuthenticated(req, res)) {
    res.status(401).end();
    return;
  }

  const sessionToken = req.cookies['session_token'];
  const userSession = sessions[sessionToken];
  const user = await User.findOne({ username: userSession.username });

  if (!user) {
    console.log("User not found");
    return res.status(404).json({ error: 'User not found' });
  }


  if(user.role!="admin"){
    return res.status(403).json({ error: 'Forbidden action' });
  }


  try {
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const deletedTask = await Artwork.findByIdAndDelete(req.params.id);
    if (!deletedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

