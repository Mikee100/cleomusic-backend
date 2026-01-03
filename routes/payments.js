import express from 'express';
import Stripe from 'stripe';
import { getDB } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();
// Initialize Stripe only if secret key is provided
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
} catch (error) {
  console.log('Stripe not configured, using test mode');
}

// Mock/Test payment endpoint - creates subscription without real payment
router.post('/test/subscribe', authenticate, async (req, res) => {
  try {
    const { planId, paymentMethod } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    const db = await getDB();

    // Get plan
    const plan = await db.collection('subscription_plans').findOne({
      _id: new ObjectId(planId)
    });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Calculate end date
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration_days);

    const userId = new ObjectId(req.user.id);

    // Create subscription
    const subscriptionResult = await db.collection('user_subscriptions').insertOne({
      user_id: userId,
      plan_id: new ObjectId(planId),
      status: 'active',
      end_date: endDate,
      created_at: new Date(),
      updated_at: new Date()
    });

    // Create payment record
    await db.collection('payments').insertOne({
      user_id: userId,
      subscription_id: subscriptionResult.insertedId,
      amount: plan.price,
      currency: 'USD',
      payment_method: paymentMethod || 'test',
      payment_status: 'completed',
      transaction_reference: `TEST-${Date.now()}-${req.user.id}`,
      created_at: new Date(),
      updated_at: new Date()
    });

    const subscription = await db.collection('user_subscriptions').findOne({
      _id: subscriptionResult.insertedId
    });

    res.json({
      success: true,
      message: 'Subscription activated successfully',
      subscription: {
        id: subscription._id.toString(),
        ...subscription
      }
    });
  } catch (error) {
    console.error('Test subscription error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create Stripe payment intent - TEST MODE (always creates subscription immediately)
router.post('/stripe/create-intent', authenticate, async (req, res) => {
  try {
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    const db = await getDB();

    // TEST MODE: Always create subscription immediately (no real payment processing)
    const plan = await db.collection('subscription_plans').findOne({
      _id: new ObjectId(planId)
    });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration_days);

    const userId = new ObjectId(req.user.id);

    // Check if user already has an active subscription and extend or create new
    const existingSub = await db.collection('user_subscriptions').findOne({
      user_id: userId,
      status: 'active',
      end_date: { $gt: new Date() }
    }, { sort: { end_date: -1 } });

    let subscription;
    if (existingSub) {
      // Extend existing subscription
      const newEndDate = new Date(existingSub.end_date);
      newEndDate.setDate(newEndDate.getDate() + plan.duration_days);
      
      await db.collection('user_subscriptions').updateOne(
        { _id: existingSub._id },
        {
          $set: {
            end_date: newEndDate,
            updated_at: new Date()
          }
        }
      );

      subscription = await db.collection('user_subscriptions').findOne({
        _id: existingSub._id
      });
    } else {
      // Create new subscription
      const subscriptionResult = await db.collection('user_subscriptions').insertOne({
        user_id: userId,
        plan_id: new ObjectId(planId),
        status: 'active',
        end_date: endDate,
        created_at: new Date(),
        updated_at: new Date()
      });

      subscription = await db.collection('user_subscriptions').findOne({
        _id: subscriptionResult.insertedId
      });
    }

    await db.collection('payments').insertOne({
      user_id: userId,
      subscription_id: subscription._id,
      amount: plan.price,
      currency: 'USD',
      payment_method: 'stripe',
      payment_status: 'completed',
      transaction_reference: `STRIPE-TEST-${Date.now()}-${req.user.id}`,
      created_at: new Date(),
      updated_at: new Date()
    });

    return res.json({
      clientSecret: 'test_mode',
      paymentIntentId: `test_${Date.now()}`,
      testMode: true
    });

    /* REAL STRIPE CODE (uncomment when ready for production)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(plan.price * 100),
      currency: 'usd',
      metadata: {
        userId: req.user.id.toString(),
        planId: plan.id.toString()
      }
    });
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
    */
  } catch (error) {
    console.error('Create Stripe intent error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Stripe webhook
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    return res.status(400).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const userId = new ObjectId(paymentIntent.metadata.userId);
    const planId = new ObjectId(paymentIntent.metadata.planId);

    try {
      const db = await getDB();

      // Get plan
      const plan = await db.collection('subscription_plans').findOne({
        _id: planId
      });

      if (!plan) {
        throw new Error('Plan not found');
      }

      // Calculate end date
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration_days);

      // Create subscription
      const subscriptionResult = await db.collection('user_subscriptions').insertOne({
        user_id: userId,
        plan_id: planId,
        status: 'active',
        end_date: endDate,
        stripe_subscription_id: paymentIntent.id,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Create payment record
      await db.collection('payments').insertOne({
        user_id: userId,
        subscription_id: subscriptionResult.insertedId,
        amount: plan.price,
        currency: 'USD',
        payment_method: 'stripe',
        payment_status: 'completed',
        stripe_payment_intent_id: paymentIntent.id,
        created_at: new Date(),
        updated_at: new Date()
      });

      console.log('Subscription created successfully');
    } catch (error) {
      console.error('Error processing webhook:', error);
    }
  }

  res.json({ received: true });
});

// M-Pesa payment initiation - TEST MODE (always creates subscription immediately)
router.post('/mpesa/initiate', authenticate, async (req, res) => {
  try {
    const { planId, phoneNumber } = req.body;

    if (!planId || !phoneNumber) {
      return res.status(400).json({ error: 'Plan ID and phone number are required' });
    }

    const db = await getDB();

    // Get plan
    const plan = await db.collection('subscription_plans').findOne({
      _id: new ObjectId(planId)
    });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // TEST MODE: Always create subscription immediately (no real payment processing)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration_days);

    const userId = new ObjectId(req.user.id);

    // Check if user already has an active subscription and extend or create new
    const existingSub = await db.collection('user_subscriptions').findOne({
      user_id: userId,
      status: 'active',
      end_date: { $gt: new Date() }
    }, { sort: { end_date: -1 } });

    let subscription;
    if (existingSub) {
      // Extend existing subscription
      const newEndDate = new Date(existingSub.end_date);
      newEndDate.setDate(newEndDate.getDate() + plan.duration_days);
      
      await db.collection('user_subscriptions').updateOne(
        { _id: existingSub._id },
        {
          $set: {
            end_date: newEndDate,
            updated_at: new Date()
          }
        }
      );

      subscription = await db.collection('user_subscriptions').findOne({
        _id: existingSub._id
      });
    } else {
      // Create new subscription
      const subscriptionResult = await db.collection('user_subscriptions').insertOne({
        user_id: userId,
        plan_id: new ObjectId(planId),
        status: 'active',
        end_date: endDate,
        created_at: new Date(),
        updated_at: new Date()
      });

      subscription = await db.collection('user_subscriptions').findOne({
        _id: subscriptionResult.insertedId
      });
    }

    const transactionReference = `MPESA-TEST-${Date.now()}-${req.user.id}`;
    await db.collection('payments').insertOne({
      user_id: userId,
      subscription_id: subscription._id,
      amount: plan.price,
      currency: 'KES',
      payment_method: 'mpesa',
      payment_status: 'completed',
      transaction_reference: transactionReference,
      mpesa_transaction_id: `MPESA${Date.now()}`,
      created_at: new Date(),
      updated_at: new Date()
    });

    res.json({
      message: 'Payment completed successfully',
      checkoutRequestID: `TEST-${Date.now()}`,
      transactionReference,
      testMode: true
    });
  } catch (error) {
    console.error('M-Pesa initiate error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate payment' });
  }
});

// M-Pesa callback
router.post('/mpesa/callback', async (req, res) => {
  try {
    const { Body } = req.body;
    const stkCallback = Body.stkCallback;

    if (stkCallback.ResultCode === 0) {
      const metadata = stkCallback.CallbackMetadata.Item;
      const amount = metadata.find(item => item.Name === 'Amount')?.Value;
      const receiptNumber = metadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
      const transactionDate = metadata.find(item => item.Name === 'TransactionDate')?.Value;
      const phoneNumber = metadata.find(item => item.Name === 'PhoneNumber')?.Value;

      const db = await getDB();

      // Find payment by transaction reference
      const payment = await db.collection('payments').findOne({
        transaction_reference: stkCallback.MerchantRequestID,
        payment_status: 'pending'
      });

      if (payment) {
        // Get plan (you might need to store planId in payment metadata)
        // For now, we'll use the first active plan with matching price
        const plan = await db.collection('subscription_plans').findOne({
          price: payment.amount,
          is_active: true
        });

        if (plan) {
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + plan.duration_days);

          // Create subscription
          const subscriptionResult = await db.collection('user_subscriptions').insertOne({
            user_id: payment.user_id,
            plan_id: plan._id,
            status: 'active',
            end_date: endDate,
            created_at: new Date(),
            updated_at: new Date()
          });

          // Update payment
          await db.collection('payments').updateOne(
            { _id: payment._id },
            {
              $set: {
                payment_status: 'completed',
                mpesa_transaction_id: receiptNumber,
                subscription_id: subscriptionResult.insertedId,
                updated_at: new Date()
              }
            }
          );
        }
      }
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('M-Pesa callback error:', error);
    res.status(500).json({ error: 'Callback processing failed' });
  }
});

export default router;
