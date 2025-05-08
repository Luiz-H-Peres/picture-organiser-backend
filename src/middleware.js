const cors = require('cors');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;
const multer = require('multer');

const withAuth = (req, res, next) => {
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

const withUpload = (req, res, next) => {
    const upload = multer({ storage: multer.memoryStorage() }).array('photos', 10);
    upload(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: 'Error uploading files' });
        }
        next();
    });
};

const middleware = (app) => {
    console.log('Middleware initialized');

    app.use(cors({
        origin: (origin, callback) => {
            if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true
    }));
};

module.exports = {
    middleware,
    withAuth,
    withUpload
};