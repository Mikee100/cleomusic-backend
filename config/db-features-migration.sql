-- Migration: Add listening count and additional features
-- Run this after db-init.sql

-- Add play_count column to songs table
ALTER TABLE songs ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0;

-- Create song_plays table for detailed play tracking
CREATE TABLE IF NOT EXISTS song_plays (
  id SERIAL PRIMARY KEY,
  song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  play_duration INTEGER, -- in seconds, can be NULL if not tracked
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user_song_favorites table for favorites/likes
CREATE TABLE IF NOT EXISTS user_song_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, song_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_song_plays_song_id ON song_plays(song_id);
CREATE INDEX IF NOT EXISTS idx_song_plays_user_id ON song_plays(user_id);
CREATE INDEX IF NOT EXISTS idx_song_plays_played_at ON song_plays(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_song_favorites_user_id ON user_song_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_song_favorites_song_id ON user_song_favorites(song_id);
CREATE INDEX IF NOT EXISTS idx_songs_play_count ON songs(play_count DESC);

