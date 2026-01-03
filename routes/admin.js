import express from 'express';
import { getDB } from '../config/database.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { uploadSongFiles, uploadPhoto, uploadVideo } from '../middleware/upload.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ObjectId } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Helper function to format document with id
const formatDoc = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
};

// ========== SONGS MANAGEMENT ==========

// Upload song
router.post('/songs', uploadSongFiles.fields([
  { name: 'musicFile', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, artist, album, genre, album_id } = req.body;

    if (!title || !artist || !req.files?.musicFile) {
      return res.status(400).json({ error: 'Title, artist, and music file are required' });
    }

    const musicFile = req.files.musicFile[0];
    const coverFile = req.files?.coverImage?.[0];

    const musicFilePath = `/uploads/music/${musicFile.filename}`;
    const coverImagePath = coverFile 
      ? `/uploads/covers/${coverFile.filename}` 
      : null;

    const db = await getDB();
    const result = await db.collection('songs').insertOne({
      title,
      artist,
      album: album || null,
      genre: genre || null,
      file_path: musicFilePath,
      cover_image_path: coverImagePath,
      file_size: musicFile.size,
      uploaded_by: new ObjectId(req.user.id),
      album_id: album_id ? new ObjectId(album_id) : null,
      play_count: 0,
      is_archived: false,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    });

    const song = await db.collection('songs').findOne({ _id: result.insertedId });

    res.status(201).json({
      message: 'Song uploaded successfully',
      song: formatDoc(song)
    });
  } catch (error) {
    console.error('Upload song error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all songs (including archived)
router.get('/songs', async (req, res) => {
  try {
    const { page = 1, limit = 20, archived, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = await getDB();

    const filter = {};
    if (archived !== undefined) {
      filter.is_archived = archived === 'true';
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { artist: { $regex: search, $options: 'i' } },
        { album: { $regex: search, $options: 'i' } },
        { genre: { $regex: search, $options: 'i' } }
      ];
    }

    const songs = await db.collection('songs').aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'albums',
          localField: 'album_id',
          foreignField: '_id',
          as: 'album'
        }
      },
      {
        $addFields: {
          play_count: { $ifNull: ['$play_count', 0] },
          album_name: { $arrayElemAt: ['$album.name', 0] },
          album_cover: { $arrayElemAt: ['$album.cover_image_path', 0] }
        }
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]).toArray();

    const total = await db.collection('songs').countDocuments(filter);

    res.json({
      songs: songs.map(formatDoc),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get admin songs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update song
router.put('/songs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, artist, album, genre, is_active, is_archived } = req.body;
    const db = await getDB();

    const update = { updated_at: new Date() };
    if (title !== undefined) update.title = title;
    if (artist !== undefined) update.artist = artist;
    if (album !== undefined) update.album = album;
    if (genre !== undefined) update.genre = genre;
    if (is_active !== undefined) update.is_active = is_active;
    if (is_archived !== undefined) update.is_archived = is_archived;

    const result = await db.collection('songs').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Song not found' });
    }

    res.json({
      message: 'Song updated successfully',
      song: formatDoc(result.value)
    });
  } catch (error) {
    console.error('Update song error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Archive/Unarchive song
router.patch('/songs/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    const { archived } = req.body;
    const db = await getDB();

    const result = await db.collection('songs').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          is_archived: archived,
          updated_at: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Song not found' });
    }

    res.json({
      message: `Song ${archived ? 'archived' : 'unarchived'} successfully`,
      song: formatDoc(result.value)
    });
  } catch (error) {
    console.error('Archive song error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete song
router.delete('/songs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();

    const song = await db.collection('songs').findOne({ _id: new ObjectId(id) });
    
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Delete files
    if (song.file_path) {
      const filePath = path.join(__dirname, '..', song.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    if (song.cover_image_path) {
      const coverPath = path.join(__dirname, '..', song.cover_image_path);
      if (fs.existsSync(coverPath)) {
        fs.unlinkSync(coverPath);
      }
    }

    await db.collection('songs').deleteOne({ _id: new ObjectId(id) });

    res.json({ message: 'Song deleted successfully' });
  } catch (error) {
    console.error('Delete song error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Bulk archive/unarchive songs
router.patch('/songs/bulk', async (req, res) => {
  try {
    const { songIds, archived } = req.body;

    if (!songIds || !Array.isArray(songIds) || songIds.length === 0) {
      return res.status(400).json({ error: 'Song IDs array is required' });
    }

    const db = await getDB();
    const objectIds = songIds.map(id => new ObjectId(id));

    const result = await db.collection('songs').updateMany(
      { _id: { $in: objectIds } },
      { 
        $set: { 
          is_archived: archived,
          updated_at: new Date()
        }
      }
    );

    const updated = await db.collection('songs').find(
      { _id: { $in: objectIds } },
      { projection: { _id: 1, title: 1 } }
    ).toArray();

    res.json({
      message: `${result.modifiedCount} songs ${archived ? 'archived' : 'unarchived'}`,
      updated: updated.map(formatDoc)
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Bulk delete songs
router.delete('/songs/bulk', async (req, res) => {
  try {
    const { songIds } = req.body;

    if (!songIds || !Array.isArray(songIds) || songIds.length === 0) {
      return res.status(400).json({ error: 'Song IDs array is required' });
    }

    const db = await getDB();
    const objectIds = songIds.map(id => new ObjectId(id));

    const songs = await db.collection('songs').find(
      { _id: { $in: objectIds } },
      { projection: { file_path: 1, cover_image_path: 1 } }
    ).toArray();

    // Delete files
    songs.forEach(song => {
      if (song.file_path) {
        const filePath = path.join(__dirname, '..', song.file_path);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      if (song.cover_image_path) {
        const coverPath = path.join(__dirname, '..', song.cover_image_path);
        if (fs.existsSync(coverPath)) {
          fs.unlinkSync(coverPath);
        }
      }
    });

    await db.collection('songs').deleteMany({ _id: { $in: objectIds } });

    res.json({ message: `${songIds.length} songs deleted successfully` });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== INSTRUMENTALS MANAGEMENT ==========

// Upload instrumental
router.post('/instrumentals', uploadSongFiles.fields([
  { name: 'musicFile', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, artist, album, genre, album_id } = req.body;

    if (!title || !artist || !req.files?.musicFile) {
      return res.status(400).json({ error: 'Title, artist, and music file are required' });
    }

    const musicFile = req.files.musicFile[0];
    const coverFile = req.files?.coverImage?.[0];

    const musicFilePath = `/uploads/music/${musicFile.filename}`;
    const coverImagePath = coverFile 
      ? `/uploads/covers/${coverFile.filename}` 
      : null;

    const db = await getDB();
    const result = await db.collection('songs').insertOne({
      title,
      artist,
      album: album || null,
      genre: genre || null,
      file_path: musicFilePath,
      cover_image_path: coverImagePath,
      file_size: musicFile.size,
      uploaded_by: new ObjectId(req.user.id),
      album_id: album_id ? new ObjectId(album_id) : null,
      type: 'instrumental', // Mark as instrumental
      play_count: 0,
      is_archived: false,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    });

    const instrumental = await db.collection('songs').findOne({ _id: result.insertedId });

    res.status(201).json({
      message: 'Instrumental uploaded successfully',
      instrumental: formatDoc(instrumental)
    });
  } catch (error) {
    console.error('Upload instrumental error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all instrumentals (including archived)
router.get('/instrumentals', async (req, res) => {
  try {
    const { page = 1, limit = 20, archived, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = await getDB();

    const filter = { type: 'instrumental' };
    if (archived !== undefined) {
      filter.is_archived = archived === 'true';
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { artist: { $regex: search, $options: 'i' } },
        { album: { $regex: search, $options: 'i' } },
        { genre: { $regex: search, $options: 'i' } }
      ];
    }

    const instrumentals = await db.collection('songs').aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'albums',
          localField: 'album_id',
          foreignField: '_id',
          as: 'album'
        }
      },
      {
        $addFields: {
          play_count: { $ifNull: ['$play_count', 0] },
          album_name: { $arrayElemAt: ['$album.name', 0] },
          album_cover: { $arrayElemAt: ['$album.cover_image_path', 0] }
        }
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]).toArray();

    const total = await db.collection('songs').countDocuments(filter);

    res.json({
      instrumentals: instrumentals.map(formatDoc),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get admin instrumentals error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update instrumental (uses same endpoint as songs, but we can add specific logic if needed)
// Delete instrumental (uses same endpoint as songs)

// ========== DASHBOARD STATS ==========

router.get('/stats', async (req, res) => {
  try {
    const db = await getDB();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalSongs,
      activeSongs,
      archivedSongs,
      totalUsers,
      activeSubscriptions,
      totalRevenue,
      monthlyRevenue,
      recentPayments,
      newUsersThisMonth,
      newUsersLast7Days,
      totalAlbums,
      totalVideos,
      totalPhotos,
      topSongs,
      popularGenres,
      recentUploads,
      recentUserRegistrations,
      recentPaymentList
    ] = await Promise.all([
      db.collection('songs').countDocuments(),
      db.collection('songs').countDocuments({ is_active: true, is_archived: false }),
      db.collection('songs').countDocuments({ is_archived: true }),
      db.collection('users').countDocuments({ role: 'user' }),
      db.collection('user_subscriptions').countDocuments({ 
        status: 'active', 
        end_date: { $gt: now }
      }),
      db.collection('payments').aggregate([
        { $match: { payment_status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).toArray(),
      db.collection('payments').aggregate([
        { 
          $match: { 
            payment_status: 'completed',
            created_at: { $gte: startOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).toArray(),
      db.collection('payments').countDocuments({
        payment_status: 'completed',
        created_at: { $gte: sevenDaysAgo }
      }),
      db.collection('users').countDocuments({ 
        role: 'user',
        created_at: { $gte: startOfMonth }
      }),
      db.collection('users').countDocuments({ 
        role: 'user',
        created_at: { $gte: sevenDaysAgo }
      }),
      db.collection('albums').countDocuments(),
      db.collection('videos').countDocuments({ is_active: true, is_archived: false }),
      db.collection('photos').countDocuments({ is_active: true, is_archived: false }),
      // Top 10 songs by play count
      db.collection('songs').aggregate([
        { $match: { is_active: true, is_archived: false } },
        { $lookup: {
          from: 'user_song_favorites',
          localField: '_id',
          foreignField: 'song_id',
          as: 'favorites'
        }},
        { $addFields: {
          play_count: { $ifNull: ['$play_count', 0] },
          favorite_count: { $size: '$favorites' }
        }},
        { $sort: { play_count: -1 } },
        { $limit: 10 },
        { $project: {
          title: 1,
          artist: 1,
          play_count: 1,
          favorite_count: 1,
          cover_image_path: 1
        }}
      ]).toArray(),
      // Popular genres
      db.collection('songs').aggregate([
        { $match: { is_active: true, is_archived: false, genre: { $ne: null, $ne: '' } } },
        { $group: {
          _id: '$genre',
          count: { $sum: 1 },
          totalPlays: { $sum: { $ifNull: ['$play_count', 0] } }
        }},
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).toArray(),
      // Recent uploads (last 7 days)
      db.collection('songs').find({
        created_at: { $gte: sevenDaysAgo },
        is_active: true,
        is_archived: false
      })
      .sort({ created_at: -1 })
      .limit(10)
      .project({ title: 1, artist: 1, created_at: 1, cover_image_path: 1 })
      .toArray(),
      // Recent user registrations
      db.collection('users').find({
        role: 'user',
        created_at: { $gte: sevenDaysAgo }
      })
      .sort({ created_at: -1 })
      .limit(10)
      .project({ name: 1, email: 1, created_at: 1 })
      .toArray(),
      // Recent payments list
      db.collection('payments').find({
        payment_status: 'completed',
        created_at: { $gte: sevenDaysAgo }
      })
      .sort({ created_at: -1 })
      .limit(10)
      .toArray()
    ]);

    // Format top songs
    const formattedTopSongs = topSongs.map(song => ({
      id: song._id.toString(),
      title: song.title,
      artist: song.artist,
      play_count: song.play_count || 0,
      favorite_count: song.favorite_count || 0,
      cover_image_path: song.cover_image_path
    }));

    // Format popular genres
    const formattedGenres = popularGenres.map(genre => ({
      name: genre._id,
      song_count: genre.count,
      total_plays: genre.totalPlays
    }));

    // Format recent uploads
    const formattedUploads = recentUploads.map(song => ({
      id: song._id.toString(),
      title: song.title,
      artist: song.artist,
      created_at: song.created_at,
      cover_image_path: song.cover_image_path
    }));

    // Format recent users
    const formattedUsers = recentUserRegistrations.map(user => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      created_at: user.created_at
    }));

    // Format recent payments with user info
    const formattedPayments = await Promise.all(recentPaymentList.map(async (payment) => {
      const user = await db.collection('users').findOne(
        { _id: payment.user_id },
        { projection: { name: 1, email: 1 } }
      );
      return {
        id: payment._id.toString(),
        amount: payment.amount,
        currency: payment.currency || 'USD',
        payment_method: payment.payment_method,
        created_at: payment.created_at,
        user_name: user?.name || 'Unknown',
        user_email: user?.email || 'Unknown'
      };
    }));

    res.json({
      songs: {
        total: totalSongs,
        active: activeSongs,
        archived: archivedSongs
      },
      users: {
        total: totalUsers,
        new_this_month: newUsersThisMonth,
        new_last_7_days: newUsersLast7Days
      },
      subscriptions: {
        active: activeSubscriptions
      },
      revenue: {
        total: totalRevenue[0]?.total || 0,
        monthly: monthlyRevenue[0]?.total || 0
      },
      payments: {
        recent: recentPayments
      },
      content: {
        albums: totalAlbums,
        videos: totalVideos,
        photos: totalPhotos
      },
      top_songs: formattedTopSongs,
      popular_genres: formattedGenres,
      recent_uploads: formattedUploads,
      recent_users: formattedUsers,
      recent_payments_list: formattedPayments
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== USERS MANAGEMENT ==========

router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = await getDB();

    const filter = { role: 'user' };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await db.collection('users').aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'user_subscriptions',
          localField: '_id',
          foreignField: 'user_id',
          as: 'subscriptions'
        }
      },
      {
        $addFields: {
          subscription_count: { $size: '$subscriptions' },
          last_subscription: { $max: '$subscriptions.end_date' }
        }
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $project: {
          _id: 1,
          email: 1,
          name: 1,
          role: 1,
          created_at: 1,
          subscription_count: 1,
          last_subscription: 1
        }
      }
    ]).toArray();

    const total = await db.collection('users').countDocuments(filter);

    res.json({
      users: users.map(formatDoc),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();
    const userId = new ObjectId(id);

    const user = await db.collection('users').findOne(
      { _id: userId },
      { projection: { password: 0 } }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscriptions = await db.collection('user_subscriptions').aggregate([
      { $match: { user_id: userId } },
      {
        $lookup: {
          from: 'subscription_plans',
          localField: 'plan_id',
          foreignField: '_id',
          as: 'plan'
        }
      },
      {
        $addFields: {
          plan_name: { $arrayElemAt: ['$plan.name', 0] },
          price: { $arrayElemAt: ['$plan.price', 0] },
          duration_days: { $arrayElemAt: ['$plan.duration_days', 0] }
        }
      },
      { $sort: { created_at: -1 } }
    ]).toArray();

    const payments = await db.collection('payments').find(
      { user_id: userId },
      { sort: { created_at: -1 }, limit: 10 }
    ).toArray();

    res.json({
      user: formatDoc(user),
      subscriptions: subscriptions.map(formatDoc),
      payments: payments.map(formatDoc)
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== PAYMENTS MANAGEMENT ==========

router.get('/payments', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, method } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = await getDB();

    const filter = {};
    if (status) filter.payment_status = status;
    if (method) filter.payment_method = method;

    const payments = await db.collection('payments').aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $lookup: {
          from: 'user_subscriptions',
          localField: 'subscription_id',
          foreignField: '_id',
          as: 'subscription'
        }
      },
      {
        $lookup: {
          from: 'subscription_plans',
          localField: 'subscription.plan_id',
          foreignField: '_id',
          as: 'plan'
        }
      },
      {
        $addFields: {
          user_name: { $arrayElemAt: ['$user.name', 0] },
          email: { $arrayElemAt: ['$user.email', 0] },
          plan_name: { $arrayElemAt: ['$plan.name', 0] }
        }
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]).toArray();

    const total = await db.collection('payments').countDocuments(filter);

    res.json({
      payments: payments.map(formatDoc),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== SUBSCRIPTION PLANS MANAGEMENT ==========

router.get('/plans', async (req, res) => {
  try {
    const db = await getDB();
    const plans = await db.collection('subscription_plans')
      .find({})
      .sort({ price: 1 })
      .toArray();

    res.json(plans.map(formatDoc));
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/plans', async (req, res) => {
  try {
    const { name, description, price, duration_days, stripe_price_id } = req.body;

    if (!name || !price || !duration_days) {
      return res.status(400).json({ error: 'Name, price, and duration are required' });
    }

    const db = await getDB();
    const result = await db.collection('subscription_plans').insertOne({
      name,
      description: description || null,
      price: parseFloat(price),
      duration_days: parseInt(duration_days),
      stripe_price_id: stripe_price_id || null,
      is_active: true,
      created_at: new Date()
    });

    const plan = await db.collection('subscription_plans').findOne({ _id: result.insertedId });

    res.status(201).json(formatDoc(plan));
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, duration_days, is_active, stripe_price_id } = req.body;
    const db = await getDB();

    const update = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (price !== undefined) update.price = parseFloat(price);
    if (duration_days !== undefined) update.duration_days = parseInt(duration_days);
    if (is_active !== undefined) update.is_active = is_active;
    if (stripe_price_id !== undefined) update.stripe_price_id = stripe_price_id;

    const result = await db.collection('subscription_plans').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.json(formatDoc(result.value));
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();
    const planId = new ObjectId(id);

    const activeSubscriptions = await db.collection('user_subscriptions').countDocuments({
      plan_id: planId,
      status: 'active'
    });

    if (activeSubscriptions > 0) {
      return res.status(400).json({ error: 'Cannot delete plan with active subscriptions' });
    }

    await db.collection('subscription_plans').deleteOne({ _id: planId });
    res.json({ message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== ALBUMS MANAGEMENT ==========

router.get('/albums', async (req, res) => {
  try {
    const { search, artist } = req.query;
    const db = await getDB();

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { artist: { $regex: search, $options: 'i' } }
      ];
    }
    if (artist) {
      filter.artist = { $regex: artist, $options: 'i' };
    }

    const albums = await db.collection('albums').aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'songs',
          localField: '_id',
          foreignField: 'album_id',
          as: 'songs'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'created_by',
          foreignField: '_id',
          as: 'creator'
        }
      },
      {
        $addFields: {
          song_count: { $size: '$songs' },
          created_by_name: { $arrayElemAt: ['$creator.name', 0] }
        }
      },
      { $sort: { created_at: -1 } }
    ]).toArray();

    res.json(albums.map(formatDoc));
  } catch (error) {
    console.error('Get albums error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/albums/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();

    const album = await db.collection('albums').aggregate([
      { $match: { _id: new ObjectId(id) } },
      {
        $lookup: {
          from: 'users',
          localField: 'created_by',
          foreignField: '_id',
          as: 'creator'
        }
      },
      {
        $addFields: {
          created_by_name: { $arrayElemAt: ['$creator.name', 0] }
        }
      }
    ]).toArray();

    if (album.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const songs = await db.collection('songs').find(
      { album_id: new ObjectId(id) },
      { sort: { created_at: 1 } }
    ).toArray();

    res.json({
      album: formatDoc(album[0]),
      songs: songs.map(formatDoc)
    });
  } catch (error) {
    console.error('Get album error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/albums', uploadSongFiles.single('coverImage'), async (req, res) => {
  try {
    const { name, artist, description, release_date, genre } = req.body;

    if (!name || !artist) {
      return res.status(400).json({ error: 'Name and artist are required' });
    }

    const coverImagePath = req.file 
      ? `/uploads/covers/${req.file.filename}` 
      : null;

    const db = await getDB();
    const result = await db.collection('albums').insertOne({
      name,
      artist,
      description: description || null,
      cover_image_path: coverImagePath,
      release_date: release_date ? new Date(release_date) : null,
      genre: genre || null,
      created_by: new ObjectId(req.user.id),
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    });

    const album = await db.collection('albums').findOne({ _id: result.insertedId });

    res.status(201).json(formatDoc(album));
  } catch (error) {
    console.error('Create album error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/albums/:id', uploadSongFiles.single('coverImage'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, artist, description, release_date, genre, is_active } = req.body;
    const db = await getDB();

    const update = { updated_at: new Date() };
    if (name !== undefined) update.name = name;
    if (artist !== undefined) update.artist = artist;
    if (description !== undefined) update.description = description;
    if (release_date !== undefined) update.release_date = release_date ? new Date(release_date) : null;
    if (genre !== undefined) update.genre = genre;
    if (is_active !== undefined) update.is_active = is_active;
    if (req.file) {
      update.cover_image_path = `/uploads/covers/${req.file.filename}`;
    }

    const result = await db.collection('albums').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Album not found' });
    }

    res.json(formatDoc(result.value));
  } catch (error) {
    console.error('Update album error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/albums/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();

    const album = await db.collection('albums').findOne({ _id: new ObjectId(id) });
    
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    if (album.cover_image_path) {
      const coverPath = path.join(__dirname, '..', album.cover_image_path);
      if (fs.existsSync(coverPath)) {
        fs.unlinkSync(coverPath);
      }
    }

    await db.collection('songs').updateMany(
      { album_id: new ObjectId(id) },
      { $set: { album_id: null, updated_at: new Date() } }
    );

    await db.collection('albums').deleteOne({ _id: new ObjectId(id) });

    res.json({ message: 'Album deleted successfully' });
  } catch (error) {
    console.error('Delete album error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/albums/:id/songs', async (req, res) => {
  try {
    const { id } = req.params;
    const { songIds } = req.body;

    if (!songIds || !Array.isArray(songIds) || songIds.length === 0) {
      return res.status(400).json({ error: 'Song IDs array is required' });
    }

    const db = await getDB();
    const objectIds = songIds.map(songId => new ObjectId(songId));

    const result = await db.collection('songs').updateMany(
      { _id: { $in: objectIds } },
      { 
        $set: { 
          album_id: new ObjectId(id),
          updated_at: new Date()
        }
      }
    );

    const updated = await db.collection('songs').find(
      { _id: { $in: objectIds } },
      { projection: { _id: 1, title: 1 } }
    ).toArray();

    res.json({
      message: `${result.modifiedCount} songs added to album`,
      songs: updated.map(formatDoc)
    });
  } catch (error) {
    console.error('Add songs to album error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/albums/:id/songs/:songId', async (req, res) => {
  try {
    const { id, songId } = req.params;
    const db = await getDB();

    await db.collection('songs').updateOne(
      { _id: new ObjectId(songId), album_id: new ObjectId(id) },
      { 
        $set: { 
          album_id: null,
          updated_at: new Date()
        }
      }
    );

    res.json({ message: 'Song removed from album' });
  } catch (error) {
    console.error('Remove song from album error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== PHOTOS MANAGEMENT ==========

router.post('/photos', uploadPhoto.single('photoFile'), async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !req.file) {
      return res.status(400).json({ error: 'Title and photo file are required' });
    }

    const photoFilePath = `/uploads/photos/${req.file.filename}`;
    const db = await getDB();

    const result = await db.collection('photos').insertOne({
      title,
      description: description || null,
      file_path: photoFilePath,
      file_size: req.file.size,
      uploaded_by: new ObjectId(req.user.id),
      is_archived: false,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    });

    const photo = await db.collection('photos').findOne({ _id: result.insertedId });

    res.status(201).json({
      message: 'Photo uploaded successfully',
      photo: formatDoc(photo)
    });
  } catch (error) {
    console.error('Upload photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/photos', async (req, res) => {
  try {
    const { page = 1, limit = 20, archived, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = await getDB();

    const filter = {};
    if (archived !== undefined) {
      filter.is_archived = archived === 'true';
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const photos = await db.collection('photos').aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'users',
          localField: 'uploaded_by',
          foreignField: '_id',
          as: 'uploader'
        }
      },
      {
        $addFields: {
          uploaded_by_name: { $arrayElemAt: ['$uploader.name', 0] }
        }
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]).toArray();

    const total = await db.collection('photos').countDocuments(filter);

    res.json({
      photos: photos.map(formatDoc),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get admin photos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/photos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, is_active, is_archived } = req.body;
    const db = await getDB();

    const update = { updated_at: new Date() };
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (is_active !== undefined) update.is_active = is_active;
    if (is_archived !== undefined) update.is_archived = is_archived;

    const result = await db.collection('photos').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.json({ message: 'Photo updated successfully', photo: formatDoc(result.value) });
  } catch (error) {
    console.error('Update photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/photos/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    const { archived } = req.body;
    const db = await getDB();

    const result = await db.collection('photos').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          is_archived: archived,
          updated_at: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.json({ 
      message: `Photo ${archived ? 'archived' : 'unarchived'} successfully`, 
      photo: formatDoc(result.value) 
    });
  } catch (error) {
    console.error('Archive photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/photos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();

    const photo = await db.collection('photos').findOne({ _id: new ObjectId(id) });
    
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const filePath = path.join(__dirname, '..', photo.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await db.collection('photos').deleteOne({ _id: new ObjectId(id) });

    res.json({ message: 'Photo deleted successfully' });
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/photos/bulk', async (req, res) => {
  try {
    const { photoIds, archived } = req.body;

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({ error: 'Photo IDs array is required' });
    }

    const db = await getDB();
    const objectIds = photoIds.map(id => new ObjectId(id));

    const result = await db.collection('photos').updateMany(
      { _id: { $in: objectIds } },
      { 
        $set: { 
          is_archived: archived,
          updated_at: new Date()
        }
      }
    );

    const updated = await db.collection('photos').find(
      { _id: { $in: objectIds } },
      { projection: { _id: 1, title: 1 } }
    ).toArray();

    res.json({
      message: `${result.modifiedCount} photos ${archived ? 'archived' : 'unarchived'}`,
      photos: updated.map(formatDoc)
    });
  } catch (error) {
    console.error('Bulk archive photos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/photos/bulk', async (req, res) => {
  try {
    const { photoIds } = req.body;

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({ error: 'Photo IDs array is required' });
    }

    const db = await getDB();
    const objectIds = photoIds.map(id => new ObjectId(id));

    const photos = await db.collection('photos').find(
      { _id: { $in: objectIds } },
      { projection: { file_path: 1 } }
    ).toArray();

    photos.forEach(photo => {
      const fullPath = path.join(__dirname, '..', photo.file_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    });

    const deleteResult = await db.collection('photos').deleteMany({ _id: { $in: objectIds } });

    res.json({
      message: `${deleteResult.deletedCount} photos deleted`,
      photos: photos.map(formatDoc)
    });
  } catch (error) {
    console.error('Bulk delete photos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== VIDEOS MANAGEMENT ==========

router.post('/videos', uploadVideo.single('videoFile'), async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !req.file) {
      return res.status(400).json({ error: 'Title and video file are required' });
    }

    const videoFilePath = `/uploads/videos/${req.file.filename}`;
    const db = await getDB();

    const result = await db.collection('videos').insertOne({
      title,
      description: description || null,
      file_path: videoFilePath,
      file_size: req.file.size,
      uploaded_by: new ObjectId(req.user.id),
      is_archived: false,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    });

    const video = await db.collection('videos').findOne({ _id: result.insertedId });

    res.status(201).json({
      message: 'Video uploaded successfully',
      video: formatDoc(video)
    });
  } catch (error) {
    console.error('Upload video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/videos', async (req, res) => {
  try {
    const { page = 1, limit = 20, archived, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = await getDB();

    const filter = {};
    if (archived !== undefined) {
      filter.is_archived = archived === 'true';
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const videos = await db.collection('videos').aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'users',
          localField: 'uploaded_by',
          foreignField: '_id',
          as: 'uploader'
        }
      },
      {
        $addFields: {
          uploaded_by_name: { $arrayElemAt: ['$uploader.name', 0] }
        }
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]).toArray();

    const total = await db.collection('videos').countDocuments(filter);

    res.json({
      videos: videos.map(formatDoc),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get admin videos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, is_active, is_archived } = req.body;
    const db = await getDB();

    const update = { updated_at: new Date() };
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (is_active !== undefined) update.is_active = is_active;
    if (is_archived !== undefined) update.is_archived = is_archived;

    const result = await db.collection('videos').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({ message: 'Video updated successfully', video: formatDoc(result.value) });
  } catch (error) {
    console.error('Update video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/videos/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    const { archived } = req.body;
    const db = await getDB();

    const result = await db.collection('videos').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          is_archived: archived,
          updated_at: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({ 
      message: `Video ${archived ? 'archived' : 'unarchived'} successfully`, 
      video: formatDoc(result.value) 
    });
  } catch (error) {
    console.error('Archive video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();

    const video = await db.collection('videos').findOne({ _id: new ObjectId(id) });
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const filePath = path.join(__dirname, '..', video.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (video.thumbnail_path) {
      const thumbnailPath = path.join(__dirname, '..', video.thumbnail_path);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
    }

    await db.collection('videos').deleteOne({ _id: new ObjectId(id) });

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/videos/bulk', async (req, res) => {
  try {
    const { videoIds, archived } = req.body;

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: 'Video IDs array is required' });
    }

    const db = await getDB();
    const objectIds = videoIds.map(id => new ObjectId(id));

    const result = await db.collection('videos').updateMany(
      { _id: { $in: objectIds } },
      { 
        $set: { 
          is_archived: archived,
          updated_at: new Date()
        }
      }
    );

    const updated = await db.collection('videos').find(
      { _id: { $in: objectIds } },
      { projection: { _id: 1, title: 1 } }
    ).toArray();

    res.json({
      message: `${result.modifiedCount} videos ${archived ? 'archived' : 'unarchived'}`,
      videos: updated.map(formatDoc)
    });
  } catch (error) {
    console.error('Bulk archive videos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/videos/bulk', async (req, res) => {
  try {
    const { videoIds } = req.body;

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: 'Video IDs array is required' });
    }

    const db = await getDB();
    const objectIds = videoIds.map(id => new ObjectId(id));

    const videos = await db.collection('videos').find(
      { _id: { $in: objectIds } },
      { projection: { file_path: 1, thumbnail_path: 1 } }
    ).toArray();

    videos.forEach(video => {
      const fullPath = path.join(__dirname, '..', video.file_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      if (video.thumbnail_path) {
        const thumbnailFullPath = path.join(__dirname, '..', video.thumbnail_path);
        if (fs.existsSync(thumbnailFullPath)) {
          fs.unlinkSync(thumbnailFullPath);
        }
      }
    });

    const deleteResult = await db.collection('videos').deleteMany({ _id: { $in: objectIds } });

    res.json({
      message: `${deleteResult.deletedCount} videos deleted`,
      videos: videos.map(formatDoc)
    });
  } catch (error) {
    console.error('Bulk delete videos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== REACTIONS MANAGEMENT ==========

router.get('/reactions', async (req, res) => {
  try {
    const { page = 1, limit = 50, type, contentType } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = await getDB();

    const validContentTypes = ['song', 'photo', 'video'];
    if (contentType && !validContentTypes.includes(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    let reactions = [];
    const contentFilter = contentType ? { content_type: contentType } : {};

    // Get likes
    if (!type || type === 'like') {
      const likes = await db.collection('likes').aggregate([
        { $match: contentFilter },
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $lookup: {
            from: 'songs',
            localField: 'content_id',
            foreignField: '_id',
            as: 'song',
            pipeline: [{ $match: { $expr: { $eq: ['$content_type', 'song'] } } }]
          }
        },
        {
          $lookup: {
            from: 'photos',
            localField: 'content_id',
            foreignField: '_id',
            as: 'photo',
            pipeline: [{ $match: { $expr: { $eq: ['$content_type', 'photo'] } } }]
          }
        },
        {
          $lookup: {
            from: 'videos',
            localField: 'content_id',
            foreignField: '_id',
            as: 'video',
            pipeline: [{ $match: { $expr: { $eq: ['$content_type', 'video'] } } }]
          }
        },
        {
          $addFields: {
            reaction_type: 'like',
            user_name: { $arrayElemAt: ['$user.name', 0] },
            user_email: { $arrayElemAt: ['$user.email', 0] },
            content_title: {
              $cond: {
                if: { $eq: ['$content_type', 'song'] },
                then: { $arrayElemAt: ['$song.title', 0] },
                else: {
                  $cond: {
                    if: { $eq: ['$content_type', 'photo'] },
                    then: { $arrayElemAt: ['$photo.title', 0] },
                    else: { $arrayElemAt: ['$video.title', 0] }
                  }
                }
              }
            },
            content_artist: {
              $cond: {
                if: { $eq: ['$content_type', 'song'] },
                then: { $arrayElemAt: ['$song.artist', 0] },
                else: null
              }
            }
          }
        },
        { $sort: { created_at: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]).toArray();
      reactions = reactions.concat(likes);
    }

    // Get dislikes
    if (!type || type === 'dislike') {
      const dislikes = await db.collection('dislikes').aggregate([
        { $match: contentFilter },
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $addFields: {
            reaction_type: 'dislike',
            user_name: { $arrayElemAt: ['$user.name', 0] },
            user_email: { $arrayElemAt: ['$user.email', 0] }
          }
        },
        { $sort: { created_at: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]).toArray();
      reactions = reactions.concat(dislikes);
    }

    // Get comments
    if (!type || type === 'comment') {
      const comments = await db.collection('comments').aggregate([
        { $match: contentFilter },
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $addFields: {
            reaction_type: 'comment',
            user_name: { $arrayElemAt: ['$user.name', 0] },
            user_email: { $arrayElemAt: ['$user.email', 0] },
            comment: '$comment_text'
          }
        },
        { $sort: { created_at: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]).toArray();
      reactions = reactions.concat(comments);
    }

    reactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const [likesCount, dislikesCount, commentsCount] = await Promise.all([
      db.collection('likes').countDocuments(contentFilter),
      db.collection('dislikes').countDocuments(contentFilter),
      db.collection('comments').countDocuments(contentFilter)
    ]);

    res.json({
      reactions: reactions.slice(0, parseInt(limit)).map(formatDoc),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: likesCount + dislikesCount + commentsCount,
        totalPages: Math.ceil((likesCount + dislikesCount + commentsCount) / limit)
      },
      summary: {
        likes: likesCount,
        dislikes: dislikesCount,
        comments: commentsCount
      }
    });
  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/reactions/:contentType/:contentId', async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    const db = await getDB();

    const validContentTypes = ['song', 'photo', 'video'];
    if (!validContentTypes.includes(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    const contentIdObj = new ObjectId(contentId);

    const [likes, dislikes, comments] = await Promise.all([
      db.collection('likes').aggregate([
        {
          $match: {
            content_type: contentType,
            content_id: contentIdObj
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $addFields: {
            reaction_type: 'like',
            user_name: { $arrayElemAt: ['$user.name', 0] },
            user_email: { $arrayElemAt: ['$user.email', 0] }
          }
        },
        { $sort: { created_at: -1 } }
      ]).toArray(),
      db.collection('dislikes').aggregate([
        {
          $match: {
            content_type: contentType,
            content_id: contentIdObj
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $addFields: {
            reaction_type: 'dislike',
            user_name: { $arrayElemAt: ['$user.name', 0] },
            user_email: { $arrayElemAt: ['$user.email', 0] }
          }
        },
        { $sort: { created_at: -1 } }
      ]).toArray(),
      db.collection('comments').aggregate([
        {
          $match: {
            content_type: contentType,
            content_id: contentIdObj
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $addFields: {
            reaction_type: 'comment',
            user_name: { $arrayElemAt: ['$user.name', 0] },
            user_email: { $arrayElemAt: ['$user.email', 0] },
            comment: '$comment_text'
          }
        },
        { $sort: { created_at: -1 } }
      ]).toArray()
    ]);

    let content;
    if (contentType === 'song') {
      content = await db.collection('songs').findOne(
        { _id: contentIdObj },
        { projection: { _id: 1, title: 1, artist: 1 } }
      );
    } else if (contentType === 'photo') {
      content = await db.collection('photos').findOne(
        { _id: contentIdObj },
        { projection: { _id: 1, title: 1 } }
      );
    } else {
      content = await db.collection('videos').findOne(
        { _id: contentIdObj },
        { projection: { _id: 1, title: 1 } }
      );
    }

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json({
      content: formatDoc(content),
      reactions: {
        likes: likes.map(formatDoc),
        dislikes: dislikes.map(formatDoc),
        comments: comments.map(formatDoc)
      },
      summary: {
        likes: likes.length,
        dislikes: dislikes.length,
        comments: comments.length
      }
    });
  } catch (error) {
    console.error('Get content reactions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/reactions/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!['like', 'dislike', 'comment'].includes(type)) {
      return res.status(400).json({ error: 'Invalid reaction type' });
    }

    const db = await getDB();
    const collectionName = type === 'comment' ? 'comments' : `${type}s`;

    const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Reaction not found' });
    }

    res.json({ message: `${type} deleted successfully` });
  } catch (error) {
    console.error('Delete reaction error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
