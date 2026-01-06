import express from 'express';
import { getDB } from '../config/database.js';
import { authenticate, requireSubscription } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Helper function to format song document
const formatSong = (song) => {
  // Convert file_id to URL if it exists, otherwise use legacy file_path
  const file_path = song.file_id 
    ? `/api/files/${song.file_id}` 
    : (song.file_path || null);
  
  const cover_image_path = song.cover_image_id 
    ? `/api/files/${song.cover_image_id}` 
    : (song.cover_image_path || null);

  return {
    id: song._id.toString(),
    title: song.title,
    artist: song.artist,
    album: song.album,
    genre: song.genre,
    file_path: file_path,
    cover_image_path: cover_image_path,
    file_id: song.file_id?.toString(),
    cover_image_id: song.cover_image_id?.toString(),
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
  };
};

// Get all active songs (free users can browse, but will get interrupted when playing)
router.get('/', authenticate, async (req, res) => {
  try {
    const { genre, search, page = 1, limit = 20, sort = 'newest', album_id } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = await getDB();

    // Build filter
    const filter = {
      is_active: true,
      is_archived: false
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

    // Project final fields
    pipeline.push({
      $project: {
        _id: 1,
        title: 1,
        artist: 1,
        album: { $ifNull: ['$album', null] },
        genre: 1,
        file_path: 1,
        cover_image_path: 1,
        duration: 1,
        file_size: 1,
        is_archived: 1,
        is_active: 1,
        uploaded_by: 1,
        album_id: 1,
        play_count: 1,
        favorite_count: 1,
        created_at: 1,
        updated_at: 1
      }
    });

    const songs = await db.collection('songs').aggregate(pipeline).toArray();

    const formattedSongs = songs.map(song => ({
      ...formatSong(song),
      album: song.album?.[0]?.name || song.album
    }));

    res.json({
      songs: formattedSongs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get songs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get meta genres (must be before /:id route)
router.get('/meta/genres', authenticate, async (req, res) => {
  try {
    const db = await getDB();
    const genres = await db.collection('songs')
      .distinct('genre', {
        genre: { $ne: null, $ne: '' },
        is_active: true
      });
    
    res.json(genres.sort());
  } catch (error) {
    console.error('Get genres error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get most popular songs (free users can browse, but will get interrupted when playing)
router.get('/popular', authenticate, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const db = await getDB();

    const songs = await db.collection('songs').aggregate([
      {
        $match: {
          is_active: true,
          is_archived: false
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
      },
      {
        $sort: { play_count: -1, created_at: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]).toArray();

    res.json({ songs: songs.map(formatSong) });
  } catch (error) {
    console.error('Get popular songs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get recently played songs for user (must be before /:id route)
router.get('/recent/played', authenticate, requireSubscription, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const userId = new ObjectId(req.user.id);
    const db = await getDB();

    const songs = await db.collection('song_plays').aggregate([
      {
        $match: { user_id: userId }
      },
      {
        $sort: { played_at: -1 }
      },
      {
        $group: {
          _id: '$song_id',
          played_at: { $first: '$played_at' }
        }
      },
      {
        $lookup: {
          from: 'songs',
          localField: '_id',
          foreignField: '_id',
          as: 'song'
        }
      },
      {
        $unwind: '$song'
      },
      {
        $match: {
          'song.is_active': true,
          'song.is_archived': false
        }
      },
      {
        $addFields: {
          'song.play_count': { $ifNull: ['$song.play_count', 0] },
          'song.played_at': '$played_at'
        }
      },
      {
        $sort: { played_at: -1 }
      },
      {
        $limit: parseInt(limit)
      },
      {
        $replaceRoot: { newRoot: '$song' }
      }
    ]).toArray();

    res.json({ songs: songs.map(formatSong) });
  } catch (error) {
    console.error('Get recently played error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's favorite songs (must be before /:id route)
router.get('/favorites', authenticate, requireSubscription, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);
    const db = await getDB();

    const songs = await db.collection('user_song_favorites').aggregate([
      {
        $match: { user_id: userId }
      },
      {
        $lookup: {
          from: 'songs',
          localField: 'song_id',
          foreignField: '_id',
          as: 'song'
        }
      },
      {
        $unwind: '$song'
      },
      {
        $match: {
          'song.is_active': true,
          'song.is_archived': false
        }
      },
      {
        $addFields: {
          'song.play_count': { $ifNull: ['$song.play_count', 0] },
          'song.favorited_at': '$created_at'
        }
      },
      {
        $sort: { created_at: -1 }
      },
      {
        $replaceRoot: { newRoot: '$song' }
      }
    ]).toArray();

    res.json({ songs: songs.map(formatSong) });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single song (requires subscription) - must be after specific routes
router.get('/:id', authenticate, requireSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();

    const song = await db.collection('songs').findOne({
      _id: new ObjectId(id),
      is_active: true,
      is_archived: false
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    res.json(formatSong(song));
  } catch (error) {
    console.error('Get song error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Track song play
router.post('/:id/play', authenticate, requireSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    const songId = new ObjectId(id);
    const userId = new ObjectId(req.user.id);
    const db = await getDB();

    // Verify song exists and is active
    const song = await db.collection('songs').findOne({
      _id: songId,
      is_active: true,
      is_archived: false
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Record play event
    await db.collection('song_plays').insertOne({
      song_id: songId,
      user_id: userId,
      played_at: new Date()
    });

    // Increment play count
    await db.collection('songs').updateOne(
      { _id: songId },
      { $inc: { play_count: 1 } }
    );

    res.json({ message: 'Play tracked successfully' });
  } catch (error) {
    console.error('Track play error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle favorite
router.post('/:id/favorite', authenticate, requireSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    const songId = new ObjectId(id);
    const userId = new ObjectId(req.user.id);
    const db = await getDB();

    // Check if already favorited
    const existing = await db.collection('user_song_favorites').findOne({
      user_id: userId,
      song_id: songId
    });

    if (existing) {
      // Remove favorite
      await db.collection('user_song_favorites').deleteOne({
        user_id: userId,
        song_id: songId
      });
      res.json({ favorited: false, message: 'Removed from favorites' });
    } else {
      // Add favorite
      await db.collection('user_song_favorites').insertOne({
        user_id: userId,
        song_id: songId,
        created_at: new Date()
      });
      res.json({ favorited: true, message: 'Added to favorites' });
    }
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if song is favorited by user
router.get('/:id/favorite', authenticate, requireSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    const songId = new ObjectId(id);
    const userId = new ObjectId(req.user.id);
    const db = await getDB();

    const result = await db.collection('user_song_favorites').findOne({
      user_id: userId,
      song_id: songId
    });

    res.json({ favorited: !!result });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
