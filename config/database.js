import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.DB_URI;
const DB_NAME = process.env.DB_NAME || 'cleo-music';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable in your .env file');
}

let client;
let db;

// Connect to MongoDB
export async function connectDB() {
  try {
    if (!client) {
      client = new MongoClient(MONGODB_URI);
      await client.connect();
      console.log('Connected to MongoDB database');
    }
    
    if (!db) {
      db = client.db(DB_NAME);
    }
    
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Get database instance
export async function getDB() {
  if (!db) {
    await connectDB();
  }
  return db;
}

// Close connection
export async function closeDB() {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
    client = null;
    db = null;
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDB();
  process.exit(0);
});

// Initialize connection on import
connectDB().catch(console.error);

export default { connectDB, getDB, closeDB };
