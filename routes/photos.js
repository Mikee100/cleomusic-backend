import express from 'express';
import { getDB } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Get all active photos (free users can browse; frontend will blur images)
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = await getDB();

    const filter = {
      is_active: true,
      is_archived: false
    };

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
      photos: photos.map(photo => {
        // Convert file_id to URL if it exists, otherwise use legacy file_path
        const file_path = photo.file_id 
          ? `/api/files/${photo.file_id}` 
          : (photo.file_path || null);

        return {
          id: photo._id.toString(),
          ...photo,
          _id: undefined,
          file_path: file_path,
          file_id: photo.file_id?.toString()
        };
      }),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get photos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single photo
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();

    const photo = await db.collection('photos').aggregate([
      {
        $match: {
          _id: new ObjectId(id),
          is_active: true,
          is_archived: false
        }
      },
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
      }
    ]).toArray();

    if (photo.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Convert file_id to URL if it exists, otherwise use legacy file_path
    const file_path = photo[0].file_id 
      ? `/api/files/${photo[0].file_id}` 
      : (photo[0].file_path || null);

    res.json({
      photo: {
        id: photo[0]._id.toString(),
        ...photo[0],
        _id: undefined,
        file_path: file_path,
        file_id: photo[0].file_id?.toString()
      }
    });
  } catch (error) {
    console.error('Get photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
