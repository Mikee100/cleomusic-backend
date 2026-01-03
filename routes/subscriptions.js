import express from 'express';
import { getDB } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Get all subscription plans
router.get('/plans', async (req, res) => {
  try {
    const db = await getDB();
    const plans = await db.collection('subscription_plans')
      .find({ is_active: true })
      .sort({ price: 1 })
      .toArray();

    const formattedPlans = plans.map(plan => ({
      id: plan._id.toString(),
      name: plan.name,
      description: plan.description,
      price: plan.price,
      duration_days: plan.duration_days,
      stripe_price_id: plan.stripe_price_id,
      is_active: plan.is_active,
      created_at: plan.created_at
    }));

    res.json(formattedPlans);
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's current subscription
router.get('/current', authenticate, async (req, res) => {
  try {
    const db = await getDB();
    const userId = new ObjectId(req.user.id);

    const subscription = await db.collection('user_subscriptions')
      .findOne(
        { user_id: userId },
        { sort: { created_at: -1 } }
      );

    if (!subscription) {
      return res.json({ subscription: null });
    }

    const plan = await db.collection('subscription_plans').findOne(
      { _id: new ObjectId(subscription.plan_id) }
    );

    const isActive = subscription.status === 'active' && new Date(subscription.end_date) > new Date();

    res.json({
      subscription: {
        id: subscription._id.toString(),
        user_id: subscription.user_id.toString(),
        plan_id: subscription.plan_id.toString(),
        status: subscription.status,
        start_date: subscription.start_date,
        end_date: subscription.end_date,
        stripe_subscription_id: subscription.stripe_subscription_id,
        created_at: subscription.created_at,
        updated_at: subscription.updated_at,
        plan_name: plan?.name,
        description: plan?.description,
        price: plan?.price,
        duration_days: plan?.duration_days,
        isActive
      }
    });
  } catch (error) {
    console.error('Get current subscription error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
