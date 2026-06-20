// =====================================================================
// VERCEL BLOB STORAGE HANDLER
// =====================================================================
// Xử lý lưu trữ ảnh trên Vercel Blob (khi deploy lên Vercel)
// Fallback sang file system nếu chạy local hoặc không có BLOB_READ_WRITE_TOKEN

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const IS_VERCEL = !!process.env.VERCEL;
const VERCEL_BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

let vercelBlob = null;
try {
  const { put, del, list } = require('@vercel/blob');
  vercelBlob = { put, del, list };
} catch (err) {
  // Sẽ dùng file system nếu không tải được module
}

const USE_BLOB = !!VERCEL_BLOB_TOKEN && !!vercelBlob;

if (USE_BLOB) {
  console.log('✅ Vercel Blob Storage đã được kích hoạt');
} else if (VERCEL_BLOB_TOKEN) {
  console.warn('⚠️  Cảnh báo: Có BLOB_READ_WRITE_TOKEN nhưng không thể tải module @vercel/blob. Sẽ dùng file system.');
}

const IMG_DIR = IS_VERCEL 
  ? path.join('/tmp', 'public', 'img')
  : path.join(__dirname, '..', 'public', 'img');

// =====================================================================
// UPLOAD FILE
// =====================================================================
async function uploadImageFile(file, folder = 'products') {
  if (!file || !file.buffer) {
    throw new Error('Không nhận được file data');
  }

  const filename = file.filename || file.originalname;
  
  if (USE_BLOB) {
    // Upload lên Vercel Blob
    const blobPath = `${folder}/${filename}`;
    try {
      const blobResult = await vercelBlob.put(blobPath, file.buffer, { access: 'public', addRandomSuffix: false });
      // Trả về URL public trực tiếp từ Vercel Blob
      return blobResult.url;
    } catch (err) {
      console.error('Lỗi upload lên Blob:', err);
      throw err;
    }
  } else {
    // Fallback: lưu vào file system local
    try {
      await fsp.mkdir(IMG_DIR, { recursive: true });
      const fullPath = path.join(IMG_DIR, filename);
      await fsp.writeFile(fullPath, file.buffer);
      return `/img/${filename}`;
    } catch (err) {
      console.error('Lỗi lưu file:', err);
      throw err;
    }
  }
}

// =====================================================================
// DELETE FILE
// =====================================================================
async function deleteImageFile(filename, folder = 'products') {
  if (!filename) return;

  if (USE_BLOB) {
    // Xóa từ Vercel Blob
    const blobPath = `${folder}/${filename}`;
    try {
      await vercelBlob.del(blobPath);
      console.log(`🗑️  Đã xóa từ Blob: ${blobPath}`);
    } catch (err) {
      console.warn(`Lỗi xóa từ Blob: ${blobPath}`, err.message);
    }
  } else {
    // Xóa file local
    try {
      const fullPath = path.join(IMG_DIR, filename);
      await fsp.unlink(fullPath);
      console.log(`🗑️  Đã xóa file: ${fullPath}`);
    } catch (err) {
      console.warn(`Lỗi xóa file: ${fullPath}`, err.message);
    }
  }
}

// =====================================================================
// GET FILE (cho API endpoint trả ảnh từ Blob)
// =====================================================================
async function getImageFile(filename, folder = 'products') {
  if (!filename) return null;

  if (USE_BLOB) {
    // Lấy từ Blob
    const blobPath = `${folder}/${filename}`;
    try {
      const { downloadUrl } = await vercelBlob.list({ prefix: blobPath, limit: 1 });
      // Vercel Blob trả URL công khai, không cần download
      return null; // Client sẽ dùng URL trực tiếp
    } catch (err) {
      console.warn(`Lỗi lấy từ Blob: ${blobPath}`, err.message);
      return null;
    }
  } else {
    // Lấy file local
    try {
      const fullPath = path.join(IMG_DIR, filename);
      const buffer = await fsp.readFile(fullPath);
      return buffer;
    } catch (err) {
      console.warn(`Lỗi lấy file: ${fullPath}`, err.message);
      return null;
    }
  }
}

// =====================================================================
// HELPER: Extract filename từ blob path
// =====================================================================
function extractFilenameFromBlobPath(blobPath) {
  if (!blobPath) return null;
  // blobPath dạng: /api/blob-image/products/filename.jpg
  const parts = blobPath.split('/');
  return parts[parts.length - 1];
}
module.exports = {
  uploadImageFile,
  deleteImageFile,
  getImageFile,
  extractFilenameFromBlobPath,
  USE_BLOB,
  IS_VERCEL,
  vercelBlob,
};
