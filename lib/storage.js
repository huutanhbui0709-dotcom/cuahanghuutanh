// =====================================================================
// =====================================================================
// Fallback sang file system nếu chạy local hoặc không có BLOB_READ_WRITE_TOKEN

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const IS_VERCEL = !!process.env.VERCEL;
let VERCEL_BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (VERCEL_BLOB_TOKEN) {
  VERCEL_BLOB_TOKEN = VERCEL_BLOB_TOKEN.replace(/^["']|["']$/g, '').trim();
  process.env.BLOB_READ_WRITE_TOKEN = VERCEL_BLOB_TOKEN;
}

let vercelBlob = null;
try {
  const { put, del, list } = require('@vercel/blob');
  vercelBlob = { put, del, list };
} catch (err) {
  // Sẽ dùng file system nếu không tải được module
}

const USE_BLOB = false; // Vô hiệu hoá hoàn toàn theo yêu cầu (không dùng Vercel Blob nữa)

// Tính toán DATA_DIR giống hệt server.js để đảm bảo ảnh lưu đúng chỗ
// Thư mục mặc định khi chạy dưới máy local của bồ
const BUNDLED_DATA_DIR = path.join(__dirname, 'data');
let defaultDataDir = BUNDLED_DATA_DIR;

// Kiểm tra xem có đang chạy thực tế trên Azure Web App không
if (process.env.WEBSITE_SITE_NAME) {
  // Trên Azure Linux, biến process.env.HOME luôn luôn là '/home'
  // Thư mục '/home/site/' là vùng ĐỘC LẬP, vĩnh viễn không bị GitHub Actions đè dữ liệu
  defaultDataDir = path.join('/home', 'site', 'cuahang_data_benvung');
}

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : defaultDataDir;

const IMG_DIR = path.join(DATA_DIR, 'public_img');


// =====================================================================
// UPLOAD FILE
// =====================================================================
async function uploadImageFile(file, folder = 'products') {
  if (!file || !file.buffer) {
    throw new Error('Không nhận được file data');
  }

  const rawFilename = file.filename || file.originalname;
  const filename = rawFilename.replace(/[\\/:*?"<>|]/g, '_');

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
      const targetDir = folder === 'slides' ? path.join(IMG_DIR, 'Slide_img') : IMG_DIR;
      await fsp.mkdir(targetDir, { recursive: true });
      const fullPath = path.join(targetDir, filename);
      await fsp.writeFile(fullPath, file.buffer);
      const urlPrefix = folder === 'slides' ? '/img/Slide_img/' : '/img/';
      return `${urlPrefix}${filename}`;
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
      const targetDir = folder === 'slides' ? path.join(IMG_DIR, 'Slide_img') : IMG_DIR;
      const fullPath = path.join(targetDir, filename);
      await fsp.unlink(fullPath);
      console.log(`🗑️  Đã xóa file: ${fullPath}`);
    } catch (err) {
      console.warn(`Lỗi xóa file: ${filename}`, err.message);
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
      const targetDir = folder === 'slides' ? path.join(IMG_DIR, 'Slide_img') : IMG_DIR;
      const fullPath = path.join(targetDir, filename);
      const buffer = await fsp.readFile(fullPath);
      return buffer;
    } catch (err) {
      console.warn(`Lỗi lấy file: ${filename}`, err.message);
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
