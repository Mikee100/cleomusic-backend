import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import songRoutes from './routes/songs.js';
import subscriptionRoutes from './routes/subscriptions.js';
import paymentRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';
import photoRoutes from './routes/photos.js';
import videoRoutes from './routes/videos.js';
import interactionRoutes from './routes/interactions.js';
import albumRoutes from './routes/albums.js';
import instrumentalRoutes from './routes/instrumentals.js';
import playlistRoutes from './routes/playlists.js';
import userRoutes from './routes/users.js';
import fileRoutes from './routes/files.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// CORS configuration - supports multiple origins (localhost for dev, Vercel for production)
// Note: CORS only checks origin (protocol + domain), not the path
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => {
      // Remove any paths - CORS only cares about origin (protocol + domain)
      const trimmed = url.trim();
      try {
        const urlObj = new URL(trimmed);
        return `${urlObj.protocol}//${urlObj.host}`; // Return only origin, no path
      } catch {
        return trimmed; // If URL parsing fails, return as-is
      }
    })
  : ['http://localhost:5173'];

// Log CORS configuration on startup
console.log('🌐 CORS Configuration:');
console.log('   Allowed Origins:', allowedOrigins);
console.log('   FRONTEND_URL env:', process.env.FRONTEND_URL || '(not set - using default localhost)');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // For development, allow localhost
      if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) {
        callback(null, true);
      } else {
        // Log the rejected origin for debugging
        console.warn(`⚠️  CORS blocked origin: ${origin}`);
        console.warn(`   Allowed origins: ${allowedOrigins.join(', ')}`);
        console.warn(`   Set FRONTEND_URL environment variable to include: ${origin}`);
        callback(new Error(`CORS: Origin ${origin} not allowed. Set FRONTEND_URL env var.`));
      }
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/interactions', interactionRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/instrumentals', instrumentalRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/users', userRoutes);
app.use('/api/files', fileRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Cleo Music API is running',
    cors: {
      allowedOrigins: allowedOrigins,
      frontendUrl: process.env.FRONTEND_URL || '(not set)',
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`📡 API available at: http://localhost:${PORT}/api`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health\n`);
});

