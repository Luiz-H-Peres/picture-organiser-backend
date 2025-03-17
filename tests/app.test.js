const request = require('supertest');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import the app from server.js
const app = require('../server');

describe('Picture Organizer API', () => {
  let connection;
  let db;

  beforeAll(async () => {
    // Connect to the test database
    const uri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
    connection = await MongoClient.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    db = connection.db('picture_organiser_test'); // Use a separate test database

    // Inject the test database into the app
    app.locals.db = db;
  });

  afterAll(async () => {
    // Close the database connection
    if (connection) {
      await connection.close();
    }
  });

  beforeEach(async () => {
    // Clear the users and albums collections before each test
    await db.collection('users').deleteMany({});
    await db.collection('albums').deleteMany({});
  });

  // Test 1: GET / (Welcome Route)
  describe('GET /', () => {
    it('should return a welcome message', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toEqual(200);
      expect(res.text).toContain('Welcome');
    });
  });

  // Test 2: POST /register (User Registration)
  describe('POST /register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/register')
        .send({
          username: 'testuser',
          email: 'unique@example.com', // Use a unique email
          password: 'password123',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('message', 'User registered successfully');
      expect(res.body).toHaveProperty('userId');
    });

    it('should fail if email is already in use', async () => {
      // Register a user first
      await request(app)
        .post('/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        });

      // Try to register the same user again
      const res = await request(app)
        .post('/register')
        .send({
          username: 'testuser2',
          email: 'test@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Email already in use');
    });
  });

  // Test 3: POST /login (User Login)
  describe('POST /login', () => {
    it('should log in a user with valid credentials', async () => {
      // Register a user first
      await request(app)
        .post('/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        });

      // Log in the user
      const res = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Login successful');
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('userId');
    });

    it('should fail with invalid credentials', async () => {
      const res = await request(app)
        .post('/login')
        .send({
          email: 'wrong@example.com',
          password: 'wrongpassword',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('error', 'Invalid email or password');
    });
  });

  // Test 4: GET /api/albums (Fetch Albums)
  describe('GET /api/albums', () => {
    it('should fetch albums for an authenticated user', async () => {
      // Register and log in a user
      await request(app)
        .post('/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        });

      const loginRes = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const token = loginRes.body.token;

      // Fetch albums
      const res = await request(app)
        .get('/api/albums')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toBeInstanceOf(Array);
    });

    it('should fail if no token is provided', async () => {
      const res = await request(app).get('/api/albums');
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('error', 'Access denied. No valid token provided.');
    });
  });

  // Test 5: POST /api/albums/:id/upload (Upload Photo)
  describe('POST /api/albums/:id/upload', () => {
    it('should upload a photo to an album', async () => {
      // Register and log in a user
      await request(app)
        .post('/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        });

      const loginRes = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const token = loginRes.body.token;

      // Create an album
      const albumRes = await request(app)
        .post('/api/albums')
        .set('Authorization', `Bearer ${token}`)
        .send({
          album_name: 'Test Album',
          description: 'This is a test album',
        });

      const albumId = albumRes.body.album._id;

      // Upload a photo (base64-encoded image)
      const photoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAgAB/0z8RQAAAABJRU5ErkJggg=='; // Example base64 image
      const uploadRes = await request(app)
        .post(`/api/albums/${albumId}/upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ photo: photoBase64 });

      expect(uploadRes.statusCode).toEqual(200);
      expect(uploadRes.body).toHaveProperty('message', 'Photo uploaded successfully');
      expect(uploadRes.body).toHaveProperty('photoUrl');
    });

    it('should fail if no file is uploaded', async () => {
      // Register and log in a user
      await request(app)
        .post('/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        });

      const loginRes = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const token = loginRes.body.token;

      // Create an album
      const albumRes = await request(app)
        .post('/api/albums')
        .set('Authorization', `Bearer ${token}`)
        .send({
          album_name: 'Test Album',
          description: 'This is a test album',
        });

      const albumId = albumRes.body.album._id;

      // Attempt to upload without a file
      const uploadRes = await request(app)
        .post(`/api/albums/${albumId}/upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(uploadRes.statusCode).toEqual(400);
      expect(uploadRes.body).toHaveProperty('error', 'No file uploaded');
    });
  });
});