import express from 'express';
import { getDB } from '../config/database.js';
import { authenticate, requireSubscription } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Helper function to format album document
const formatAlbum = (album) => {
  // Convert cover_image_id to URL if it exists, otherwise use legacy cover_image_path
  const cover_image_path = album.cover_image_id 
    ? `/api/files/${album.cover_image_id}` 
    : (album.cover_image_path || null);

  return {
    id: album._id.toString(),
    name: album.name,
    artist: album.artist,
    description: album.description,
    cover_image_path: cover_image_path,
    cover_image_id: album.cover_image_id?.toString(),
    release_date: album.release_date,
    genre: album.genre,
    is_active: album.is_active !== false,
    created_at: album.created_at,
    updated_at: album.updated_at,
    song_count: album.song_count || 0
  };
};

// Get all active albums (requires subscription)
router.get('/', authenticate, requireSubscription, async (req, res) => {
  try {
    const { search, artist, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = await getDB();

    const filter = {
      is_active: true
    };

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
        $addFields: {
          song_count: { $size: '$songs' }
        }
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]).toArray();

    const total = await db.collection('albums').countDocuments(filter);

    res.json({
      albums: albums.map(formatAlbum),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get albums error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single album with songs (requires subscription)
router.get('/:id', authenticate, requireSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();

    const album = await db.collection('albums').aggregate([
      {
        $match: {
          _id: new ObjectId(id),
          is_active: true
        }
      },
      {
        $lookup: {
          from: 'songs',
          localField: '_id',
          foreignField: 'album_id',
          as: 'songs'
        }
      },
      {
        $addFields: {
          song_count: { $size: '$songs' }
        }
      }
    ]).toArray();

    if (album.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Get songs for the album
    const songs = await db.collection('songs').find(
      {
        album_id: new ObjectId(id),
        is_active: true,
        is_archived: false
      },
      { sort: { created_at: 1 } }
    ).toArray();

    res.json({
      album: formatAlbum(album[0]),
      songs: songs.map(song => ({
        id: song._id.toString(),
        title: song.title,
        artist: song.artist,
        album: song.album,
        genre: song.genre,
        file_path: song.file_path,
        cover_image_path: song.cover_image_path,
        duration: song.duration,
        play_count: song.play_count || 0,
        created_at: song.created_at
      }))
    });
  } catch (error) {
    console.error('Get album error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

