import { GridFSBucket, ObjectId } from 'mongodb';
import { getDB } from '../config/database.js';

// Get GridFS bucket for a specific collection
export async function getBucket(bucketName = 'files') {
  const db = await getDB();
  return new GridFSBucket(db, { bucketName });
}

// Upload a file to GridFS
export async function uploadFile(file, metadata = {}) {
  try {
    const bucket = await getBucket();
    const uploadStream = bucket.openUploadStream(file.originalname, {
      metadata: {
        contentType: file.mimetype,
        ...metadata
      }
    });

    return new Promise((resolve, reject) => {
      uploadStream.end(file.buffer);
      uploadStream.on('finish', () => {
        resolve(uploadStream.id.toString());
      });
      uploadStream.on('error', reject);
    });
  } catch (error) {
    console.error('GridFS upload error:', error);
    throw error;
  }
}

// Get file stream from GridFS
export async function getFileStream(fileId, start = 0, end = null) {
  try {
    const bucket = await getBucket();
    const fileIdObj = new ObjectId(fileId);
    const options = {};
    
    // GridFS doesn't support native range requests, but we can optimize
    // by using start option if available (MongoDB 4.2+)
    if (start > 0) {
      options.start = start;
    }

    // If end is provided, we can use it to limit the stream
    if (end !== null) {
      options.end = end + 1; // GridFS end is exclusive
    }
    
    return bucket.openDownloadStream(fileIdObj, options);
  } catch (error) {
    console.error('GridFS get file error:', error);
    throw error;
  }
}

// Get file metadata
export async function getFileMetadata(fileId) {
  try {
    const bucket = await getBucket();
    const fileIdObj = new ObjectId(fileId);
    const files = await bucket.find({ _id: fileIdObj }).toArray();
    return files[0] || null;
  } catch (error) {
    console.error('GridFS get metadata error:', error);
    throw error;
  }
}

// Delete file from GridFS
export async function deleteFile(fileId) {
  try {
    const bucket = await getBucket();
    const fileIdObj = new ObjectId(fileId);
    await bucket.delete(fileIdObj);
  } catch (error) {
    console.error('GridFS delete error:', error);
    throw error;
  }
}

// Get MIME type from filename
export function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    mpeg: 'audio/mpeg',
    mpg: 'audio/mpeg',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    m4v: 'video/x-m4v'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

