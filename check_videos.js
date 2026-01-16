import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'cleo-music';

async function checkVideos() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db(DB_NAME);
    const videos = await db.collection('videos').find({}).toArray();
    console.log('Total videos found:', videos.length);
    if (videos.length > 0) {
      console.log('All videos in DB:');
      videos.forEach((v, i) => {
        console.log(`${i + 1}. Title: ${v.title}, Type: ${v.type}, Active: ${v.is_active}, Archived: ${v.is_archived}`);
      });
    }
    
    const activeVideos = await db.collection('videos').find({ is_active: true, is_archived: false }).toArray();
    console.log('\nActive and non-archived videos:', activeVideos.length);
    activeVideos.forEach((v, i) => {
        console.log(`${i + 1}. Title: ${v.title}, Type: ${v.type}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkVideos();
