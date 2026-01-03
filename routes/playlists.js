import express from 'express';
import { getDB } from '../config/database.js';
import { authenticate, requireSubscription } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Helper function to format playlist document
const formatPlaylist = (playlist) => ({
  id: playlist._id.toString(),
  name: playlist.name,
  description: playlist.description || null,
  user_id: playlist.user_id.toString(),
  songs: playlist.songs || [],
  song_count: playlist.songs?.length || 0,
  created_at: playlist.created_at,
  updated_at: playlist.updated_at
});

// Helper function to format playlist with full song details
const formatPlaylistWithSongs = async (playlist) => {
  const db = await getDB();
  const songIds = (playlist.songs || []).map(id => new ObjectId(id));
  
  const songs = await db.collection('songs').find({
    _id: { $in: songIds },
    is_active: true,
    is_archived: false
  }).toArray();

  // Create a map for quick lookup
  const songMap = new Map(songs.map(song => [song._id.toString(), song]));
  
  // Maintain order from playlist.songs array
  const orderedSongs = (playlist.songs || [])
    .map(id => {
      const song = songMap.get(id.toString());
      if (!song) return null;
      return {
        id: song._id.toString(),
        title: song.title,
        artist: song.artist,
        album: song.album,
        genre: song.genre,
        file_path: song.file_path,
        cover_image_path: song.cover_image_path,
        duration: song.duration,
        file_size: song.file_size,
        play_count: song.play_count || 0,
        favorite_count: song.favorite_count || 0,
        created_at: song.created_at
      };
    })
    .filter(Boolean);

  return {
    id: playlist._id.toString(),
    name: playlist.name,
    description: playlist.description || null,
    user_id: playlist.user_id.toString(),
    songs: orderedSongs,
    song_count: orderedSongs.length,
    created_at: playlist.created_at,
    updated_at: playlist.updated_at
  };
};

