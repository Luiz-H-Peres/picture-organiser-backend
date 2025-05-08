const { MongoClient } = require('mongodb');
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    throw new Error('❌ MONGO_URI is not defined in environment variables.');
}

let client;
let db;

const connectToDatabase = async () => {
    if (client && client.topology?.isConnected()) {
        return db;
    }

    try {
        client = await MongoClient.connect(MONGO_URI); // ← no options needed
        db = client.db('picture_organiser');
        console.log('✅ Connected to MongoDB');
        return db;
    } catch (err) {
        console.error('❌ Failed to connect to MongoDB:', err);
        process.exit(1);
    }
};

const getDbClient = async () => {
    if (!db) {
        await connectToDatabase();
    }
    return db;
};

module.exports = {
    getDbClient,
};
