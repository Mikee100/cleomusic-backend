-- Migration for comments, likes, and dislikes functionality
-- Supports photos, songs, and videos

-- Comments table (polymorphic - can comment on photos, songs, or videos)
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('photo', 'song', 'video')),
  content_id INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_type, content_id, user_id, created_at)
);

-- Likes table (polymorphic - can like photos, songs, or videos)
CREATE TABLE IF NOT EXISTS likes (
  id SERIAL PRIMARY KEY,
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('photo', 'song', 'video')),
  content_id INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_type, content_id, user_id)
);

-- Dislikes table (polymorphic - can dislike photos, songs, or videos)
CREATE TABLE IF NOT EXISTS dislikes (
  id SERIAL PRIMARY KEY,
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('photo', 'song', 'video')),
  content_id INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_type, content_id, user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_comments_content ON comments(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_content ON likes(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_dislikes_content ON dislikes(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_dislikes_user ON dislikes(user_id);



