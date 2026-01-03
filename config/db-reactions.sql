-- Reactions tables for songs, photos, and videos
-- Run this script to add reactions functionality to the database
-- This matches the schema used by the interactions.js route

-- Unified likes table (works for songs, photos, videos)
CREATE TABLE IF NOT EXISTS likes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('song', 'photo', 'video')),
  content_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, content_type, content_id)
);

-- Unified dislikes table (works for songs, photos, videos)
CREATE TABLE IF NOT EXISTS dislikes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('song', 'photo', 'video')),
  content_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, content_type, content_id)
);

-- Unified comments table (works for songs, photos, videos)
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('song', 'photo', 'video')),
  content_id INTEGER NOT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_content ON likes(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_dislikes_user_id ON dislikes(user_id);
CREATE INDEX IF NOT EXISTS idx_dislikes_content ON dislikes(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_content ON comments(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);

