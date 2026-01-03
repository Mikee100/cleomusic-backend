import { getDB, closeDB } from '../config/database.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

async function seedDatabase() {
  try {
    const db = await getDB();

    console.log('Starting database seeding...');

    // Create indexes for better performance
    console.log('Creating indexes...');
    
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ role: 1 });
    
    await db.collection('songs').createIndex({ is_active: 1, is_archived: 1 });
    await db.collection('songs').createIndex({ album_id: 1 });
    await db.collection('songs').createIndex({ genre: 1 });
    
    await db.collection('user_subscriptions').createIndex({ user_id: 1 });
    await db.collection('user_subscriptions').createIndex({ status: 1, end_date: 1 });
    
    await db.collection('payments').createIndex({ user_id: 1 });
    await db.collection('payments').createIndex({ payment_status: 1 });
    
    await db.collection('subscription_plans').createIndex({ is_active: 1 });
    
    await db.collection('albums').createIndex({ created_by: 1 });
    
    await db.collection('photos').createIndex({ is_active: 1, is_archived: 1 });
    await db.collection('videos').createIndex({ is_active: 1, is_archived: 1 });
    
    await db.collection('likes').createIndex({ content_type: 1, content_id: 1, user_id: 1 });
    await db.collection('dislikes').createIndex({ content_type: 1, content_id: 1, user_id: 1 });
    await db.collection('comments').createIndex({ content_type: 1, content_id: 1 });
    await db.collection('comments').createIndex({ user_id: 1 });
    
    await db.collection('user_song_favorites').createIndex({ user_id: 1, song_id: 1 }, { unique: true });
    await db.collection('song_plays').createIndex({ user_id: 1, song_id: 1 });
    await db.collection('song_plays').createIndex({ played_at: -1 });

    console.log('Indexes created successfully!');

    // Check if subscription plans already exist
    const existingPlans = await db.collection('subscription_plans').countDocuments();
    
    if (existingPlans === 0) {
      console.log('Creating default subscription plans...');
      
      const plans = [
        {
          name: 'Basic',
          description: '1 month access to all music',
          price: 9.99,
          duration_days: 30,
          stripe_price_id: null,
          is_active: true,
          created_at: new Date()
        },
        {
          name: 'Premium',
          description: '3 months access to all music',
          price: 24.99,
          duration_days: 90,
          stripe_price_id: null,
          is_active: true,
          created_at: new Date()
        },
        {
          name: 'Annual',
          description: '12 months access to all music',
          price: 79.99,
          duration_days: 365,
          stripe_price_id: null,
          is_active: true,
          created_at: new Date()
        }
      ];

      await db.collection('subscription_plans').insertMany(plans);
      console.log('Default subscription plans created!');
    } else {
      console.log('Subscription plans already exist, skipping...');
    }

    // Check if admin user exists
    const existingAdmin = await db.collection('users').findOne({ role: 'admin' });
    
    if (!existingAdmin) {
      console.log('Creating default admin user...');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await db.collection('users').insertOne({
        email: 'admin@cleomusic.com',
        password: hashedPassword,
        name: 'Admin',
        role: 'admin',
        created_at: new Date(),
        updated_at: new Date()
      });
      
      console.log('Default admin user created!');
      console.log('Email: admin@cleomusic.com');
      console.log('Password: admin123');
      console.log('⚠️  Please change the password after first login!');
    } else {
      console.log('Admin user already exists, skipping...');
    }

    console.log('\n✅ Database seeding completed successfully!');
    
    await closeDB();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    await closeDB();
    process.exit(1);
  }
}

seedDatabase();

