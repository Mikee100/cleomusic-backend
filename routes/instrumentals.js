import express from 'express';
import { getDB } from '../config/database.js';
import { authenticate, requireSubscription } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Helper function to format song document
const formatSong = (song) => ({
  id: song._id.toString(),
  title: song.title,
  artist: song.artist,
  album: song.album,
  genre: song.genre,
  file_path: song.file_path,
  cover_image_path: song.cover_image_path,
  duration: song.duration,
  file_size: song.file_size,
  is_archived: song.is_archived || false,
  is_active: song.is_active !== false,
  uploaded_by: song.uploaded_by?.toString(),
  album_id: song.album_id?.toString(),
  play_count: song.play_count || 0,
  created_at: song.created_at,
  updated_at: song.updated_at,
  favorite_count: song.favorite_count || 0
});

// Get all active instrumentals (requires subscription)
router.get('/', authenticate, requireSubscription, async (req, res) => {
  try {
    const { genre, search, page = 1, limit = 20, sort = 'newest', album_id } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = await getDB();

    // Build filter - instrumentals are songs with type='instrumental'
    const filter = {
      is_active: true,
      is_archived: false,
      type: 'instrumental' // Filter for instrumentals only
    };

    if (genre) {
      filter.genre = genre;
    }

    if (album_id) {
      filter.album_id = new ObjectId(album_id);
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { artist: { $regex: search, $options: 'i' } },
        { album: { $regex: search, $options: 'i' } }
      ];
    }

    // Build aggregation pipeline
    const pipeline = [
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
        $lookup: {
          from: 'user_song_favorites',
          localField: '_id',
          foreignField: 'song_id',
          as: 'favorites'
        }
      },
      {
        $addFields: {
          play_count: { $ifNull: ['$play_count', 0] },
          favorite_count: { $size: '$favorites' }
        }
      }
    ];

    // Add search for album name if search is provided
    if (search) {
      pipeline[0].$match.$or.push({ 'album.name': { $regex: search, $options: 'i' } });
    }

    // Add sorting
    const sortObj = {};
    if (sort === 'popular') {
      sortObj.play_count = -1;
      sortObj.created_at = -1;
    } else if (sort === 'favorites') {
      sortObj.favorite_count = -1;
      sortObj.play_count = -1;
    } else {
      sortObj.created_at = -1;
    }
    pipeline.push({ $sort: sortObj });

    // Get total count
    const countPipeline = [...pipeline];
    const totalResult = await db.collection('songs').aggregate([
      ...countPipeline,
      { $count: 'total' }
    ]).toArray();
    const total = totalResult[0]?.total || 0;

    // Add pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });

    const songs = await db.collection('songs').aggregate(pipeline).toArray();

    res.json({
      instrumentals: songs.map(formatSong),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get instrumentals error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get genres for instrumentals
router.get('/genres', authenticate, requireSubscription, async (req, res) => {
  try {
    const db = await getDB();
    const genres = await db.collection('songs').distinct('genre', {
      is_active: true,
      is_archived: false,
      type: 'instrumental',
      genre: { $ne: null }
    });
    res.json({ genres: genres.sort() });
  } catch (error) {
    console.error('Get instrumental genres error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

