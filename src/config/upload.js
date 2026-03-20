const fs = require("fs");
const multer = require("multer");
const path = require("path");

const env = require("./env");
const uploadsDir = path.join(env.rootDir, "uploads");

function ensureUploadsDir() {
  fs.mkdirSync(uploadsDir, { recursive: true });
  return uploadsDir;
}

ensureUploadsDir();

const imageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const videoMimeTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function createUploader({ allowedMimeTypes, errorMessage, fileSize }) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, ensureUploadsDir());
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}${path.extname(file.originalname).toLowerCase()}`;
      cb(null, uniqueName);
    },
  });

  return multer({
    storage,
    limits: {
      fileSize,
    },
    fileFilter: (req, file, cb) => {
      if (!allowedMimeTypes.has(file.mimetype)) {
        const error = new Error(errorMessage);
        error.statusCode = 400;
        cb(error);
        return;
      }

      cb(null, true);
    },
  });
}

const imageUpload = createUploader({
  allowedMimeTypes: imageMimeTypes,
  errorMessage: "Arquivo invalido. Envie uma imagem JPG, PNG, WEBP ou GIF.",
  fileSize: 5 * 1024 * 1024,
});

const portfolioUpload = createUploader({
  allowedMimeTypes: new Set([...imageMimeTypes, ...videoMimeTypes]),
  errorMessage: "Arquivo invalido. Envie uma foto JPG/PNG/WEBP/GIF ou um video MP4/WEBM/MOV.",
  fileSize: 25 * 1024 * 1024,
});

module.exports = imageUpload;
module.exports.imageUpload = imageUpload;
module.exports.portfolioUpload = portfolioUpload;
module.exports.imageMimeTypes = imageMimeTypes;
module.exports.videoMimeTypes = videoMimeTypes;
module.exports.ensureUploadsDir = ensureUploadsDir;
module.exports.uploadsDir = uploadsDir;
