const { MongoClient } = require('mongodb');

// MongoDB connection string
const uri = "mongodb+srv://lperes01:8796Waterstones@projectpicorganiser.txyid.mongodb.net/?retryWrites=true&w=majority";

async function run() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB!");

        const db = client.db("picture_organiser");
        const albumsCollection = db.collection("albums");

        // Insert a test album
        const result = await albumsCollection.insertOne({
            user_id: "12345", // Link to the user who owns the album
            album_name: "Vacation 2025",
            description: "Photos from my Hawaii trip",
            created_at: new Date(),
            photos: ["67912aebaa24d59e20e0e950", "6791540ba1a223c2648b5943"] // Replace with actual photo IDs
        });

        console.log(`Album inserted with _id: ${result.insertedId}`);
    } catch (err) {
        console.error("An error occurred:", err);
    } finally {
        await client.close();
        console.log("Connection closed.");
    }
}

run().catch(console.dir);
