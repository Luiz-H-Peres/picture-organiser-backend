

const { MongoClient } = require('mongodb');

// Replace with your connection string
const uri = "mongodb+srv://lperes01:8796Waterstones@projectpicorganiser.txyid.mongodb.net/?retryWrites=true&w=majority";

async function run() {
    const client = new MongoClient(uri);

    try {
        console.log("Attempting to connect to MongoDB...");
        await client.connect();
        console.log("Connected to MongoDB!");

        // Connect to the database and collection
        const db = client.db("picture_organiser");
        const collection = db.collection("photos");

        console.log("Inserting a document into the 'photos' collection...");

        // Insert a test document
        const result = await collection.insertOne({
            user_id: "12345",
            file_path: "/images/vacation.jpg",
            upload_date: new Date(),
            metadata: {
                location: "Hawaii, USA",
                date_taken: new Date("2025-01-10"),
                device: "Canon EOS 90D"
            },
            tags: ["Beach", "Vacation"]
        });

        console.log(`Document inserted successfully with _id: ${result.insertedId}`);
    } catch (err) {
        console.error("An error occurred:", err);
    } finally {
        await client.close();
        console.log("Connection closed.");
    }
}

run().catch(console.dir);
