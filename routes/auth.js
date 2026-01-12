import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDB } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Setup endpoint - creates admin user and seeds plans (one-time use via HTTP)
// Protected by a simple secret key to prevent abuse
router.post('/setup', async (req, res) => {
  try {
    const { secret, email, password, name } = req.body;
    const setupSecret = process.env.SETUP_SECRET || 'setup-secret-change-me';
    
    // Verify secret
    if (secret !== setupSecret) {
      return res.status(401).json({ error: 'Invalid setup secret' });
    }

    const db = await getDB();
    const results = {};

    // Create admin user
    const adminEmail = email || 'admin@cleomusic.com';
    const adminPassword = password || 'admin123';
    const adminName = name || 'Admin';
    
    const existingAdmin = await db.collection('users').findOne({ email: adminEmail });
    if (existingAdmin) {
      results.admin = { message: 'Admin user already exists', email: adminEmail };
    } else {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await db.collection('users').insertOne({
        email: adminEmail,
        password: hashedPassword,
        name: adminName,
        role: 'admin',
        created_at: new Date(),
        updated_at: new Date()
      });
      results.admin = { 
        message: 'Admin user created successfully',
        email: adminEmail,
        password: adminPassword,
        warning: 'Please change the password after first login!'
      };
    }

    // Seed subscription plans
    const existingPlans = await db.collection('subscription_plans').countDocuments();
    if (existingPlans === 0) {
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
      results.plans = { message: 'Subscription plans created', count: plans.length };
    } else {
      results.plans = { message: 'Subscription plans already exist', count: existingPlans };
    }

    res.json({
      message: 'Setup completed successfully',
      results
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ 
      error: 'Setup failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Better error messages
    if (!email || !password || !name) {
      const missing = [];
      if (!email) missing.push('email');
      if (!password) missing.push('password');
      if (!name) missing.push('name');
      return res.status(400).json({ 
        error: 'All fields are required',
        missing: missing
      });
    }

    // Check if JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured in environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error. Please contact support.',
        details: process.env.NODE_ENV === 'development' ? 'JWT_SECRET is missing from environment variables' : undefined
      });
    }

    const db = await getDB();

    // Check if user exists
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists. Please try logging in instead.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await db.collection('users').insertOne({
      email,
      password: hashedPassword,
      name,
      role: 'user',
      created_at: new Date(),
      updated_at: new Date()
    });

    const user = {
      id: result.insertedId.toString(),
      email,
      name,
      role: 'user'
    };

    // Generate token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ 
      error: 'Registration failed. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured in environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error. Please contact support.',
        details: process.env.NODE_ENV === 'development' ? 'JWT_SECRET is missing from environment variables' : undefined
      });
    }

    const db = await getDB();

    // Find user
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Login failed. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const db = await getDB();
    const userId = new ObjectId(req.user.id);

    // Check subscription status
    const subscription = await db.collection('user_subscriptions').findOne(
      {
        user_id: userId,
        status: 'active',
        end_date: { $gt: new Date() }
      },
      { sort: { end_date: -1 } }
    );

    let subscriptionData = null;
    if (subscription) {
      const plan = await db.collection('subscription_plans').findOne(
        { _id: new ObjectId(subscription.plan_id) }
      );
      subscriptionData = {
        ...subscription,
        id: subscription._id.toString(),
        plan_name: plan?.name,
        price: plan?.price
      };
    }

    res.json({
      user: req.user,
      subscription: subscriptionData
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
