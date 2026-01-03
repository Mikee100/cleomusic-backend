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
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
  res.json({ status: 'ok', message: 'Cleo Music API is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

