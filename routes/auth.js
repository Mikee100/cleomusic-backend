import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDB } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const db = await getDB();

    // Check if user exists
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
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
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
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
    res.status(500).json({ error: 'Server error' });
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
