const multer = require('multer');

const storage = multer.diskStorage({});

const fileFilter = (req, file, cb) => {
  // Accept image files only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb('Invalid file type. Only images are allowed.', false);
  }
};

const upload = multer({ storage, fileFilter });

module.exports = upload;
