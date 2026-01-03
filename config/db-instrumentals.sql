-- Instrumentals table
CREATE TABLE IF NOT EXISTS instrumentals (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255) NOT NULL,
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

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_instrumentals_active ON instrumentals (is_active, is_archived);
CREATE INDEX IF NOT EXISTS idx_instrumentals_uploaded_by ON instrumentals (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_instrumentals_genre ON instrumentals (genre);


