-- Albums table
CREATE TABLE IF NOT EXISTS albums (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  artist VARCHAR(255) NOT NULL,
  description TEXT,
  cover_image_path VARCHAR(500),
  release_date DATE,
  genre VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Update songs table to reference albums
ALTER TABLE songs ADD COLUMN IF NOT EXISTS album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_songs_album_id ON songs(album_id);
CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist);
CREATE INDEX IF NOT EXISTS idx_albums_is_active ON albums(is_active);

