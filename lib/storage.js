// =====================================================================
// STORAGE - Quản lý lưu trữ hình ảnh qua Cloudflare R2 (S3-compatible)
// =====================================================================

const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const path = require('path');

// ── R2 / S3 Client ────────────────────────────────────────────────────
function createR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.warn('⚠️  Thiếu biến môi trường R2 (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY). Storage sẽ không hoạt động.');
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

let _client = null;
function getClient() {
  if (!_client) _client = createR2Client();
  return _client;
}

const BUCKET = () => process.env.R2_BUCKET_NAME;
const PUBLIC_URL = () => (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

// ── Helpers ───────────────────────────────────────────────────────────
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.jfif': 'image/jpeg',
    '.pdf': 'application/pdf',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Build the full R2 object key.
 * @param {string} filename - e.g. "RACCO60.jpg"
 * @param {string} folder   - e.g. "products" | "slides"
 * @returns {string}        - e.g. "products/RACCO60.jpg"
 */
function buildKey(filename, folder) {
  const safeFilename = filename.replace(/[\\/:*?"<>|]/g, '_');
  return folder ? `${folder}/${safeFilename}` : safeFilename;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Upload a file buffer to Cloudflare R2.
 * @param {object} file     - { buffer, filename, originalname }
 * @param {string} folder   - "products" | "slides"
 * @returns {Promise<string>} Public URL of the uploaded object
 */
async function uploadImageFile(file, folder = 'products') {
  if (!file || !file.buffer) throw new Error('Không nhận được file data');

  const client = getClient();
  if (!client) throw new Error('R2 client chưa được cấu hình. Kiểm tra biến môi trường R2_*.');

  const rawFilename = file.filename || file.originalname;
  const key = buildKey(rawFilename, folder);
  const contentType = getMimeType(rawFilename);

  await client.send(new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    Body: file.buffer,
    ContentType: contentType,
    // R2 public access is managed at bucket level — no ACL needed
  }));

  const url = `${PUBLIC_URL()}/${key}`;
  console.log(`✅ Đã upload lên R2: ${url}`);
  return url;
}

/**
 * Delete a file from Cloudflare R2.
 * @param {string} filenameOrUrl - Full public URL or just the key path
 * @param {string} folder        - Used only when filenameOrUrl is a bare filename
 */
async function deleteImageFile(filenameOrUrl, folder = 'products') {
  if (!filenameOrUrl) return;

  const client = getClient();
  if (!client) {
    console.warn('deleteImageFile: R2 client chưa cấu hình. Bỏ qua xoá.');
    return;
  }

  let key;
  const pubUrl = PUBLIC_URL();

  if (filenameOrUrl.startsWith('http')) {
    // Extract the key from a full URL, e.g. https://cdn.example.com/products/foo.jpg → products/foo.jpg
    if (pubUrl && filenameOrUrl.startsWith(pubUrl)) {
      key = filenameOrUrl.slice(pubUrl.length).replace(/^\//, '');
    } else {
      // Try to extract path from any URL
      try {
        key = new URL(filenameOrUrl).pathname.replace(/^\//, '');
      } catch {
        console.warn(`deleteImageFile: không thể parse URL "${filenameOrUrl}". Bỏ qua.`);
        return;
      }
    }
  } else {
    // Bare filename — build key the same way as upload
    key = buildKey(filenameOrUrl, folder);
  }

  try {
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
    console.log(`🗑️  Đã xoá khỏi R2: ${key}`);
  } catch (err) {
    console.warn(`Lỗi xoá R2 key "${key}":`, err.message);
  }
}

/**
 * List all objects under a given prefix (folder).
 * Returns an array of { key, url } objects.
 * @param {string} prefix - e.g. "products" | "slides"
 * @returns {Promise<Array<{key: string, url: string}>>}
 */
async function listFiles(prefix = '') {
  const client = getClient();
  if (!client) return [];

  const items = [];
  let ContinuationToken;

  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET(),
      Prefix: prefix ? `${prefix}/` : '',
      ContinuationToken,
    }));

    for (const obj of (res.Contents || [])) {
      items.push({ key: obj.Key, url: `${PUBLIC_URL()}/${obj.Key}` });
    }

    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);

  return items;
}

/**
 * Placeholder – not used (client uses the public URL directly).
 */
async function getImageFile() { return null; }

/**
 * Extract filename from a full URL or R2 key path.
 */
function extractFilenameFromBlobPath(urlOrKey) {
  if (!urlOrKey) return null;
  return urlOrKey.split('/').pop();
}

module.exports = {
  uploadImageFile,
  deleteImageFile,
  listFiles,
  getImageFile,
  extractFilenameFromBlobPath,
  USE_BLOB: true,
};
