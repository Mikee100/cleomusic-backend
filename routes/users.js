import express from 'express';
import bcrypt from 'bcryptjs';
import { getDB } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Get current user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const db = await getDB();
    const userId = new ObjectId(req.user.id);

    const user = await db.collection('users').findOne(
      { _id: userId },
      { projection: { password: 0 } }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role || 'user',
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update current user profile
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name && !password) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const db = await getDB();
    const userId = new ObjectId(req.user.id);

    const updateFields = { updated_at: new Date() };

    if (name) {
      updateFields.name = name.trim();
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.password = hashedPassword;
    }

    const result = await db.collection('users').findOneAndUpdate(
      { _id: userId },
      { $set: updateFields },
      { returnDocument: 'after', projection: { password: 0 } }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: result.value._id.toString(),
        email: result.value.email,
        name: result.value.name,
        role: result.value.role || 'user',
        created_at: result.value.created_at,
        updated_at: result.value.updated_at
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user statistics (free users can see their stats)
router.get('/stats', authenticate, async (req, res) => {
  try {
    const db = await getDB();
    const userId = new ObjectId(req.user.id);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalPlaylists,
      totalFavorites,
      recentPlays,
      totalPlays,
      playlistsWithSongs,
      favoriteSongs
    ] = await Promise.all([
      // Total playlists count
      db.collection('playlists').countDocuments({ user_id: userId }),
      // Total favorites count
      db.collection('user_song_favorites').countDocuments({ user_id: userId }),
      // Recent plays (last 30 days)
      db.collection('song_plays').countDocuments({
        user_id: userId,
        played_at: { $gte: thirtyDaysAgo }
      }),
      // Total plays
      db.collection('song_plays').countDocuments({ user_id: userId }),
      // Playlists with songs
      db.collection('playlists').find({
        user_id: userId,
        songs: { $exists: true, $ne: [] }
      })
      .project({ _id: 1, name: 1, songs: 1, updated_at: 1 })
      .sort({ updated_at: -1 })
      .limit(5)
      .toArray(),
      // Favorite songs (limited)
      db.collection('user_song_favorites').aggregate([
        { $match: { user_id: userId } },
        { $lookup: {
          from: 'songs',
          localField: 'song_id',
          foreignField: '_id',
          as: 'song'
        }},
        { $unwind: '$song' },
        { $match: { 'song.is_active': true, 'song.is_archived': false } },
        { $project: {
          song_id: 1,
          song: {
            _id: 1,
            title: 1,
            artist: 1,
            cover_image_path: 1,
            play_count: 1
          },
          favorited_at: 1
        }},
        { $sort: { favorited_at: -1 } },
        { $limit: 10 }
      ]).toArray()
    ]);

    // Format playlists
    const formattedPlaylists = playlistsWithSongs.map(playlist => ({
      id: playlist._id.toString(),
      name: playlist.name,
      song_count: playlist.songs?.length || 0,
      updated_at: playlist.updated_at
    }));

    // Format favorite songs
    const formattedFavorites = favoriteSongs.map(fav => ({
      id: fav.song._id.toString(),
      title: fav.song.title,
      artist: fav.song.artist,
      cover_image_path: fav.song.cover_image_path,
      play_count: fav.song.play_count || 0
    }));

    // Get most played songs
    const mostPlayed = await db.collection('song_plays').aggregate([
      { $match: { user_id: userId } },
      { $group: {
        _id: '$song_id',
        play_count: { $sum: 1 },
        last_played: { $max: '$played_at' }
      }},
      { $sort: { play_count: -1 } },
      { $limit: 10 },
      { $lookup: {
        from: 'songs',
        localField: '_id',
        foreignField: '_id',
        as: 'song'
      }},
      { $unwind: '$song' },
      { $match: { 'song.is_active': true, 'song.is_archived': false } },
      { $project: {
        song_id: '$_id',
        play_count: 1,
        last_played: 1,
        title: '$song.title',
        artist: '$song.artist',
        cover_image_path: '$song.cover_image_path'
      }}
    ]).toArray();

    const formattedMostPlayed = mostPlayed.map(item => ({
      id: item.song_id.toString(),
      title: item.title,
      artist: item.artist,
      cover_image_path: item.cover_image_path,
      play_count: item.play_count,
      last_played: item.last_played
    }));

    res.json({
      playlists: {
        total: totalPlaylists,
        recent: formattedPlaylists
      },
      favorites: {
        total: totalFavorites,
        recent: formattedFavorites.slice(0, 6)
      },
      listening: {
        total_plays: totalPlays,
        plays_last_30_days: recentPlays,
        most_played: formattedMostPlayed
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

