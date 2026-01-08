import multer from 'multer';

// Use memory storage instead of disk storage
// Files will be stored in memory as buffers, then uploaded to GridFS
const storage = multer.memoryStorage();

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
  } else if (file.fieldname === 'videoFile' || file.fieldname === 'backgroundVideo') {
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
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50000000 // 50MB default
  },
  fileFilter
});

export const uploadCover = multer({
  storage,
  limits: {
    fileSize: 5000000 // 5MB for images
  },
  fileFilter
});

// Combined upload for both music and cover
export const uploadSongFiles = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50000000
  },
  fileFilter
});

// Configure multer for photos
export const uploadPhoto = multer({
  storage,
  limits: {
    fileSize: 10000000 // 10MB for photos
  },
  fileFilter
});

// Configure multer for videos
export const uploadVideo = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_VIDEO_SIZE) || 500000000 // 500MB default for videos
  },
  fileFilter
});
