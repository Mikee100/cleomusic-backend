import express from 'express';
import { getDB } from '../config/database.js';
import { authenticate, requireSubscription } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Helper function to validate content type
const isValidContentType = (type) => ['photo', 'song', 'video'].includes(type);

// Helper function to check if content exists
const checkContentExists = async (contentType, contentId) => {
  const db = await getDB();
  let collectionName;
  switch (contentType) {
    case 'photo':
      collectionName = 'photos';
      break;
    case 'song':
      collectionName = 'songs';
      break;
    case 'video':
      collectionName = 'videos';
      break;
    default:
      return false;
  }

  const content = await db.collection(collectionName).findOne({
    _id: new ObjectId(contentId),
    is_active: true,
    is_archived: false
  });
  return !!content;
};

// ========== COMMENTS ==========

// Get comments for a content item
router.get('/:contentType/:contentId/comments', authenticate, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;

    if (!isValidContentType(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    if (!(await checkContentExists(contentType, contentId))) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const db = await getDB();
    const comments = await db.collection('comments').aggregate([
      {
        $match: {
          content_type: contentType,
          content_id: new ObjectId(contentId)
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
          user_name: { $arrayElemAt: ['$user.name', 0] },
          user_email: { $arrayElemAt: ['$user.email', 0] }
        }
      },
      { $sort: { created_at: -1 } }
    ]).toArray();

    res.json({
      comments: comments.map(comment => ({
        id: comment._id.toString(),
        ...comment,
        _id: undefined
      }))
    });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add a comment
router.post('/:contentType/:contentId/comments', authenticate, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    const { comment_text } = req.body;
    const userId = new ObjectId(req.user.id);

    if (!isValidContentType(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    if (!comment_text || comment_text.trim().length === 0) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    if (!(await checkContentExists(contentType, contentId))) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const db = await getDB();
    const result = await db.collection('comments').insertOne({
      content_type: contentType,
      content_id: new ObjectId(contentId),
      user_id: userId,
      comment_text: comment_text.trim(),
      created_at: new Date()
    });

    const user = await db.collection('users').findOne(
      { _id: userId },
      { projection: { name: 1, email: 1 } }
    );

    const comment = await db.collection('comments').findOne({ _id: result.insertedId });

    res.status(201).json({
      comment: {
        id: comment._id.toString(),
        ...comment,
        user_name: user.name,
        user_email: user.email,
        _id: undefined
      }
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a comment (only by the user who created it or admin)
router.delete('/comments/:commentId', authenticate, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = new ObjectId(req.user.id);
    const isAdmin = req.user.role === 'admin';

    const db = await getDB();
    const comment = await db.collection('comments').findOne({ _id: new ObjectId(commentId) });

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (!isAdmin && !comment.user_id.equals(userId)) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    await db.collection('comments').deleteOne({ _id: new ObjectId(commentId) });

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== LIKES ==========

// Get like count and check if user has liked
router.get('/:contentType/:contentId/likes', authenticate, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    const userId = new ObjectId(req.user.id);

    if (!isValidContentType(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    if (!(await checkContentExists(contentType, contentId))) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const db = await getDB();
    const contentIdObj = new ObjectId(contentId);

    const [count, userLike] = await Promise.all([
      db.collection('likes').countDocuments({
        content_type: contentType,
        content_id: contentIdObj
      }),
      db.collection('likes').findOne({
        content_type: contentType,
        content_id: contentIdObj,
        user_id: userId
      })
    ]);

    res.json({
      count,
      liked: !!userLike
    });
  } catch (error) {
    console.error('Get likes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle like
router.post('/:contentType/:contentId/likes', authenticate, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    const userId = new ObjectId(req.user.id);

    if (!isValidContentType(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    if (!(await checkContentExists(contentType, contentId))) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const db = await getDB();
    const contentIdObj = new ObjectId(contentId);

    // Check if already liked
    const existing = await db.collection('likes').findOne({
      content_type: contentType,
      content_id: contentIdObj,
      user_id: userId
    });

    // If user has disliked, remove the dislike first
    await db.collection('dislikes').deleteOne({
      content_type: contentType,
      content_id: contentIdObj,
      user_id: userId
    });

    if (existing) {
      // Remove like
      await db.collection('likes').deleteOne({
        content_type: contentType,
        content_id: contentIdObj,
        user_id: userId
      });
      res.json({ liked: false, message: 'Like removed' });
    } else {
      // Add like
      await db.collection('likes').insertOne({
        content_type: contentType,
        content_id: contentIdObj,
        user_id: userId,
        created_at: new Date()
      });
      res.json({ liked: true, message: 'Liked' });
    }
  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== DISLIKES ==========

// Get dislike count and check if user has disliked
router.get('/:contentType/:contentId/dislikes', authenticate, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    const userId = new ObjectId(req.user.id);

    if (!isValidContentType(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    if (!(await checkContentExists(contentType, contentId))) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const db = await getDB();
    const contentIdObj = new ObjectId(contentId);

    const [count, userDislike] = await Promise.all([
      db.collection('dislikes').countDocuments({
        content_type: contentType,
        content_id: contentIdObj
      }),
      db.collection('dislikes').findOne({
        content_type: contentType,
        content_id: contentIdObj,
        user_id: userId
      })
    ]);

    res.json({
      count,
      disliked: !!userDislike
    });
  } catch (error) {
    console.error('Get dislikes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle dislike
router.post('/:contentType/:contentId/dislikes', authenticate, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    const userId = new ObjectId(req.user.id);

    if (!isValidContentType(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    if (!(await checkContentExists(contentType, contentId))) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const db = await getDB();
    const contentIdObj = new ObjectId(contentId);

    // Check if already disliked
    const existing = await db.collection('dislikes').findOne({
      content_type: contentType,
      content_id: contentIdObj,
      user_id: userId
    });

    // If user has liked, remove the like first
    await db.collection('likes').deleteOne({
      content_type: contentType,
      content_id: contentIdObj,
      user_id: userId
    });

    if (existing) {
      // Remove dislike
      await db.collection('dislikes').deleteOne({
        content_type: contentType,
        content_id: contentIdObj,
        user_id: userId
      });
      res.json({ disliked: false, message: 'Dislike removed' });
    } else {
      // Add dislike
      await db.collection('dislikes').insertOne({
        content_type: contentType,
        content_id: contentIdObj,
        user_id: userId,
        created_at: new Date()
      });
      res.json({ disliked: true, message: 'Disliked' });
    }
  } catch (error) {
    console.error('Toggle dislike error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
