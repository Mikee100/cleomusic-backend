import bcrypt from 'bcryptjs';
import { getDB, closeDB } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function createAdmin() {
  const email = process.argv[2] || 'admin@cleomusic.com';
  const password = process.argv[3] || 'admin123';
  const name = process.argv[4] || 'Admin';

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const db = await getDB();
    
    const result = await db.collection('users').updateOne(
      { email },
      {
        $set: {
          email,
          password: hashedPassword,
          name,
          role: 'admin',
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      console.log(`Admin user created successfully!`);
    } else {
      console.log(`Admin user updated successfully!`);
    }
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`\n⚠️  Please change the password after first login!`);
    
    await closeDB();
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin:', error);
    await closeDB();
    process.exit(1);
  }
}

createAdmin();
