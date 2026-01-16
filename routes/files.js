import express from 'express';
import { getFileStream, getFileMetadata, deleteFile } from '../utils/gridfs.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Handle HEAD requests for metadata prefetching
router.head('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!ObjectId.isValid(fileId)) {
      return res.status(400).end();
    }

    const metadata = await getFileMetadata(fileId);
    if (!metadata) {
      return res.status(404).end();
    }

    const fileSize = metadata.length;
    const contentType = metadata.metadata?.contentType || 'application/octet-stream';
    const range = req.headers.range;

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('ETag', `"${fileId}"`);

    if (range && (contentType.startsWith('audio/') || contentType.startsWith('video/'))) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      const chunksize = (end - start) + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunksize);
    }

    res.end();
  } catch (error) {
    console.error('HEAD file error:', error);
    if (!res.headersSent) {
      res.status(500).end();
    }
  }
});

// Serve file from GridFS
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    // Get file metadata
    const metadata = await getFileMetadata(fileId);
    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileSize = metadata.length;
    const contentType = metadata.metadata?.contentType || 'application/octet-stream';
    const range = req.headers.range;

    // Set aggressive caching headers for better performance
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable, stale-while-revalidate=86400');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', `"${fileId}"`);
    
    // Add CORS headers for video streaming
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    
    // Handle range requests for audio/video
    if (range && (contentType.startsWith('audio/') || contentType.startsWith('video/'))) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      const chunksize = (end - start) + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunksize);
      res.setHeader('Content-Type', contentType);

      // Optimized streaming using native GridFS start/end options
      const downloadStream = await getFileStream(fileId, start, end);
      
      downloadStream.pipe(res);

      downloadStream.on('error', (error) => {
        console.error('File stream error:', error);
        if (!res.headersSent && !res.destroyed) {
          res.status(500).json({ error: 'Error streaming file' });
        } else if (!res.destroyed) {
          res.end();
        }
      });
    } else {
      // Full file stream (no range request)
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Content-Type', contentType);

      const downloadStream = await getFileStream(fileId);
      downloadStream.pipe(res);

      downloadStream.on('error', (error) => {
        console.error('File stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming file' });
        }
      });
    }
  } catch (error) {
    console.error('Get file error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// Delete file from GridFS (admin only, can be protected with middleware if needed)
router.delete('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    await deleteFile(fileId);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
