import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'cleo-music';

async function checkVideos() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const videos = await db.collection('videos').find({}).toArray();
    console.log(JSON.stringify(videos, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkVideos();
