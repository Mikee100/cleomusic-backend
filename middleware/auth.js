import jwt from 'jsonwebtoken';
import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const db = await getDB();
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { _id: 1, email: 1, name: 1, role: 1 } }
    );
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Convert _id to id for consistency
    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const requireSubscription = async (req, res, next) => {
  try {
    // Admins can access without subscription
    if (req.user?.role === 'admin') {
      return next();
    }

    const userId = req.user.id;
    const db = await getDB();
    
    const subscription = await db.collection('user_subscriptions').findOne(
      {
        user_id: new ObjectId(userId),
        status: 'active',
        end_date: { $gt: new Date() }
      },
      { sort: { end_date: -1 } }
    );

    if (!subscription) {
      return res.status(403).json({ 
        error: 'Active subscription required',
        requiresSubscription: true 
      });
    }

    const plan = await db.collection('subscription_plans').findOne(
      { _id: new ObjectId(subscription.plan_id) }
    );

    req.subscription = {
      ...subscription,
      id: subscription._id.toString(),
      plan_name: plan?.name
    };
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Error checking subscription' });
  }
};
