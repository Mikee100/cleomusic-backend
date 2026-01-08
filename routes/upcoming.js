import express from 'express';
import { getDB } from '../config/database.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';
import { uploadCover } from '../middleware/upload.js';
import { uploadFile } from '../utils/gridfs.js';

const router = express.Router();

// Helper function to format upcoming release document
const formatUpcoming = (item) => {
  const cover_image_path = item.cover_image_id 
    ? `/api/files/${item.cover_image_id}` 
    : (item.cover_image_path || null);

  return {
    id: item._id.toString(),
    type: item.type, // 'song' or 'album'
    title: item.title || item.name,
    name: item.name || item.title,
    artist: item.artist,
    description: item.description,
    cover_image_path: cover_image_path,
    cover_image_id: item.cover_image_id?.toString(),
    release_date: item.release_date,
    is_active: item.is_active !== false,
    created_at: item.created_at,
    updated_at: item.updated_at
  };
};

// ========== USER ROUTES ==========

// Get all active upcoming releases (for users)
router.get('/', authenticate, async (req, res) => {
  try {
    const db = await getDB();
    const now = new Date();

    const upcoming = await db.collection('upcoming_releases')
      .find({
        is_active: true,
        release_date: { $gte: now }
      })
      .sort({ release_date: 1 })
      .toArray();

    res.json({
      upcoming: upcoming.map(formatUpcoming)
    });
  } catch (error) {
    console.error('Get upcoming releases error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== ADMIN ROUTES ==========

// Get all upcoming releases (admin - includes inactive)
router.get('/admin', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const { type, search } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { artist: { $regex: search, $options: 'i' } }
      ];
    }

    const upcoming = await db.collection('upcoming_releases')
      .find(filter)
      .sort({ release_date: 1 })
      .toArray();

    res.json({
      upcoming: upcoming.map(formatUpcoming)
    });
  } catch (error) {
    console.error('Get upcoming releases (admin) error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create upcoming release
router.post('/admin', authenticate, requireAdmin, uploadCover.single('coverImage'), async (req, res) => {
  try {
    const db = await getDB();
    const { type, title, name, artist, description, release_date, is_active } = req.body;
    const coverFile = req.file;

    if (!type || !['song', 'album'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "song" or "album"' });
    }

    if (!title && !name) {
      return res.status(400).json({ error: 'Title or name is required' });
    }

    if (!artist) {
      return res.status(400).json({ error: 'Artist is required' });
    }

    if (!release_date) {
      return res.status(400).json({ error: 'Release date is required' });
    }

    // Upload cover image to GridFS if provided
    let coverImageId = null;
    if (coverFile) {
      coverImageId = await uploadFile(coverFile, { type: 'cover' });
    }

    const upcomingData = {
      type,
      title: title || name,
      name: name || title,
      artist,
      description: description || '',
      release_date: new Date(release_date),
      cover_image_path: null,
      cover_image_id: coverImageId ? new ObjectId(coverImageId) : null,
      is_active: is_active === 'true' || is_active === true,
      created_at: new Date(),
      updated_at: new Date()
    };

    const result = await db.collection('upcoming_releases').insertOne(upcomingData);

    res.status(201).json({
      upcoming: formatUpcoming({ ...upcomingData, _id: result.insertedId })
    });
  } catch (error) {
    console.error('Create upcoming release error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update upcoming release
router.put('/admin/:id', authenticate, requireAdmin, uploadCover.single('coverImage'), async (req, res) => {
  try {
    const db = await getDB();
    const { id } = req.params;
    const { type, title, name, artist, description, release_date, is_active } = req.body;
    const coverFile = req.file;

    const updateData = {
      updated_at: new Date()
    };

    if (type) {
      if (!['song', 'album'].includes(type)) {
        return res.status(400).json({ error: 'Type must be "song" or "album"' });
      }
      updateData.type = type;
    }

    if (title !== undefined) updateData.title = title;
    if (name !== undefined) updateData.name = name;
    if (title || name) {
      updateData.title = title || updateData.name;
      updateData.name = name || updateData.title;
    }
    if (artist !== undefined) updateData.artist = artist;
    if (description !== undefined) updateData.description = description;
    if (release_date !== undefined) updateData.release_date = new Date(release_date);
    if (is_active !== undefined) {
      updateData.is_active = is_active === 'true' || is_active === true;
    }

    // Handle cover image upload if provided
    if (coverFile) {
      const coverImageId = await uploadFile(coverFile, { type: 'cover' });
      updateData.cover_image_id = new ObjectId(coverImageId);
      updateData.cover_image_path = null; // Clear legacy path
    }

    const result = await db.collection('upcoming_releases').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Upcoming release not found' });
    }

    const updated = await db.collection('upcoming_releases').findOne({ _id: new ObjectId(id) });
    res.json({
      upcoming: formatUpcoming(updated)
    });
  } catch (error) {
    console.error('Update upcoming release error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete upcoming release
router.delete('/admin/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const { id } = req.params;

    const result = await db.collection('upcoming_releases').deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Upcoming release not found' });
    }

    res.json({ message: 'Upcoming release deleted successfully' });
  } catch (error) {
    console.error('Delete upcoming release error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

