require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const exifr = require('exifr');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(bodyParser.json({ limit: '10mb' })); // Increase payload size limit for base64 images

// Database connection
const uri = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
let db;

async function connectToDatabase() {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    db = client.db('picture_organiser');
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

connectToDatabase();

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No valid token provided.' });
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Helper function to validate email and password
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePassword = (password) => password.length >= 8;

// ----------------- USER AUTHENTICATION ROUTES ----------------- //
app.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.collection('users').insertOne({
      username,
      email,
      password: hashedPassword,
      created_at: new Date(),
    });

    res.status(201).json({ message: 'User registered successfully', userId: result.insertedId });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.collection('users').findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({ message: 'Login successful', token, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// ----------------- ALBUM AND PHOTO ROUTES ----------------- //
app.get('/api/albums', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const albums = await db.collection('albums').find({ user_id: userId }).toArray();
    res.status(200).json(albums);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

app.post('/api/albums', authenticateToken, async (req, res) => {
  try {
    const { album_name, description } = req.body;
    if (!album_name) {
      return res.status(400).json({ error: 'Album name is required' });
    }

    const newAlbum = {
      user_id: req.user.userId,
      album_name,
      description,
      created_at: new Date(),
      photos: [],
    };

    await db.collection('albums').insertOne(newAlbum);
    res.status(201).json({ message: 'Album created successfully', album: newAlbum });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create album' });
  }
});

app.post('/api/albums/:id/upload', authenticateToken, async (req, res) => {
  try {
    const albumId = req.params.id;
    const { photo } = req.body;

    if (!photo || !photo.startsWith('data:image')) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    // Store the base64 image directly in MongoDB
    await db.collection('albums').updateOne(
      { _id: new ObjectId(albumId), user_id: req.user.userId },
      { $push: { photos: { url: photo, metadata: {} } } }
    );

    res.status(200).json({ message: 'Photo uploaded successfully', photoUrl: photo });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// ----------------- DELETE ALBUM ----------------- //
app.delete('/api/albums/:id', authenticateToken, async (req, res) => {
  try {
    const albumId = req.params.id;

    // Find the album to ensure the user owns it
    const album = await db.collection('albums').findOne({
      _id: new ObjectId(albumId),
      user_id: req.user.userId,
    });

    if (!album) {
      return res.status(404).json({ error: 'Album not found or unauthorized' });
    }

    // Delete the album
    await db.collection('albums').deleteOne({ _id: new ObjectId(albumId) });

    res.status(200).json({ message: 'Album deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete album' });
  }
});

// ----------------- DELETE PHOTO ----------------- //
app.delete('/api/albums/:albumId/photos/:photoIndex', authenticateToken, async (req, res) => {
  try {
    const { albumId, photoIndex } = req.params;

    // Find the album to ensure the user owns it
    const album = await db.collection('albums').findOne({
      _id: new ObjectId(albumId),
      user_id: req.user.userId,
    });

    if (!album) {
      return res.status(404).json({ error: 'Album not found or unauthorized' });
    }

    // Check if the photo index is valid
    if (photoIndex < 0 || photoIndex >= album.photos.length) {
      return res.status(400).json({ error: 'Invalid photo index' });
    }

    // Remove the photo from the album
    album.photos.splice(photoIndex, 1);

    // Update the album in the database
    await db.collection('albums').updateOne(
      { _id: new ObjectId(albumId) },
      { $set: { photos: album.photos } }
    );

    res.status(200).json({ message: 'Photo deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// ----------------- SEARCH ROUTE ----------------- //
app.get('/api/search', authenticateToken, async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.user.userId;

    const albums = await db.collection('albums').find({ user_id: userId }).toArray();
    const results = albums.flatMap((album) =>
      album.photos.filter((photo) =>
        photo.metadata && JSON.stringify(photo.metadata).toLowerCase().includes(query.toLowerCase())
      )
    );

    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to perform search' });
  }
});

// ----------------- DEFAULT ROUTE ----------------- //
app.get('/', (req, res) => {
  res.send('Welcome to the Picture Organizer API!');
});

// Export the app for testing
module.exports = app;

// Start the server only if this file is run directly
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
  });
}