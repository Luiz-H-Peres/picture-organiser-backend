// Load environment variables from .env.test
require('dotenv').config({ path: '.env.test' });

const request = require('supertest');
const { MongoClient } = require('mongodb');
const app = require('../server');

describe('Picture Organizer API', () => {
  let connection;
  let db;

  beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
    connection = await MongoClient.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    db = connection.db('picture_organiser_test');
    app.locals.db = db;
  });

  afterAll(async () => {
    if (connection) await connection.close();
  });

  beforeEach(async () => {
    await db.collection('users').deleteMany({});
    await db.collection('albums').deleteMany({});
  });

  // Test 1: GET /
  describe('GET /', () => {
    it('should return a welcome message', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toEqual(200);
      expect(res.text).toContain('Welcome');
    });
  });

  // Test 2: POST /register
  describe('POST /register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/register')
        .send({
          username: 'testuser',
          email: 'unique@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('message', 'User registered successfully');
      expect(res.body).toHaveProperty('userId');
    });

    it('should fail if email is already in use', async () => {
      await request(app).post('/register').send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

      const res = await request(app).post('/register').send({
        username: 'testuser2',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Email already in use');
    });
  });

  // Test 3: POST /login
  describe('POST /login', () => {
    it('should log in a user with valid credentials', async () => {
      await request(app).post('/register').send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

      const res = await request(app).post('/login').send({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Login successful');
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('userId');
    });

    it('should fail with invalid credentials', async () => {
      const res = await request(app).post('/login').send({
        email: 'wrong@example.com',
        password: 'wrongpassword',
      });

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('error', 'Invalid email or password');
    });
  });

  // Test 4: GET /api/albums
  describe('GET /api/albums', () => {
    it('should fetch albums for an authenticated user', async () => {
      await request(app).post('/register').send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

      const loginRes = await request(app).post('/login').send({
        email: 'test@example.com',
        password: 'password123',
      });

      const token = loginRes.body.token;

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

  // Test 5: POST /api/albums/:id/upload (placeholder)
  describe('POST /api/albums/:id/upload', () => {
    it('should return error if no file is uploaded', async () => {
      await request(app).post('/register').send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

      const loginRes = await request(app).post('/login').send({
        email: 'test@example.com',
        password: 'password123',
      });

      const token = loginRes.body.token;

      const albumRes = await request(app)
        .post('/api/albums')
        .set('Authorization', `Bearer ${token}`)
        .send({
          album_name: 'Test Album',
          description: 'Testing album upload failure',
        });

      const albumId = albumRes.body._id;

      const uploadRes = await request(app)
        .post(`/api/albums/${albumId}/upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({}); // No file

      expect(uploadRes.statusCode).toEqual(400);
      expect(uploadRes.body).toHaveProperty('error', 'No files uploaded');
    });
  });
});
