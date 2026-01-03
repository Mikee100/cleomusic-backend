-- Create database (run this manually in PostgreSQL)
-- CREATE DATABASE cleo_music;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  duration_days INTEGER NOT NULL,
  stripe_price_id VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES subscription_plans(id),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_date TIMESTAMP NOT NULL,
  stripe_subscription_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Songs table
CREATE TABLE IF NOT EXISTS songs (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255) NOT NULL,
  album VARCHAR(255),
  genre VARCHAR(100),
  file_path VARCHAR(500) NOT NULL,
  cover_image_path VARCHAR(500),
  duration INTEGER,
  file_size BIGINT,
  is_archived BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES user_subscriptions(id),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  payment_method VARCHAR(50) CHECK (payment_method IN ('stripe', 'mpesa')),
  payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
  stripe_payment_intent_id VARCHAR(255),
  mpesa_transaction_id VARCHAR(255),
  transaction_reference VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT,
  is_archived BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Videos table
CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT,
  duration INTEGER,
  thumbnail_path VARCHAR(500),
  is_archived BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_songs_is_active ON songs(is_active);
CREATE INDEX IF NOT EXISTS idx_songs_is_archived ON songs(is_archived);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_photos_is_active ON photos(is_active);
CREATE INDEX IF NOT EXISTS idx_photos_is_archived ON photos(is_archived);
CREATE INDEX IF NOT EXISTS idx_videos_is_active ON videos(is_active);
CREATE INDEX IF NOT EXISTS idx_videos_is_archived ON videos(is_archived);

-- Insert default admin user
-- NOTE: After running this script, use the create-admin.js script to set a proper password:
-- node backend/scripts/create-admin.js admin@cleomusic.com your_password Admin
-- Or manually insert with a bcrypt hash

-- Insert default subscription plans
INSERT INTO subscription_plans (name, description, price, duration_days) VALUES
('Basic', '1 month access to all music', 9.99, 30),
('Premium', '3 months access to all music', 24.99, 90),
('Annual', '12 months access to all music', 79.99, 365)
ON CONFLICT DO NOTHING;

