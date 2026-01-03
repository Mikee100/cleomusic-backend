import express from 'express';
import { getDB } from '../config/database.js';
import { authenticate, requireSubscription } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Get all active videos (requires subscription)
router.get('/', authenticate, requireSubscription, async (req, res) => {
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
      videos: videos.map(video => {
        // Convert file_id to URL if it exists, otherwise use legacy file_path
        const file_path = video.file_id 
          ? `/api/files/${video.file_id}` 
          : (video.file_path || null);

        return {
          id: video._id.toString(),
          ...video,
          _id: undefined,
          file_path: file_path,
          file_id: video.file_id?.toString()
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
    console.error('Get videos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single video
router.get('/:id', authenticate, requireSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();

    const video = await db.collection('videos').aggregate([
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

    if (video.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Convert file_id to URL if it exists, otherwise use legacy file_path
    const file_path = video[0].file_id 
      ? `/api/files/${video[0].file_id}` 
      : (video[0].file_path || null);

    res.json({
      video: {
        id: video[0]._id.toString(),
        ...video[0],
        _id: undefined,
        file_path: file_path,
        file_id: video[0].file_id?.toString()
      }
    });
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
