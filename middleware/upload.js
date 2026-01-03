import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directories exist
const musicUploadPath = path.join(__dirname, '../uploads/music');
const coverUploadPath = path.join(__dirname, '../uploads/covers');
const photosUploadPath = path.join(__dirname, '../uploads/photos');
const videosUploadPath = path.join(__dirname, '../uploads/videos');

[musicUploadPath, coverUploadPath, photosUploadPath, videosUploadPath].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for music files
const musicStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, musicUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'song-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer for cover images
const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, coverUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'cover-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMusicTypes = /\.(mp3|wav|flac|m4a|ogg|mpeg|mpg)$/i;
  const allowedImageTypes = /\.(jpg|jpeg|png|gif|webp)$/i;
  const allowedVideoTypes = /\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v)$/i;

  if (file.fieldname === 'musicFile') {
    if (allowedMusicTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid music file type. Only mp3, wav, flac, m4a, ogg, mpeg, mpg are allowed.'));
    }
  } else if (file.fieldname === 'coverImage' || file.fieldname === 'photoFile') {
    if (allowedImageTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image file type. Only jpg, jpeg, png, gif, webp are allowed.'));
    }
  } else if (file.fieldname === 'videoFile') {
    if (allowedVideoTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video file type. Only mp4, avi, mov, wmv, flv, webm, mkv, m4v are allowed.'));
    }
  } else {
    cb(null, true);
  }
};

export const uploadMusic = multer({
  storage: musicStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50000000 // 50MB default
  },
  fileFilter
});

export const uploadCover = multer({
  storage: coverStorage,
  limits: {
    fileSize: 5000000 // 5MB for images
  },
  fileFilter
});

// Combined upload for both music and cover
export const uploadSongFiles = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'musicFile') {
        cb(null, musicUploadPath);
      } else if (file.fieldname === 'coverImage') {
        cb(null, coverUploadPath);
      } else {
        cb(new Error('Invalid field name'));
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      if (file.fieldname === 'musicFile') {
        cb(null, 'song-' + uniqueSuffix + path.extname(file.originalname));
      } else {
        cb(null, 'cover-' + uniqueSuffix + path.extname(file.originalname));
      }
    }
  }),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50000000
  },
  fileFilter
});

// Configure multer for photos
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, photosUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'photo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const uploadPhoto = multer({
  storage: photoStorage,
  limits: {
    fileSize: 10000000 // 10MB for photos
  },
  fileFilter
});

// Configure multer for videos
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videosUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const uploadVideo = multer({
  storage: videoStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_VIDEO_SIZE) || 500000000 // 500MB default for videos
  },
  fileFilter
});

