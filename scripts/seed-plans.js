import { getDB, closeDB } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function seedPlans(force = false) {
  try {
    const db = await getDB();

    console.log('Starting subscription plans seeding...');

    // Check if plans already exist
    const existingPlans = await db.collection('subscription_plans').countDocuments();
    
    if (existingPlans > 0 && !force) {
      console.log(`Found ${existingPlans} existing plan(s).`);
      console.log('Plans already exist. Use --force to delete and recreate them.');
      
      // Show existing plans
      const currentPlans = await db.collection('subscription_plans')
        .find({})
        .sort({ price: 1 })
        .toArray();
      
      console.log('\n📋 Existing subscription plans:');
      currentPlans.forEach(plan => {
        console.log(`  - ${plan.name}: $${plan.price} (${plan.duration_days} days) - ${plan.is_active ? 'Active' : 'Inactive'}`);
      });
      
      await closeDB();
      process.exit(0);
    }

    // Delete existing plans if force mode
    if (force && existingPlans > 0) {
      await db.collection('subscription_plans').deleteMany({});
      console.log(`Deleted ${existingPlans} existing plan(s).`);
    }

    // Default subscription plans
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

    // Insert plans
    const result = await db.collection('subscription_plans').insertMany(plans);
    console.log(`✅ Successfully created ${result.insertedCount} subscription plan(s)!`);
    
    // Display created plans
    const allPlans = await db.collection('subscription_plans')
      .find({ is_active: true })
      .sort({ price: 1 })
      .toArray();
    
    console.log('\n📋 Current subscription plans:');
    allPlans.forEach(plan => {
      console.log(`  - ${plan.name}: $${plan.price} (${plan.duration_days} days) - ${plan.description}`);
    });

    console.log('\n✅ Subscription plans seeding completed successfully!');
    
    await closeDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding subscription plans:', error);
    await closeDB();
    process.exit(1);
  }
}

// Check for --force flag
const force = process.argv.includes('--force') || process.argv.includes('-f');

if (force) {
  console.log('⚠️  Force mode: Will delete existing plans and create new ones...\n');
}

seedPlans(force);

