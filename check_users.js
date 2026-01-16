import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'cleo-music';

async function checkUsers() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db(DB_NAME);
    const users = await db.collection('users').find({}).toArray();
    console.log('Total users found:', users.length);
    for (const user of users) {
      console.log(`User: ${user.name}, Email: ${user.email}, Role: ${user.role}, ID: ${user._id}`);
      const subs = await db.collection('user_subscriptions').find({ user_id: user._id }).toArray();
      console.log(`  Subscriptions: ${subs.length}`);
      subs.forEach(s => {
          console.log(`    Plan: ${s.plan_id}, Status: ${s.status}, End: ${s.end_date}`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkUsers();
