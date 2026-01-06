import express from 'express';
import { getDB } from '../config/database.js';
import { authenticate, requireSubscription } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

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

