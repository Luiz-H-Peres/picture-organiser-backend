require('dotenv').config();
const express = require('express');
const { middleware, withAuth, withUpload } = require('./src/middleware');
const serverConfig = require('./src/server.config');
const { registerController, loginController } = require('./src/controllers/auth');
const { getAlbumsController, createAlbumController, uploadPhotoController, deleteAlbumController, deletePhotoController, findPhotosByMetadataController } = require('./src/controllers/albums');
const { getLocalIP } = require('./src/utils/getLocalIP');

const app = express();
const port = process.env.PORT || 3000;

serverConfig(app);

middleware(app);

// Routes
app.get('/', (req, res) => {
  res.send('Welcome to the Picture Organizer API!');
});

app.post('/register', registerController);
app.post('/login', loginController);

app.get('/api/albums', withAuth, getAlbumsController);
app.post('/api/albums', withAuth, createAlbumController);
app.post('/api/albums/:albumId/upload', [withAuth, withUpload], uploadPhotoController);
app.delete('/api/albums/:albumId', withAuth, deleteAlbumController);
app.delete('/api/albums/:albumId/photos/:photoId', withAuth, deletePhotoController);

app.get('/api/search/:query', withAuth, findPhotosByMetadataController);

module.exports = app;

if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    const localIp = getLocalIP();
    console.log(`🚀 Server is running on http://${localIp}:${port}`);

  });
}