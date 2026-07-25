// =====================================================================
// STORAGE - Quản lý lưu trữ hình ảnh qua Vercel Blob
// =====================================================================

const { put, del } = require('@vercel/blob');

const IS_VERCEL = !!process.env.VERCEL;

/**
 * Upload file lên Vercel Blob
 */
async function uploadImageFile(file, folder = 'products') {
  if (!file || !file.buffer) {
    throw new Error('Không nhận được file data');
  }

  const rawFilename = file.filename || file.originalname;
  const filename = rawFilename.replace(/[\\/:*?"<>|]/g, '_');
  const blobPath = `${folder}/${filename}`;

  try {
    const blobResult = await put(blobPath, file.buffer, {
      access: 'public',
      addRandomSuffix: false
    });
    // Trả về URL public trực tiếp từ Vercel Blob
    return blobResult.url;
  } catch (err) {
    console.error('Lỗi upload lên Vercel Blob:', err);
    throw err;
  }
}

/**
 * Xóa file khỏi Vercel Blob.
 * @param {string} filenameOrUrl - Tên file hoặc URL đầy đủ từ Vercel Blob.
 * @param {string} folder - Thư mục Blob ('products' | 'slides').
 */
async function deleteImageFile(filenameOrUrl, folder = 'products') {
  if (!filenameOrUrl) return;

  // @vercel/blob del() yêu cầu URL đầy đủ — nếu đã có URL thì dùng trực tiếp
  const urlToDelete = filenameOrUrl.startsWith('http')
    ? filenameOrUrl
    : null; // không thể xây URL mà không có base URL của dự án

  if (!urlToDelete) {
    console.warn(`deleteImageFile: không thể xóa "${filenameOrUrl}" vì không có URL đầy đủ. Bỏ qua.`);
    return;
  }

  try {
    await del(urlToDelete);
    console.log(`🗑️  Đã xóa từ Blob: ${urlToDelete}`);
  } catch (err) {
    console.warn(`Lỗi xóa từ Blob: ${urlToDelete}`, err.message);
  }
}

/**
 * Lấy file (Bỏ qua vì client sẽ dùng URL Blob công khai trực tiếp)
 */
async function getImageFile(filename, folder = 'products') {
  return null;
}

/**
 * Helper trích xuất tên file từ URL blob
 */
function extractFilenameFromBlobPath(blobPath) {
  if (!blobPath) return null;
  const parts = blobPath.split('/');
  return parts[parts.length - 1];
}

module.exports = {
  uploadImageFile,
  deleteImageFile,
  getImageFile,
  extractFilenameFromBlobPath,
  USE_BLOB: true,
  IS_VERCEL
};