// Get all playlists for the current user
router.get('/', authenticate, requireSubscription, async (req, res) => {
  try {
    const db = await getDB();
    const userId = new ObjectId(req.user.id);

    const playlists = await db.collection('playlists')
      .find({ user_id: userId })
      .sort({ updated_at: -1 })
      .toArray();

    const formattedPlaylists = playlists.map(formatPlaylist);

    res.json({ playlists: formattedPlaylists });
  } catch (error) {
    console.error('Get playlists error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a single playlist with full song details
router.get('/:id', authenticate, requireSubscription, async (req, res) => {
  try {
    const db = await getDB();
    const userId = new ObjectId(req.user.id);
    const playlistId = new ObjectId(req.params.id);

    const playlist = await db.collection('playlists').findOne({
      _id: playlistId,
      user_id: userId
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const formattedPlaylist = await formatPlaylistWithSongs(playlist);
    res.json({ playlist: formattedPlaylist });
  } catch (error) {
    console.error('Get playlist error:', error);
    if (error.name === 'BSONError' || error.message.includes('ObjectId')) {
      return res.status(400).json({ error: 'Invalid playlist ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new playlist
router.post('/', authenticate, requireSubscription, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    if (name.length > 200) {
      return res.status(400).json({ error: 'Playlist name must be 200 characters or less' });
    }

    const db = await getDB();
    const userId = new ObjectId(req.user.id);

    // Check if playlist with same name exists for user
    const existingPlaylist = await db.collection('playlists').findOne({
      user_id: userId,
      name: name.trim()
    });

    if (existingPlaylist) {
      return res.status(400).json({ error: 'A playlist with this name already exists' });
    }

    const now = new Date();
    const result = await db.collection('playlists').insertOne({
      user_id: userId,
      name: name.trim(),
      description: description?.trim() || null,
      songs: [],
      created_at: now,
      updated_at: now
    });

    const playlist = await db.collection('playlists').findOne({ _id: result.insertedId });
    const formattedPlaylist = formatPlaylist(playlist);

    res.status(201).json({
      message: 'Playlist created successfully',
      playlist: formattedPlaylist
    });
  } catch (error) {
    console.error('Create playlist error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a playlist (name and description)
router.put('/:id', authenticate, requireSubscription, async (req, res) => {
  try {
    const { name, description } = req.body;
    const db = await getDB();
    const userId = new ObjectId(req.user.id);
    const playlistId = new ObjectId(req.params.id);

    // Check if playlist exists and belongs to user
    const playlist = await db.collection('playlists').findOne({
      _id: playlistId,
      user_id: userId
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const updateData = { updated_at: new Date() };
    
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Playlist name cannot be empty' });
      }
      if (name.length > 200) {
        return res.status(400).json({ error: 'Playlist name must be 200 characters or less' });
      }
      
      // Check if another playlist with same name exists
      const existingPlaylist = await db.collection('playlists').findOne({
        user_id: userId,
        name: name.trim(),
        _id: { $ne: playlistId }
      });

      if (existingPlaylist) {
        return res.status(400).json({ error: 'A playlist with this name already exists' });
      }

      updateData.name = name.trim();
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    await db.collection('playlists').updateOne(
      { _id: playlistId, user_id: userId },
      { $set: updateData }
    );

    const updatedPlaylist = await db.collection('playlists').findOne({ _id: playlistId });
    const formattedPlaylist = formatPlaylist(updatedPlaylist);

    res.json({
      message: 'Playlist updated successfully',
      playlist: formattedPlaylist
    });
  } catch (error) {
    console.error('Update playlist error:', error);
    if (error.name === 'BSONError' || error.message.includes('ObjectId')) {
      return res.status(400).json({ error: 'Invalid playlist ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a playlist
router.delete('/:id', authenticate, requireSubscription, async (req, res) => {
  try {
    const db = await getDB();
    const userId = new ObjectId(req.user.id);
    const playlistId = new ObjectId(req.params.id);

    const result = await db.collection('playlists').deleteOne({
      _id: playlistId,
      user_id: userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    res.json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('Delete playlist error:', error);
    if (error.name === 'BSONError' || error.message.includes('ObjectId')) {
      return res.status(400).json({ error: 'Invalid playlist ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Add a song to a playlist
router.post('/:id/songs', authenticate, requireSubscription, async (req, res) => {
  try {
    const { songId } = req.body;
    const db = await getDB();
    const userId = new ObjectId(req.user.id);
    const playlistId = new ObjectId(req.params.id);

    if (!songId) {
      return res.status(400).json({ error: 'Song ID is required' });
    }

    // Check if playlist exists and belongs to user
    const playlist = await db.collection('playlists').findOne({
      _id: playlistId,
      user_id: userId
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Check if song exists and is active
    const song = await db.collection('songs').findOne({
      _id: new ObjectId(songId),
      is_active: true,
      is_archived: false
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Check if song is already in playlist
    const songObjectId = new ObjectId(songId);
    const songIds = (playlist.songs || []).map(id => id.toString());
    
    if (songIds.includes(songId)) {
      return res.status(400).json({ error: 'Song is already in the playlist' });
    }

    // Add song to playlist
    await db.collection('playlists').updateOne(
      { _id: playlistId, user_id: userId },
      {
        $push: { songs: songObjectId },
        $set: { updated_at: new Date() }
      }
    );

    const updatedPlaylist = await db.collection('playlists').findOne({ _id: playlistId });
    const formattedPlaylist = await formatPlaylistWithSongs(updatedPlaylist);

    res.json({
      message: 'Song added to playlist successfully',
      playlist: formattedPlaylist
    });
  } catch (error) {
    console.error('Add song to playlist error:', error);
    if (error.name === 'BSONError' || error.message.includes('ObjectId')) {
      return res.status(400).json({ error: 'Invalid playlist or song ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove a song from a playlist
router.delete('/:id/songs/:songId', authenticate, requireSubscription, async (req, res) => {
  try {
    const db = await getDB();
    const userId = new ObjectId(req.user.id);
    const playlistId = new ObjectId(req.params.id);
    const songId = new ObjectId(req.params.songId);

    // Check if playlist exists and belongs to user
    const playlist = await db.collection('playlists').findOne({
      _id: playlistId,
      user_id: userId
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Remove song from playlist
    const result = await db.collection('playlists').updateOne(
      { _id: playlistId, user_id: userId },
      {
        $pull: { songs: songId },
        $set: { updated_at: new Date() }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const updatedPlaylist = await db.collection('playlists').findOne({ _id: playlistId });
    const formattedPlaylist = await formatPlaylistWithSongs(updatedPlaylist);

    res.json({
      message: 'Song removed from playlist successfully',
      playlist: formattedPlaylist
    });
  } catch (error) {
    console.error('Remove song from playlist error:', error);
    if (error.name === 'BSONError' || error.message.includes('ObjectId')) {
      return res.status(400).json({ error: 'Invalid playlist or song ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Reorder songs in a playlist
router.put('/:id/songs/reorder', authenticate, requireSubscription, async (req, res) => {
  try {
    const { songIds } = req.body;
    const db = await getDB();
    const userId = new ObjectId(req.user.id);
    const playlistId = new ObjectId(req.params.id);

    if (!Array.isArray(songIds)) {
      return res.status(400).json({ error: 'songIds must be an array' });
    }

    // Check if playlist exists and belongs to user
    const playlist = await db.collection('playlists').findOne({
      _id: playlistId,
      user_id: userId
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Validate that all song IDs are valid ObjectIds and exist in the playlist
    const currentSongIds = (playlist.songs || []).map(id => id.toString());
    const newSongIds = songIds.map(id => id.toString());

    // Check if all new song IDs exist in current playlist
    const allExist = newSongIds.every(id => currentSongIds.includes(id));
    const sameCount = newSongIds.length === currentSongIds.length;

    if (!allExist || !sameCount) {
      return res.status(400).json({ error: 'Invalid song IDs provided' });
    }

    // Convert to ObjectIds
    const reorderedSongIds = songIds.map(id => new ObjectId(id));

    // Update playlist with new song order
    await db.collection('playlists').updateOne(
      { _id: playlistId, user_id: userId },
      {
        $set: {
          songs: reorderedSongIds,
          updated_at: new Date()
        }
      }
    );

    const updatedPlaylist = await db.collection('playlists').findOne({ _id: playlistId });
    const formattedPlaylist = await formatPlaylistWithSongs(updatedPlaylist);

    res.json({
      message: 'Playlist songs reordered successfully',
      playlist: formattedPlaylist
    });
  } catch (error) {
    console.error('Reorder playlist songs error:', error);
    if (error.name === 'BSONError' || error.message.includes('ObjectId')) {
      return res.status(400).json({ error: 'Invalid playlist or song ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

