const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://lperes01:8796Waterstones@projectpicorganiser.txyid.mongodb.net/?retryWrites=true&w=majority";

async function run() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB!");

        const db = client.db("picture_organiser");
        const usersCollection = db.collection("users");

        // Insert a test user
        const result = await usersCollection.insertOne({
            username: "johndoe",
            email: "johndoe@example.com",
            password: "hashed_password", // Replace with an actual hashed password in a real app
            created_at: new Date()
        });

        console.log(`User inserted with _id: ${result.insertedId}`);
    } catch (err) {
        console.error("An error occurred:", err);
    } finally {
        await client.close();
        console.log("Connection closed.");
    }
}

run().catch(console.dir);
