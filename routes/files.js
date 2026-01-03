import express from 'express';
import { getFileStream, getFileMetadata, deleteFile } from '../utils/gridfs.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

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

    // Set appropriate headers
    if (metadata.metadata?.contentType) {
      res.setHeader('Content-Type', metadata.metadata.contentType);
    }

    // Enable range requests for audio/video streaming
    if (metadata.metadata?.contentType?.startsWith('audio/') || 
        metadata.metadata?.contentType?.startsWith('video/')) {
      res.setHeader('Accept-Ranges', 'bytes');
      
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : metadata.length - 1;
        const chunksize = (end - start) + 1;

        res.status(206); // Partial Content
        res.setHeader('Content-Range', `bytes ${start}-${end}/${metadata.length}`);
        res.setHeader('Content-Length', chunksize);
      } else {
        res.setHeader('Content-Length', metadata.length);
      }
    } else {
      res.setHeader('Content-Length', metadata.length);
    }

    // Stream file
    const downloadStream = await getFileStream(fileId);
    downloadStream.pipe(res);

    downloadStream.on('error', (error) => {
      console.error('File stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
    });
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

