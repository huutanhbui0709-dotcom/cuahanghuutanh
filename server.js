// =====================================================================
// CỬA HÀNG VẬT TƯ KỸ THUẬT - SERVER
// Express + lưu dữ liệu bằng file JSON (không cần database).
// Trang quản trị có URL riêng, yêu cầu đăng nhập bằng mật khẩu.
// =====================================================================

require('dotenv').config();

// Tự động dọn dẹp dấu nháy kép/đơn và khoảng trắng thừa của biến môi trường (phổ biến khi cấu hình Azure Portal)
for (const key in process.env) {
  if (typeof process.env[key] === 'string') {
    process.env[key] = process.env[key].replace(/^["']|["']$/g, '').trim();
  }
}

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie');
const express = require('express');
const session = require('express-session');
const rateLimitModule = require('express-rate-limit');
const rateLimit = rateLimitModule.rateLimit || rateLimitModule.default || rateLimitModule;
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { uploadImageFile, deleteImageFile, USE_BLOB, vercelBlob } = require('./lib/storage');
const { sendOrderNotification } = require('./lib/mailer');

const IS_VERCEL = !!process.env.VERCEL;

// Tính toán DATA_DIR giống hệt để đảm bảo ảnh lưu đúng chỗ
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

const XLSX = require('xlsx');

const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SPAM_DEVICES_FILE = path.join(DATA_DIR, 'spam_devices.json');
const SUPPLIERS_FILE = path.join(DATA_DIR, 'suppliers.json');
const BUNDLED_PRODUCTS_SEED = path.join(BUNDLED_DATA_DIR, 'products.json');

const IMG_DIR = path.join(DATA_DIR, 'public_img');
const SLIDE_IMG_DIR = path.join(IMG_DIR, 'Slide_img');

// Cấu hình Multer dùng memory storage (lưu vào RAM trước, rồi upload lên Blob)
const memoryStorage = multer.memoryStorage();

// Middleware tạo filename từ ma sản phẩm
function createProductFilename(req, file, cb) {
  const ext = path.extname(file.originalname);
  const code = (req.params.ma || req.body.ma || 'temp-' + Date.now()).trim();
  const cleanCode = code.replace(/[\\/:*?"<>|]/g, '_');
  cb(null, { filename: cleanCode + ext, originalName: file.originalname });
}

function createSlideFilename(req, file, cb) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const ext = path.extname(file.originalname);
  cb(null, { filename: 'slide-' + uniqueSuffix + ext, originalName: file.originalname });
}

function createFolderImageFilename(req, file, cb) {
  const originalName = file.originalname.replace(/\\/g, '/');
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  const cleanBase = base.replace(/[\\/:*?"<>|]/g, '_');
  cb(null, { filename: cleanBase + ext, originalName: originalName });
}

const upload = multer({
  storage: memoryStorage,
  fileFilter: function (req, file, cb) {
    if (/\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadSlide = multer({
  storage: memoryStorage,
  fileFilter: function (req, file, cb) {
    if (/\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadFolderImages = multer({
  storage: memoryStorage,
  fileFilter: function (req, file, cb) {
    if (/\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Dọn dẹp các ảnh trùng mã sản phẩm nhưng khác đuôi mở rộng
async function cleanOldImagesOfCode(code, exceptFilename) {
  const dir = IMG_DIR;
  try {
    const files = await fsp.readdir(dir);
    const cleanCode = code.replace(/[\\/:*?"<>|]/g, '_');
    for (const file of files) {
      const ext = path.extname(file);
      const nameWithoutExt = path.basename(file, ext);
      if (nameWithoutExt === cleanCode && file !== exceptFilename) {
        const fullPath = path.join(dir, file);
        try {
          await fsp.unlink(fullPath);
          console.log(`🗑️ Đã dọn dẹp ảnh cũ trùng mã khác định dạng: ${fullPath}`);
        } catch (err) { }
      }
    }
  } catch (err) {
    console.warn('Lỗi dọn dẹp ảnh cũ:', err.message);
  }
}

// ---------------------------------------------------------------------
// CẤU HÌNH
// ---------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-please';
const ADMIN_PATH = normalizePath(process.env.ADMIN_PATH || '/admin');


if (ADMIN_PASSWORD === 'admin123') {
  console.warn('⚠️  CẢNH BÁO: Bạn đang dùng mật khẩu admin mặc định. Hãy đặt biến môi trường ADMIN_PASSWORD trước khi deploy thật!');
}
if (SESSION_SECRET === 'change-this-secret-please') {
  console.warn('⚠️  CẢNH BÁO: Bạn đang dùng SESSION_SECRET mặc định. Hãy đặt một chuỗi bí mật riêng (xem .env.example).');
}

function normalizePath(p) {
  if (!p.startsWith('/')) p = '/' + p;
  return p.replace(/\/+$/, '') || '/admin';
}

// ---------------------------------------------------------------------
// LỚP LƯU TRỮ FILE JSON (đọc 1 lần khi khởi động, giữ trong RAM,
// mỗi lần thay đổi sẽ ghi đè lại file - các lệnh ghi được xếp hàng
// tuần tự để tránh ghi đè chồng lên nhau khi có nhiều request cùng lúc)
// ---------------------------------------------------------------------
async function existsAsync(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJSONAsync(file, fallback) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function makeQueuedWriter(filePath, blobPath) {
  let queue = Promise.resolve();
  return function write(data) {
    queue = queue
      .catch(() => { }) // không để lỗi trước đó chặn lần ghi sau
      .then(async () => {
        try {
          const content = JSON.stringify(data, null, 2);
          await fsp.writeFile(filePath, content, 'utf8');
          if (USE_BLOB) {
            try {
              await vercelBlob.put(blobPath, content, {
                access: 'public',
                addRandomSuffix: false
              });
              console.log(`☁️ Đã đồng bộ lên Vercel Blob: ${blobPath}`);
            } catch (err) {
              console.error(`❌ Lỗi đồng bộ lên Blob ${blobPath}:`, err.message);
            }
          }
        } catch (err) {
          console.error(`❌ Lỗi trong hàng đợi ghi file (${filePath}):`, err.message);
        }
      });
    return queue;
  };
}

// Khởi tạo các biến cache RAM
let products = [];
let orders = [];
let settings = {
  address: "Thị trấn Thốt Nốt, Quận Thốt Nốt, Thành phố Cần Thơ",
  phone: "0945 592 209",
  email: "diennuochuutanh@gmail.com",
  mapUrl: "https://maps.google.com/maps?q=C%E1%BB%ADa%20h%C3%A0ng%20%C4%91i%E1%BB%87n%20n%C6%B0%E1%BB%9Bc%20H%E1%BB%AFu%20T%C3%A1nh,%20Th%E1%BB%91t%20N%E1%BB%91t,%20C%E1%BA%A7n%20Th%C6%A1&t=&z=15&ie=UTF8&iwloc=&output=embed"
};
let spamDevices = [];
let suppliers = [];

const deviceOrderAttempts = new Map();
const blockedDevices = new Map();

const saveProducts = makeQueuedWriter(PRODUCTS_FILE, 'data/products.json');
const saveOrders = makeQueuedWriter(ORDERS_FILE, 'data/orders.json');
const saveSettings = makeQueuedWriter(SETTINGS_FILE, 'data/settings.json');
const saveSpamDevices = makeQueuedWriter(SPAM_DEVICES_FILE, 'data/spam_devices.json');
const saveSuppliers = makeQueuedWriter(SUPPLIERS_FILE, 'data/suppliers.json');

// Khi server khởi động lần đầu trên Azure (hoặc sau mỗi lần deploy), copy
// tất cả ảnh từ thư mục public/img/ vào IMG_DIR (persistent directory).
// Chỉ copy những file CHƯA CÓ trong IMG_DIR để không ghi đè ảnh đã được
// cập nhật qua admin interface.
async function seedImagesFromPublic() {
  const bundledImgDir = path.join(__dirname, 'public', 'img');
  if (!(await existsAsync(bundledImgDir))) return;
  try {
    const files = await fsp.readdir(bundledImgDir);
    let copied = 0;
    for (const file of files) {
      const srcPath = path.join(bundledImgDir, file);
      const destPath = path.join(IMG_DIR, file);

      const stats = await fsp.stat(srcPath);
      if (stats.isDirectory()) continue;

      if (!(await existsAsync(destPath))) {
        await fsp.copyFile(srcPath, destPath);
        copied++;
      }
    }
    if (copied > 0) {
      console.log(`📸 Đã seed ${copied} ảnh từ public/img/ vào thư mục bền vững: ${IMG_DIR}`);
    }
  } catch (err) {
    console.warn('⚠️ Lỗi seed ảnh từ public/img/:', err.message);
  }
}

let isInitialized = false;
let initPromise = null;

async function initializeData() {
  try {
    // 1. Đảm bảo thư mục tồn tại bất đồng bộ
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.mkdir(SLIDE_IMG_DIR, { recursive: true });

    // 2. Seed ảnh từ public sang IMG_DIR
    await seedImagesFromPublic();

    // 3. Khởi tạo/seed các file JSON nếu chưa có
    if (!(await existsAsync(PRODUCTS_FILE))) {
      const seed = (await existsAsync(BUNDLED_PRODUCTS_SEED))
        ? await fsp.readFile(BUNDLED_PRODUCTS_SEED, 'utf8')
        : '[]';
      await fsp.writeFile(PRODUCTS_FILE, seed, 'utf8');
      console.log('📦 Đã tạo products.json mới từ dữ liệu mẫu tại:', PRODUCTS_FILE);
    }

    if (!(await existsAsync(ORDERS_FILE))) {
      const seedOrders = path.join(BUNDLED_DATA_DIR, 'orders.json');
      const seed = (await existsAsync(seedOrders))
        ? await fsp.readFile(seedOrders, 'utf8')
        : '[]';
      await fsp.writeFile(ORDERS_FILE, seed, 'utf8');
      console.log('📋 Đã tạo orders.json mới từ dữ liệu mẫu tại:', ORDERS_FILE);
    }

    if (!(await existsAsync(SETTINGS_FILE))) {
      const seedSettings = path.join(BUNDLED_DATA_DIR, 'settings.json');
      if (await existsAsync(seedSettings)) {
        await fsp.writeFile(SETTINGS_FILE, await fsp.readFile(seedSettings, 'utf8'), 'utf8');
      } else {
        const defaultSettings = {
          address: "Thị trấn Thốt Nốt, Quận Thốt Nốt, Thành phố Cần Thơ",
          phone: "0945 592 209",
          email: "diennuochuutanh@gmail.com",
          mapUrl: "https://maps.google.com/maps?q=C%E1%BB%ADa%20h%C3%A0ng%20%C4%91i%E1%BB%87n%20n%C6%B0%E1%BB%9Bc%20H%E1%BB%AFu%20T%C3%A1nh,%20Th%E1%BB%91t%20N%E1%BB%91t,%20C%E1%BA%A7n%20Th%C6%A1&t=&z=15&ie=UTF8&iwloc=&output=embed"
        };
        await fsp.writeFile(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), 'utf8');
      }
      console.log('⚙️ Đã tạo settings.json mới tại:', SETTINGS_FILE);
    }

    if (!(await existsAsync(SPAM_DEVICES_FILE))) {
      await fsp.writeFile(SPAM_DEVICES_FILE, '[]', 'utf8');
      console.log('🛡️ Đã tạo/khởi tạo lại spam_devices.json tại:', SPAM_DEVICES_FILE);
    } else {
      try {
        const spamStats = await fsp.stat(SPAM_DEVICES_FILE);
        if (spamStats.size === 0) {
          await fsp.writeFile(SPAM_DEVICES_FILE, '[]', 'utf8');
        }
      } catch (err) { }
    }

    if (!(await existsAsync(SUPPLIERS_FILE))) {
      await fsp.writeFile(SUPPLIERS_FILE, '[]', 'utf8');
      console.log('🚛 Đã tạo/khởi tạo lại suppliers.json tại:', SUPPLIERS_FILE);
    }

    // 4. Load dữ liệu lên Cache RAM bất đồng bộ
    products = await readJSONAsync(PRODUCTS_FILE, []);
    orders = await readJSONAsync(ORDERS_FILE, []);
    settings = await readJSONAsync(SETTINGS_FILE, {
      address: "Thị trấn Thốt Nốt, Quận Thốt Nốt, Thành phố Cần Thơ",
      phone: "0945 592 209",
      email: "diennuochuutanh@gmail.com",
      mapUrl: "https://maps.google.com/maps?q=C%E1%BB%ADa%20h%C3%A0ng%20%C4%91i%E1%BB%87n%20n%C6%B0%E1%BB%9Bc%20H%E1%BB%AFu%20T%C3%A1nh,%20Th%E1%BB%91t%20N%E1%BB%91t,%20C%E1%BA%A7n%20Th%C6%A1&t=&z=15&ie=UTF8&iwloc=&output=embed"
    });
    spamDevices = await readJSONAsync(SPAM_DEVICES_FILE, []);
    suppliers = await readJSONAsync(SUPPLIERS_FILE, []);

    // 5. Cập nhật danh sách thiết bị bị khóa
    blockedDevices.clear();
    spamDevices.forEach(entry => {
      if (entry.lockUntil && entry.lockUntil > Date.now()) {
        if (entry.deviceId) blockedDevices.set(entry.deviceId, entry.lockUntil);
        if (entry.ip) blockedDevices.set(entry.ip, entry.lockUntil);
        if (entry.fingerprint) blockedDevices.set(entry.fingerprint, entry.lockUntil);
      }
    });

    // 6. Đồng bộ dữ liệu với Vercel Blob nếu bật USE_BLOB
    if (USE_BLOB) {
      try {
        console.log('🔄 Đang đồng bộ dữ liệu từ Vercel Blob Storage...');
        const { blobs } = await vercelBlob.list();

        // Đồng bộ products.json
        const prodBlob = blobs.find(b => b.pathname === 'data/products.json');
        if (prodBlob) {
          const res = await fetch(prodBlob.url);
          products = await res.json();
          console.log(`✅ Đã tải ${products.length} sản phẩm từ Blob`);
        } else {
          await vercelBlob.put('data/products.json', JSON.stringify(products, null, 2), { access: 'public', addRandomSuffix: false });
          console.log('📤 Đã đẩy products.json mẫu lên Blob');
        }

        // Đồng bộ orders.json
        const ordBlob = blobs.find(b => b.pathname === 'data/orders.json');
        if (ordBlob) {
          const res = await fetch(ordBlob.url);
          orders = await res.json();
          console.log(`✅ Đã tải ${orders.length} đơn hàng từ Blob`);
        } else {
          await vercelBlob.put('data/orders.json', JSON.stringify(orders, null, 2), { access: 'public', addRandomSuffix: false });
          console.log('📤 Đã đẩy orders.json mẫu lên Blob');
        }

        // Đồng bộ settings.json
        const setBlob = blobs.find(b => b.pathname === 'data/settings.json');
        if (setBlob) {
          const res = await fetch(setBlob.url);
          settings = await res.json();
          console.log('✅ Đã tải settings từ Blob');
        } else {
          await vercelBlob.put('data/settings.json', JSON.stringify(settings, null, 2), { access: 'public', addRandomSuffix: false });
          console.log('📤 Đã đẩy settings.json mẫu lên Blob');
        }

        // Đồng bộ spam_devices.json
        const spamBlob = blobs.find(b => b.pathname === 'data/spam_devices.json');
        if (spamBlob) {
          const res = await fetch(spamBlob.url);
          spamDevices = await res.json();
          console.log(`✅ Đã tải ${spamDevices.length} thiết bị spam từ Blob`);
          spamDevices.forEach(entry => {
            if (entry.lockUntil && entry.lockUntil > Date.now()) {
              if (entry.deviceId) blockedDevices.set(entry.deviceId, entry.lockUntil);
              if (entry.ip) blockedDevices.set(entry.ip, entry.lockUntil);
              if (entry.fingerprint) blockedDevices.set(entry.fingerprint, entry.lockUntil);
            }
          });
        } else {
          await vercelBlob.put('data/spam_devices.json', JSON.stringify(spamDevices, null, 2), { access: 'public', addRandomSuffix: false });
          console.log('📤 Đã đẩy spam_devices.json mẫu lên Blob');
        }
      } catch (err) {
        console.error('❌ Lỗi đồng bộ dữ liệu từ Blob:', err);
      }
    }
  } catch (err) {
    console.error('❌ Lỗi nghiêm trọng khi khởi tạo dữ liệu:', err);
  }
  isInitialized = true;
}

async function ensureInitialized() {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = initializeData();
  }
  await initPromise;
}

const app = express();
app.set('trust proxy', 1); // cần thiết khi chạy sau proxy của Railway/Render

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: 'auto',
    maxAge: 3600000 * 24 // 24 giờ
  }
}));

app.use(async (req, res, next) => {
  try {
    await ensureInitialized();
    next();
  } catch (err) {
    console.error('Lỗi khởi tạo dữ liệu:', err);
    res.status(500).send('Lỗi khởi tạo server.');
  }
});

app.use(express.json({ limit: '2mb' }));

// Giới hạn số lần thử đăng nhập admin để chống dò mật khẩu
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Bạn thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.' },
});

function parseCookies(request) {
  const cookieHeader = request.headers.cookie || '';
  try {
    return cookieParser.parse(cookieHeader);
  } catch (err) {
    console.warn('Lỗi parse cookie:', err.message);
    return {};
  }
}

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies.admin_token;
  const expectedToken = crypto.createHmac('sha256', SESSION_SECRET).update('admin').digest('hex');
  if (token === expectedToken) return next();
  return res.status(401).json({ ok: false, message: 'Chưa đăng nhập quản trị.' });
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // so sánh với buffer giả cùng độ dài để tránh lộ thông tin qua thời gian xử lý
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// =====================================================================
// REALTIME UPDATES (Server-Sent Events)
// =====================================================================
let sseClients = [];

app.get('/api/updates/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Nguyên nhân 1: Bắt buộc Azure/Nginx BYPASS cơ chế Buffering
  // Nếu không có header này, Azure sẽ giữ toàn bộ response trong bộ đệm
  // và client sẽ không nhận được sự kiện SSE nào cho đến khi kết nối đóng.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

// Nguyên nhân 2: Sửa cú pháp vòng lặp Heartbeat và bảo vệ null-check
// Nguyên nhân 3: Gửi ping mỗi 3 phút (180 giây) để vượt qua giới hạn
// idle timeout 4 phút của Azure App Service, giữ kết nối luôn sống
setInterval(() => {
  if (sseClients && sseClients.length > 0) {
    sseClients.forEach(client => {
      try {
        // Gửi comment ping để giữ đường truyền luôn active
        client.write(': ping\n\n');
      } catch (err) {
        // Client đã chết, router sẽ tự hủy ở sự kiện close
      }
    });
  }
}, 180000); // Chạy mỗi 3 phút — dưới ngưỡng idle timeout 4 phút của Azure

function broadcastUpdate(type, data = {}) {
  const payload = JSON.stringify({ type, data });
  sseClients.forEach(client => {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (err) {
      // connection is dead
    }
  });
}

// ---------------------------------------------------------------------
// PHỤC VỤ FILE TĨNH (trang khách hàng, css, js dùng chung)
// ---------------------------------------------------------------------
// Phục vụ hình ảnh được tải lên từ thư mục bền vững (persistent directory).
// - Nếu là ảnh sản phẩm trực tiếp (nằm ngay trong /img/, ví dụ: /img/DIENCUONVSC-1.5.jpg):
//   chặn fallthrough (fallthrough: false) để tránh trả về ảnh cũ từ Git (public/img/) khi ảnh bị sửa/xoá.
// - Nếu là các thư mục con khác (như /img/favicon/ hoặc /img/Slide_img/):
//   cho phép fallthrough (fallthrough: true) để tự động rơi xuống thư mục public/img/ nếu chưa được tải lên.
app.use('/img', (req, res, next) => {
  const pathParts = req.path.split('/').filter(Boolean);
  if (pathParts.length >= 2) {
    // Có thư mục con (ví dụ: 'favicon', 'Slide_img'), cho phép fallthrough
    express.static(IMG_DIR, { fallthrough: true })(req, res, next);
  } else {
    // Ảnh sản phẩm trực tiếp, không cho phép fallthrough
    express.static(IMG_DIR, { fallthrough: false })(req, res, (err) => {
      if (err) return next(err);
      res.status(404).send('Product image not found');
    });
  }
});

if (IS_VERCEL) {
  app.use(express.static('/tmp/public'));
}
app.use(express.static(path.join(__dirname, 'public')));

// Trang quản trị KHÔNG nằm trong /public nên không thể truy cập trực tiếp
// qua đường dẫn file - chỉ phục vụ qua đúng ADMIN_PATH cấu hình ở .env
const ADMIN_HTML_PATH = path.join(__dirname, 'private', 'admin.html');
let adminHtmlCache = null;

app.get(ADMIN_PATH, async (req, res) => {
  try {
    const html = await fsp.readFile(ADMIN_HTML_PATH, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Lỗi đọc file admin.html:', err);
    res.status(500).send('Lỗi tải trang quản trị.');
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// =====================================================================
// API CÔNG KHAI (khách hàng)
// =====================================================================

app.get('/api/products', (req, res) => {
  res.json(products);
});

app.get('/api/settings', (req, res) => {
  const publicSettings = { ...settings };
  if (!req.session || !req.session.isAdmin) {
    delete publicSettings.geminiApiKey;
  }
  res.json(publicSettings);
});

app.get('/api/slides', async (req, res) => {
  const dir = SLIDE_IMG_DIR;
  const bundledDir = path.join(__dirname, 'public', 'img', 'Slide_img');
  try {
    let files = [];
    if (await existsAsync(dir)) {
      files = await fsp.readdir(dir);
    }
    // Lọc chỉ lấy các file định dạng ảnh
    let images = files
      .filter(f => /\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(f))
      .map(f => '/img/Slide_img/' + f);

    // Nếu trong thư mục ghi đè không có slide nào, lấy từ thư mục mẫu của repo
    if (images.length === 0 && await existsAsync(bundledDir)) {
      const bundledFiles = await fsp.readdir(bundledDir);
      images = bundledFiles
        .filter(f => /\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(f))
        .map(f => '/img/Slide_img/' + f);
    }
    res.json(images);
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không thể đọc danh sách slide.' });
  }
});

app.post('/api/orders', async (req, res) => {
  // Cơ chế chống Spam đặt hàng theo Device ID + IP + Fingerprint (khóa 1 tiếng nếu spam >= 5 lần trong 5 phút)
  const deviceId = req.headers['x-device-id'] || 'unknown-device';
  const ip = req.ip || 'unknown-ip';
  const fingerprint = req.headers['x-browser-fingerprint'] || 'unknown-fp';
  const now = Date.now();

  const deviceLockUntil = blockedDevices.get(deviceId);
  const ipLockUntil = blockedDevices.get(ip);
  const fpLockUntil = blockedDevices.get(fingerprint);
  const lockUntil = Math.max(deviceLockUntil || 0, ipLockUntil || 0, fpLockUntil || 0);

  if (lockUntil && now < lockUntil) {
    const remainingMin = Math.ceil((lockUntil - now) / 60000);
    let remainingStr = '';
    if (remainingMin >= 60) {
      const hours = Math.floor(remainingMin / 60);
      const mins = remainingMin % 60;
      remainingStr = `${hours} giờ ${mins > 0 ? ` ${mins} phút` : ''}`;
    } else {
      remainingStr = `${remainingMin} phút`;
    }
    return res.status(429).json({
      ok: false,
      message: `Thiết bị của bạn đã bị tạm khóa do phát hiện spam đặt hàng. Vui lòng quay lại sau ${remainingStr}.`
    });
  }

  let attempts = deviceOrderAttempts.get(deviceId) || [];
  let ipAttempts = deviceOrderAttempts.get(ip) || [];
  let fpAttempts = deviceOrderAttempts.get(fingerprint) || [];

  // 1. Kiểm tra cảnh báo (đã có đơn đặt trong vòng 2 phút trước)
  const hasOrderInTwoMin = attempts.some(t => t > now - 120000) ||
    ipAttempts.some(t => t > now - 120000) ||
    fpAttempts.some(t => t > now - 120000);

  const { customer, phone, address, note, items, force } = req.body || {};

  if (hasOrderInTwoMin && !force) {
    return res.json({
      ok: false,
      requireConfirmation: true,
      message: 'Hệ thống ghi nhận bạn đã có đơn đặt trong 2 phút qua. Bạn có muốn tiếp tục đặt không?'
    });
  }

  // 2. Cập nhật danh sách lần đặt hàng trong vòng 5 phút qua (300,000 ms)
  attempts = attempts.filter(t => t > now - 300000);
  attempts.push(now);
  deviceOrderAttempts.set(deviceId, attempts);

  ipAttempts = ipAttempts.filter(t => t > now - 300000);
  ipAttempts.push(now);
  deviceOrderAttempts.set(ip, ipAttempts);

  fpAttempts = fpAttempts.filter(t => t > now - 300000);
  fpAttempts.push(now);
  deviceOrderAttempts.set(fingerprint, fpAttempts);

  const currentCount = Math.max(attempts.length, ipAttempts.length, fpAttempts.length);

  if (currentCount >= 5) {
    const lockTime = now + 86400000; // Khóa 24 tiếng
    blockedDevices.set(deviceId, lockTime); // Khóa Device ID
    blockedDevices.set(ip, lockTime);       // Khóa IP
    blockedDevices.set(fingerprint, lockTime); // Khóa Fingerprint

    // Lưu / Cập nhật vào spam_devices.json
    let entry = spamDevices.find(e => e.fingerprint === fingerprint || e.ip === ip || e.deviceId === deviceId);
    if (!entry) {
      entry = {
        deviceId,
        fingerprint,
        ip,
        count: 0,
        time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        status: 'Spam'
      };
      spamDevices.push(entry);
    }
    entry.count = currentCount;
    entry.lockUntil = lockTime;
    entry.time = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    entry.status = 'Spam';

    try {
      await saveSpamDevices(spamDevices);
    } catch (err) {
      console.error('Lỗi lưu log spam:', err);
    }

    return res.status(429).json({
      ok: false,
      message: 'Phát hiện hành vi spam đặt hàng liên tục. Thiết bị của bạn đã bị tạm khóa 24 giờ.'
    });
  }

  const cName = String(customer || '').trim().slice(0, 50);
  const cPhone = String(phone || '').trim().slice(0, 15);
  const cAddress = String(address || '').trim().slice(0, 200);
  const cNote = String(note || '').trim().slice(0, 300);

  if (!cName || cName.length < 2) return res.status(400).json({ ok: false, message: 'Họ tên phải từ 2–50 ký tự.' });
  if (!cPhone || !/^[0-9]{9,15}$/.test(cPhone)) return res.status(400).json({ ok: false, message: 'Số điện thoại phải gồm 9–15 chữ số.' });
  if (!cAddress || cAddress.length < 5) return res.status(400).json({ ok: false, message: 'Địa chỉ phải từ 5–200 ký tự.' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: 'Giỏ hàng trống.' });
  }

  // Tự tra lại giá & tên sản phẩm từ dữ liệu trên server (không tin dữ liệu giá gửi từ client)
  const orderItems = [];
  for (const raw of items) {
    const ma = String((raw && raw.ma) || '').trim();
    const qtyNum = parseInt(raw && raw.qty, 10);
    const qty = Number.isFinite(qtyNum) ? qtyNum : 0;
    const product = products.find((p) => p.ma === ma);
    if (!product || qty <= 0) continue;
    orderItems.push({
      ma: product.ma,
      ten: product.ten,
      gia: product.gia || 0,
      donvi: product.donvi || '',
      qty,
    });
  }

  if (orderItems.length === 0) {
    return res.status(400).json({ ok: false, message: 'Không có sản phẩm hợp lệ trong giỏ hàng.' });
  }

  const total = orderItems.reduce((s, x) => s + x.gia * x.qty, 0);
  const order = {
    id: 'DH' + Date.now().toString().slice(-8),
    createdAt: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    customer: cName,
    phone: cPhone,
    address: cAddress,
    note: cNote,
    items: orderItems,
    total,
    status: 'Chờ xác nhận',
    deviceId, // Lưu ID thiết bị
  };

  orders.unshift(order);
  try {
    await saveOrders(orders);
    broadcastUpdate('orders_updated');
  } catch (err) {
    console.error('Lỗi lưu đơn hàng:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi lưu đơn hàng, vui lòng thử lại.' });
  }

  // Gửi mail thông báo bất đồng bộ — không chặn response trả về khách
  sendOrderNotification(order);

  res.json({
    ok: true,
    order,
    warning: hasOrderInTwoMin ? 'Hệ thống ghi nhận bạn đã có đơn đặt trong 2 phút qua. Đơn này vẫn được gửi đi thành công!' : undefined
  });
});

// =====================================================================
// ĐĂNG NHẬP / ĐĂNG XUẤT ADMIN
// =====================================================================

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (password && timingSafeEqualStr(password, ADMIN_PASSWORD)) {
    const token = crypto.createHmac('sha256', SESSION_SECRET).update('admin').digest('hex');
    const isSecure = IS_VERCEL || process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('admin_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!isSecure,
      path: '/',
      maxAge: 1000 * 60 * 60 * 8, // 8 giờ
    });
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, message: 'Sai mật khẩu.' });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.admin_token;
  const expectedToken = crypto.createHmac('sha256', SESSION_SECRET).update('admin').digest('hex');
  const authenticated = token === expectedToken;

  if (IS_VERCEL && !authenticated) {
    console.warn('⚠️  Session check failed - cookie missing or invalid');
    console.warn('  Headers cookie:', req.headers.cookie ? '(present)' : '(missing)');
  }

  res.json({ authenticated });
});

// =====================================================================
// API QUẢN TRỊ (yêu cầu đăng nhập)
// =====================================================================

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  res.json(orders);
});

const ALLOWED_STATUS = ['Chờ xác nhận', 'Đã xác nhận', 'Đã huỷ'];

app.put('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!ALLOWED_STATUS.includes(status)) {
    return res.status(400).json({ ok: false, message: 'Trạng thái không hợp lệ.' });
  }
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng.' });

  order.status = status;
  try {
    await saveOrders(orders);
    broadcastUpdate('orders_updated');
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true, order });
});
app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng.' });
  if (orders[idx].status !== 'Đã huỷ') {
    return res.status(400).json({ ok: false, message: 'Chỉ có thể xoá đơn hàng đã huỷ.' });
  }
  orders.splice(idx, 1);
  try {
    await saveOrders(orders);
    broadcastUpdate('orders_updated');
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true });
});

// Xóa TẤT CẢ đơn hàng đã huỷ
app.delete('/api/admin/orders-cancelled/all', requireAdmin, async (req, res) => {
  const before = orders.length;
  orders = orders.filter((o) => o.status !== 'Đã huỷ');
  const deleted = before - orders.length;
  if (deleted === 0) {
    return res.json({ ok: true, deleted: 0, message: 'Không có đơn hàng đã huỷ nào.' });
  }
  try {
    await saveOrders(orders);
    broadcastUpdate('orders_updated');
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true, deleted });
});

app.patch('/api/products/bestseller', requireAdmin, async (req, res) => {
  try {
    const { id, isBestSeller } = req.body || {};
    if (!id) {
      return res.status(400).json({ ok: false, message: 'Thiếu thông tin mã sản phẩm (id).' });
    }

    // Đọc file bất đồng bộ từ PRODUCTS_FILE
    const raw = await fsp.readFile(PRODUCTS_FILE, 'utf8');
    const productsList = JSON.parse(raw || '[]');

    const product = productsList.find(p => p.ma === id);
    if (!product) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm.' });
    }

    product.isBestSeller = !!isBestSeller;

    // Cập nhật cả cache RAM 'products'
    const cachedProduct = products.find(p => p.ma === id);
    if (cachedProduct) {
      cachedProduct.isBestSeller = !!isBestSeller;
    }

    // Lưu dữ liệu bất đồng bộ qua queue writer an toàn
    await saveProducts(productsList);
    broadcastUpdate('products_updated');

    res.json({ ok: true, message: 'Cập nhật sản phẩm bán chạy thành công.' });
  } catch (err) {
    console.error('Lỗi khi cập nhật bestseller:', err);
    res.status(500).json({ ok: false, message: 'Lỗi máy chủ khi cập nhật sản phẩm bán chạy.' });
  }
});

app.post('/api/admin/products', requireAdmin, upload.single('image'), async (req, res) => {
  const { ma, ten, gia, donvi, loai, trangthai } = req.body || {};
  const cleanMa = String(ma || '').trim();
  const cleanTen = String(ten || '').trim();

  if (!cleanMa) return res.status(400).json({ ok: false, message: 'Vui lòng nhập mã sản phẩm.' });
  if (!cleanTen) return res.status(400).json({ ok: false, message: 'Vui lòng nhập tên sản phẩm.' });
  if (products.some((p) => p.ma === cleanMa)) {
    return res.status(409).json({ ok: false, message: 'Mã sản phẩm đã tồn tại.' });
  }

  const product = {
    stt: products.length + 1,
    ma: cleanMa,
    ten: cleanTen,
    gia: parseInt(gia, 10) || 0,
    donvi: String(donvi || '').trim(),
    loai: String(loai || 'Hàng hóa thường').trim(),
    trangthai: String(trangthai || 'Đang theo dõi').trim(),
  };

  product.updatedAt = Date.now();
  if (req.file) {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const safeCode = cleanMa.replace(/[\\\/:*?"<>|]/g, '_');
    const filename = safeCode + ext;
    try {
      product.image = await uploadImageFile({ ...req.file, filename }, 'products');
      console.log(`✅ Đã upload ảnh sản phẩm: ${filename}`);
    } catch (err) {
      console.error('Lỗi upload ảnh:', err);
      return res.status(500).json({ ok: false, message: 'Lỗi upload ảnh: ' + err.message });
    }
  }

  products.push(product);

  try {
    await saveProducts(products);
    broadcastUpdate('products_updated');
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true, product });
});

// Route chuyên dụng để sửa sản phẩm - đọc mã SP từ query param tránh vấn đề dấu / trong URL
app.put('/api/admin/products/update', requireAdmin, upload.single('image'), async (req, res) => {
  const maParam = req.query.ma;
  const product = products.find((p) => p.ma === maParam);
  if (!product) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm.' });

  const { ten, gia, donvi, loai, trangthai } = req.body || {};
  if (ten !== undefined) product.ten = String(ten).trim();
  if (gia !== undefined) product.gia = parseInt(gia, 10) || 0;
  if (donvi !== undefined) product.donvi = String(donvi).trim();
  if (loai !== undefined) product.loai = String(loai).trim();
  if (trangthai !== undefined) product.trangthai = String(trangthai).trim();

  product.updatedAt = Date.now();
  if (req.file) {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const safeCode = product.ma.replace(/[\\\/:\ *?"<>|]/g, '_');
    const filename = safeCode + ext;
    try {
      const newImagePath = await uploadImageFile({ ...req.file, filename }, 'products');
      // Xóa ảnh cũ nếu khác
      if (product.image && product.image !== newImagePath) {
        const oldFilename = path.basename(product.image);
        await deleteImageFile(oldFilename, 'products');
      }
      product.image = newImagePath;
      console.log(`✅ Đã cập nhật ảnh sản phẩm: ${filename}`);
    } catch (err) {
      console.error('Lỗi upload ảnh:', err);
      return res.status(500).json({ ok: false, message: 'Lỗi upload ảnh: ' + err.message });
    }
  }

  try {
    await saveProducts(products);
    broadcastUpdate('products_updated');
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true, product });
});

// Giữ nguyên route cũ để tương thích ngược
app.put('/api/admin/products/:ma?', requireAdmin, upload.single('image'), async (req, res) => {
  const maParam = req.params.ma || req.query.ma;
  const product = products.find((p) => p.ma === maParam);
  if (!product) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm.' });

  const { ten, gia, donvi, loai, trangthai } = req.body || {};
  if (ten !== undefined) product.ten = String(ten).trim();
  if (gia !== undefined) product.gia = parseInt(gia, 10) || 0;
  if (donvi !== undefined) product.donvi = String(donvi).trim();
  if (loai !== undefined) product.loai = String(loai).trim();
  if (trangthai !== undefined) product.trangthai = String(trangthai).trim();

  product.updatedAt = Date.now();
  if (req.file) {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const safeCode = product.ma.replace(/[\\\/:\ *?"<>|]/g, '_');
    const filename = safeCode + ext;
    try {
      const newImagePath = await uploadImageFile({ ...req.file, filename }, 'products');
      if (product.image && product.image !== newImagePath) {
        const oldFilename = path.basename(product.image);
        await deleteImageFile(oldFilename, 'products');
      }
      product.image = newImagePath;
    } catch (err) {
      return res.status(500).json({ ok: false, message: 'Lỗi upload ảnh: ' + err.message });
    }
  }

  try {
    await saveProducts(products);
    broadcastUpdate('products_updated');
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true, product });
});

// Route chuyên dụng để xóa sản phẩm - đọc mã SP từ query param tránh vấn đề dấu / trong URL
app.delete('/api/admin/products/remove', requireAdmin, async (req, res) => {
  const maParam = req.query.ma;
  const idx = products.findIndex((p) => p.ma === maParam);
  if (idx === -1) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm.' });

  const product = products[idx];
  if (product.image) {
    const filename = path.basename(product.image);
    await deleteImageFile(filename, 'products');
  }

  products.splice(idx, 1);
  try {
    await saveProducts(products);
    broadcastUpdate('products_updated');
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true });
});

// Giữ nguyên route cũ để tương thích ngược
app.delete('/api/admin/products/:ma?', requireAdmin, async (req, res) => {
  const maParam = req.params.ma || req.query.ma;
  const idx = products.findIndex((p) => p.ma === maParam);
  if (idx === -1) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm.' });

  const product = products[idx];
  if (product.image) {
    const filename = path.basename(product.image);
    await deleteImageFile(filename, 'products');
  }

  products.splice(idx, 1);
  try {
    await saveProducts(products);
    broadcastUpdate('products_updated');
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true });
});

app.post('/api/admin/products/import', requireAdmin, async (req, res) => {

  const rows = Array.isArray(req.body) ? req.body : [];
  let added = 0;
  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    const ma = String((row && row.ma) || '').trim();
    const ten = String((row && row.ten) || '').trim();
    if (!ma || !ten) {
      errors++;
      continue;
    }

    const existing = products.find((p) => String(p.ma).trim() === ma);
    if (existing) {
      // Cập nhật thông tin sản phẩm đã tồn tại
      existing.ten = ten;
      existing.gia = parseInt(row.gia, 10) || 0;
      existing.donvi = String(row.donvi || '').trim();
      existing.loai = String(row.loai || existing.loai || 'Hàng hóa thường').trim();
      existing.trangthai = String(row.trangthai || existing.trangthai || 'Đang theo dõi').trim();
      existing.updatedAt = Date.now();
      updated++;
    } else {
      // Thêm sản phẩm mới
      products.push({
        stt: products.length + 1,
        ma,
        ten,
        gia: parseInt(row.gia, 10) || 0,
        donvi: String(row.donvi || '').trim(),
        loai: String(row.loai || 'Hàng hóa thường').trim(),
        trangthai: String(row.trangthai || 'Đang theo dõi').trim(),
        updatedAt: Date.now(),
      });
      added++;
    }
  }

  try {
    await saveProducts(products);
    broadcastUpdate('products_updated');
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true, added, updated, errors });
});

app.post('/api/admin/products/import-images', requireAdmin, uploadFolderImages.array('images', 50), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ ok: false, message: 'Không nhận được file ảnh nào.' });
  }

  let updatedCount = 0;
  let skippedCount = 0;

  for (const file of req.files) {
    const originalName = file.originalname.replace(/\\/g, '/');
    const ext = path.extname(originalName).toLowerCase();
    const code = path.basename(originalName, ext).trim();

    // Tìm sản phẩm tương ứng (không phân biệt hoa thường)
    const product = products.find(p => String(p.ma).trim().toLowerCase() === code.toLowerCase());

    if (product) {
      const filename = code + ext;
      try {
        const newImagePath = await uploadImageFile({ ...file, filename }, 'products');
        // Xóa ảnh cũ nếu khác
        if (product.image) {
          const oldFilename = path.basename(product.image);
          if (oldFilename !== filename) {
            await deleteImageFile(oldFilename, 'products');
          }
        }
        product.image = newImagePath;
        product.updatedAt = Date.now();
        updatedCount++;
      } catch (err) {
        console.error(`Lỗi upload ảnh ${filename}:`, err);
        skippedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  if (updatedCount > 0) {
    try {
      await saveProducts(products);
      broadcastUpdate('products_updated');
    } catch (err) {
      return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu sản phẩm.' });
    }
  }

  res.json({ ok: true, updated: updatedCount, skipped: skippedCount });
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  const { address, phone, email, mapUrl, geminiApiKey, geminiKeySource } = req.body || {};

  if (address !== undefined) settings.address = String(address).trim();
  if (phone !== undefined) settings.phone = String(phone).trim();
  if (email !== undefined) settings.email = String(email).trim();
  if (geminiApiKey !== undefined) settings.geminiApiKey = String(geminiApiKey).trim();
  if (geminiKeySource !== undefined) settings.geminiKeySource = String(geminiKeySource).trim();

  if (mapUrl !== undefined) {
    let cleanMapUrl = String(mapUrl).trim();
    if (cleanMapUrl.includes('<iframe')) {
      const match = cleanMapUrl.match(/src=["']([^"']+)["']/);
      if (match && match[1]) {
        cleanMapUrl = match[1];
      }
    } else if (cleanMapUrl && !cleanMapUrl.includes('output=embed') && !cleanMapUrl.includes('google.com/maps/embed')) {
      // Tự động chuyển đổi địa chỉ hoặc link thường thành link nhúng Google Maps
      cleanMapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(cleanMapUrl)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
    }
    settings.mapUrl = cleanMapUrl;
  }

  try {
    await saveSettings(settings);
    broadcastUpdate('settings_updated');
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu cấu hình.' });
  }
  res.json({ ok: true, settings });
});

app.post('/api/admin/slides', requireAdmin, uploadSlide.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, message: 'Vui lòng chọn ảnh để tải lên.' });
  }

  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const ext = path.extname(req.file.originalname);
  const filename = 'slide-' + uniqueSuffix + ext;

  try {
    const url = await uploadImageFile({ ...req.file, filename }, 'slides');
    console.log(`✅ Đã upload ảnh slide: ${filename}`);
    res.json({ ok: true, url });
  } catch (err) {
    console.error('Lỗi upload slide:', err);
    res.status(500).json({ ok: false, message: 'Lỗi upload ảnh slide: ' + err.message });
  }
});

app.delete('/api/admin/slides', requireAdmin, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ ok: false, message: 'Đường dẫn ảnh không hợp lệ.' });

  const filename = path.basename(url);
  try {
    await deleteImageFile(filename, 'slides');
    res.json({ ok: true });
  } catch (err) {
    console.error('Lỗi xoá slide:', err);
    res.status(500).json({ ok: false, message: 'Không tìm thấy ảnh slide hoặc lỗi khi xoá.' });
  }
});

// =====================================================================
// TOOLS MODULE - PARSE INVOICE PDF WITH GEMINI
// =====================================================================
const uploadInvoice = multer({
  storage: multer.memoryStorage(),
  fileFilter: function (req, file, cb) {
    if (/\.pdf$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file PDF.'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // Giới hạn 5MB
});

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  fileFilter: function (req, file, cb) {
    if (/\.(xlsx|xls)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file Excel (.xlsx hoặc .xls).'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // Giới hạn 10MB
});

function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;

  // Thuật toán Levenshtein distance đơn giản
  const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  const distance = track[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  if (maxLength === 0) return 1.0;
  return (maxLength - distance) / maxLength;
}

app.post('/api/tools/parse-invoice', requireAdmin, uploadInvoice.array('files', 15), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, message: 'Không có file PDF nào được tải lên.' });
    }

    const apiKey = (settings.geminiKeySource === 'custom' && settings.geminiApiKey) ? settings.geminiApiKey : process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, message: 'Chưa cấu hình Gemini API Key trong hệ thống. Vui lòng nhập ở phần Công cụ hoặc kiểm tra cấu hình Azure/file .env.' });
    }

    // Đọc danh sách sản phẩm hiện có
    let systemProducts = [];
    try {
      if (fs.existsSync(PRODUCTS_FILE)) {
        const raw = await fsp.readFile(PRODUCTS_FILE, 'utf8');
        systemProducts = JSON.parse(raw);
      } else {
        const raw = await fsp.readFile(path.join(__dirname, 'data', 'products.json'), 'utf8');
        systemProducts = JSON.parse(raw);
      }
    } catch (err) {
      console.error('Lỗi khi đọc file products.json:', err);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const results = [];

    // Duyệt qua từng file bất đồng bộ
    for (const file of req.files) {
      // Sửa lỗi font tiếng Việt do multer mã hóa tên file bằng latin1 (ISO-8859-1)
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      try {
        const prompt = `Hãy đọc hóa đơn GTGT PDF được cung cấp và trích xuất thông tin chi tiết chính xác theo định dạng JSON sau:
{
  "sellerName": "Tên đơn vị bán hàng",
  "serial": "Ký hiệu hóa đơn (Ký hiệu / Serial)",
  "taxCode": "Mã của cơ quan thuế hoặc Mã số thuế người bán",
  "invoiceDate": {
    "date": "Ngày (dạng số ví dụ: 25)",
    "month": "Tháng (dạng số ví dụ: 06)",
    "year": "Năm (dạng số ví dụ: 2026)"
  },
  "products": [
    {
      "name": "Tên sản phẩm",
      "unit": "ĐVT",
      "quantity": 10,
      "price": 5000,
      "amount": 50000,
      "taxPercent": 10
    }
  ]
}
Lưu ý: "taxPercent" là phần trăm thuế suất GTGT (VAT) áp dụng riêng cho sản phẩm đó (ví dụ: 0, 5, 8, 10). Nếu không ghi thuế hoặc thuế suất là 0% thì trả về 0.`;

        // Gọi API Gemini bằng cấu trúc mảng phẳng (Flat Array) theo SDK mới nhất
        const response = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: file.buffer.toString('base64'),
              mimeType: 'application/pdf'
            }
          }
        ]);

        const textResult = response.response.text();
        const parsed = JSON.parse(textResult);

        // Đối chiếu tên sản phẩm
        if (parsed.products && Array.isArray(parsed.products)) {
          for (const prod of parsed.products) {
            const hasMatch = systemProducts.some(sysP => {
              const sim = calculateSimilarity(prod.name, sysP.ten);
              return sim >= 0.85 || prod.name.toLowerCase().includes(sysP.ten.toLowerCase()) || sysP.ten.toLowerCase().includes(prod.name.toLowerCase());
            });
            if (!hasMatch) {
              prod.isNewSystemProduct = true;
            }
          }
        }

        results.push({
          ok: true,
          fileName: originalName,
          data: parsed
        });

      } catch (err) {
        console.error(`Lỗi xử lý file ${originalName}:`, err);
        results.push({
          ok: false,
          fileName: originalName,
          message: err.message
        });
      } finally {
        // Giải phóng bộ nhớ RAM lập tức cho file này
        file.buffer = null;
      }
    }

    res.json({ ok: true, results });

  } catch (err) {
    console.error('Lỗi API parse-invoice:', err);
    res.status(500).json({ ok: false, message: 'Lỗi máy chủ khi xử lý hóa đơn: ' + err.message });
  }
});

// API lấy danh sách nhà cung cấp
app.get('/api/suppliers', requireAdmin, (req, res) => {
  res.json(suppliers);
});

// API import nhà cung cấp từ file Excel
app.post('/api/suppliers/import', requireAdmin, uploadExcel.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'Không có file nào được tải lên.' });
    }

    // Đọc dữ liệu từ file Excel trong memory buffer
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Trích xuất dữ liệu thô dạng mảng 2 chiều
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (rawData.length < 3) {
      return res.status(400).json({ ok: false, message: 'File Excel không đúng định dạng hoặc không chứa đủ dữ liệu.' });
    }

    // Dòng 3 làm tiêu đề (index 2), dòng 4 trở đi là data (index 3+)
    const headers = rawData[2];

    const colMap = {
      code: headers.findIndex(h => String(h || '').trim() === 'Mã nhà cung cấp'),
      name: headers.findIndex(h => String(h || '').trim() === 'Tên nhà cung cấp'),
      phone: headers.findIndex(h => String(h || '').trim() === 'Số điện thoại'),
      status: headers.findIndex(h => String(h || '').trim() === 'Trạng thái')
    };

    if (colMap.code === -1 || colMap.name === -1) {
      return res.status(400).json({
        ok: false,
        message: 'File Excel thiếu các cột bắt buộc: "Mã nhà cung cấp", "Tên nhà cung cấp".'
      });
    }

    let addedCount = 0;
    let updatedCount = 0;

    // Đọc danh sách hiện tại từ bộ nhớ đệm
    const currentSuppliers = [...suppliers];

    for (let i = 3; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const code = String(row[colMap.code] || '').trim();
      const name = String(row[colMap.name] || '').trim();
      if (!code || !name) continue;

      const phone = colMap.phone !== -1 ? String(row[colMap.phone] || '').trim() : '';
      const status = colMap.status !== -1 ? String(row[colMap.status] || '').trim() : 'Đang theo dõi';

      const existingIndex = currentSuppliers.findIndex(s => s.code === code);
      if (existingIndex !== -1) {
        currentSuppliers[existingIndex] = { code, name, phone, status };
        updatedCount++;
      } else {
        currentSuppliers.push({ code, name, phone, status });
        addedCount++;
      }
    }

    // Cập nhật cache và ghi file qua queued writer bảo vệ I/O
    suppliers = currentSuppliers;
    await saveSuppliers(suppliers);

    res.json({
      ok: true,
      message: `Import thành công! Thêm mới: ${addedCount}, Cập nhật: ${updatedCount}`,
      added: addedCount,
      updated: updatedCount
    });

  } catch (err) {
    console.error('Lỗi API import nhà cung cấp:', err);
    res.status(500).json({ ok: false, message: 'Lỗi xử lý file Excel: ' + err.message });
  } finally {
    if (req.file) {
      req.file.buffer = null;
    }
  }
});

// API xuất file Excel nhập kho từ hóa đơn GTGT
app.post('/api/tools/export-inventory', requireAdmin, async (req, res) => {
  try {
    let invoices = req.body;
    if (!invoices) {
      return res.status(400).json({ ok: false, message: 'Dữ liệu hóa đơn không hợp lệ.' });
    }

    if (!Array.isArray(invoices)) {
      invoices = [invoices];
    }

    // Đọc file template
    const templatePath = path.join(__dirname, 'data', 'template', 'Nhap_khau_phieu_nhap_kho.xlsx');
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy file template Nhap_khau_phieu_nhap_kho.xlsx' });
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.getWorksheet(1);

    // Đọc danh sách nhà cung cấp hệ thống để đối chiếu
    let suppliersList = [];
    try {
      if (fs.existsSync(SUPPLIERS_FILE)) {
        const raw = await fsp.readFile(SUPPLIERS_FILE, 'utf8');
        suppliersList = JSON.parse(raw);
      }
    } catch (err) {
      console.error('Lỗi đọc file suppliers.json:', err);
    }

    // Đọc danh sách sản phẩm hệ thống để đối chiếu
    let systemProducts = [];
    try {
      if (fs.existsSync(PRODUCTS_FILE)) {
        const raw = await fsp.readFile(PRODUCTS_FILE, 'utf8');
        systemProducts = JSON.parse(raw);
      }
    } catch (err) {
      console.error('Lỗi đọc file products.json:', err);
    }

    const normalizeName = (str) => {
      if (!str) return '';
      return str.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,-]/g, '')
        .trim();
    };

    // Xác định cấu trúc cột động từ dòng 8 của template
    let headerRowNumber = 8;
    let colIndices = {
      date: 2,       // B
      serial: 3,     // C
      supplierCode: 4, // D
      supplierName: 5, // E
      description: 6,  // F
      paymentMethod: 7, // G
      productCode: 8,  // H
      productName: 9,  // I
      warehouseCode: 12, // L
      unit: 14,        // N
      quantity: 15,    // O
      price: 16,       // P (Assuming P is price and Q is amount)
      amount: 17,      // Q
      discountPercent: 18, // R
      discountAmount: 19,  // S
      taxPercent: 20,      // T
      taxAmount: 21,       // U
      paymentAmount: 22    // V
    };

    const headerRow = worksheet.getRow(8);
    headerRow.eachCell((cell, colNumber) => {
      let rawVal = '';
      if (cell.value && cell.value.richText) {
        rawVal = cell.value.richText.map(rt => rt.text).join('');
      } else {
        rawVal = String(cell.value || '');
      }
      const val = rawVal.toLowerCase().trim();
      
      if (val.includes('tên') && (val.includes('sản phẩm') || val.includes('hàng') || val.includes('vật tư'))) {
        colIndices.productName = colNumber;
      }
      if (val.includes('đơn vị tính') || val === 'đvt') {
        colIndices.unit = colNumber;
      }
      if (val.includes('số lượng')) {
        colIndices.quantity = colNumber;
      }
      if (val.includes('đơn giá')) {
        colIndices.price = colNumber;
      }
      if (val.includes('thành tiền')) {
        colIndices.amount = colNumber;
      }
      if (val.includes('ngày')) {
        colIndices.date = colNumber;
      }
      if (val.includes('số chứng từ') || val.includes('số hóa đơn') || val.includes('ký hiệu')) {
        colIndices.serial = colNumber;
      }
      if (val.includes('mã đối tượng') || val.includes('mã nhà cung cấp') || val.includes('mã khách')) {
        colIndices.supplierCode = colNumber;
      }
      if (val.includes('tên đối tượng') || val.includes('tên nhà cung cấp') || val.includes('tên khách')) {
        colIndices.supplierName = colNumber;
      }
      if (val.includes('mã sản phẩm') || val.includes('mã hàng') || val.includes('mã vật tư')) {
        colIndices.productCode = colNumber;
      }
      if (val.includes('hình thức') || val === 'hình thức thanh toán') {
        colIndices.paymentMethod = colNumber;
      }
      if (val.includes('thuế suất') || val === 'thuế (%)' || val === '% thuế') {
        colIndices.taxPercent = colNumber;
      }
      if (val.includes('tiền thuế') || val.includes('thuế gtgt')) {
        if (!val.includes('suất') && !val.includes('%')) {
          colIndices.taxAmount = colNumber;
        }
      }
    });

    // Các giá trị dự phòng (fallback) nếu scanner không tìm thấy tiêu đề tương ứng
    colIndices.date = colIndices.date || 2;
    colIndices.serial = colIndices.serial || 3;
    colIndices.supplierCode = colIndices.supplierCode || 4;
    colIndices.supplierName = colIndices.supplierName || 5;
    colIndices.description = colIndices.description || 6;
    colIndices.paymentMethod = colIndices.paymentMethod || 7;
    colIndices.productCode = colIndices.productCode || 8;
    colIndices.productName = colIndices.productName || 9;
    colIndices.warehouseCode = colIndices.warehouseCode || 12;
    colIndices.unit = colIndices.unit || 14;
    colIndices.quantity = colIndices.quantity || 15;
    colIndices.price = colIndices.price || 16;
    colIndices.amount = colIndices.amount || 17;

    // Hàng dữ liệu mẫu đầu tiên (Hàng 9)
    const firstDataRow = worksheet.getRow(9);
    const defaultColA = firstDataRow.getCell(1).value;  // Cột A: Loại nhập kho mẫu
    const defaultColL = firstDataRow.getCell(colIndices.warehouseCode || 12).value; // Cột L: Mã kho mẫu

    let currentRow = headerRowNumber + 1;

    for (const inv of invoices) {
      // 1. Logic dò tìm Mã nhà cung cấp (Cột D) và Tên đối tượng (Cột E)
      const sellerNameNormalized = normalizeName(inv.sellerName);
      const foundSupplier = suppliersList.find(s => normalizeName(s.name) === sellerNameNormalized);

      let supplierCode = 'NCC_MOI';
      let supplierName = inv.sellerName || 'N/A';

      if (foundSupplier) {
        supplierCode = foundSupplier.code;
        supplierName = foundSupplier.name;
      }

      // 2. Xử lý Cột Diễn giải (Cột F) - Tính "Lần N" trong tháng của NCC
      let orderCountInMonth = 1;
      try {
        const monthNum = inv.invoiceDate ? Number(inv.invoiceDate.month) : null;
        const yearNum = inv.invoiceDate ? Number(inv.invoiceDate.year) : null;
        if (monthNum && yearNum && orders) {
          const matchedOrders = orders.filter(o => {
            if (!o.createdAt) return false;
            const oDate = new Date(o.createdAt);
            const oMonth = oDate.getMonth() + 1;
            const oYear = oDate.getFullYear();
            return oMonth === monthNum && oYear === yearNum && normalizeName(o.supplierName || o.customer || '') === sellerNameNormalized;
          });
          orderCountInMonth = matchedOrders.length + 1;
        }
      } catch (e) {
        console.error('Lỗi tính Lần N nhập kho:', e);
      }

      const monthStr = inv.invoiceDate ? String(inv.invoiceDate.month).padStart(2, '0') : 'N/A';
      const descriptionText = `Nhập kho tháng ${monthStr} từ nhà cung cấp ${supplierName} Lần ${orderCountInMonth}`;

      // Định dạng ngày chứng từ DD/MM/YYYY
      let dateStr = '';
      if (inv.invoiceDate) {
        const d = String(inv.invoiceDate.date || '').padStart(2, '0');
        const m = String(inv.invoiceDate.month || '').padStart(2, '0');
        const y = inv.invoiceDate.year || '';
        if (d && m && y) dateStr = `${d}/${m}/${y}`;
      }

      const products = inv.products || [];
      for (let pIdx = 0; pIdx < products.length; pIdx++) {
        const p = products[pIdx];
        const row = worksheet.getRow(currentRow);

        // Nếu vượt số dòng ban đầu của mẫu, sao chép định dạng từ Dòng 9
        if (currentRow > 9) {
          row.height = firstDataRow.height;
          firstDataRow.eachCell({ includeEmpty: true }, (srcCell, colNumber) => {
            const destCell = row.getCell(colNumber);
            destCell.style = srcCell.style;
          });
        }

        // Điền giá trị mặc định cho Cột A và Cột L
        row.getCell(1).value = defaultColA;
        if (colIndices.warehouseCode) {
          row.getCell(colIndices.warehouseCode).value = defaultColL;
        }

        // Điền các cột chung từ hóa đơn
        if (colIndices.date) row.getCell(colIndices.date).value = dateStr;
        if (colIndices.serial) row.getCell(colIndices.serial).value = inv.serial || '';
        if (colIndices.supplierCode) row.getCell(colIndices.supplierCode).value = supplierCode;
        if (colIndices.supplierName) row.getCell(colIndices.supplierName).value = supplierName;

        // Cột F (Diễn giải) và Cột G (Hình thức thanh toán): Fill đầy đủ cho mọi dòng sản phẩm
        if (colIndices.description) {
          row.getCell(colIndices.description).value = descriptionText;
        }
        if (colIndices.paymentMethod) {
          row.getCell(colIndices.paymentMethod).value = inv.paymentMethod || 'Tiền mặt';
        }

        // 3. Logic đối chiếu sản phẩm trong hệ thống (yêu cầu trùng khớp các con số như 100mm, 150mm...)
        const systemMatch = systemProducts.find(sysP => {
          const pNums = (p.name.match(/\d+/g) || []).join(',');
          const sysNums = (sysP.ten.match(/\d+/g) || []).join(',');
          if (pNums !== sysNums) return false; // Loại trừ nếu thông số kích thước/số số lượng khác nhau

          const sim = calculateSimilarity(p.name, sysP.ten);
          return sim >= 0.85 || p.name.toLowerCase().includes(sysP.ten.toLowerCase()) || sysP.ten.toLowerCase().includes(p.name.toLowerCase());
        });

        let pCode = 'SP_MOI';
        let pName = p.name || '';
        if (systemMatch) {
          pCode = systemMatch.ma;
          pName = systemMatch.ten;
        }

        // Hàm chuyển đổi chuỗi số có định dạng nghìn/thập phân kiểu Việt Nam/Anh thành số chuẩn JS
        const parseCleanNumber = (val) => {
          if (val === undefined || val === null) return 0;
          if (typeof val === 'number') return val;
          let str = String(val).replace(/[^0-9.,-]/g, '').trim();
          
          const lastDot = str.lastIndexOf('.');
          const lastComma = str.lastIndexOf(',');
          
          if (lastComma > lastDot) {
            // Định dạng kiểu VN: 80.000.000,00 -> xóa chấm, thay phẩy thành chấm
            str = str.replace(/\./g, '').replace(/,/g, '.');
          } else if (lastDot > lastComma) {
            // Định dạng kiểu Anh: 80,000,000.00 -> xóa phẩy
            str = str.replace(/,/g, '');
          } else {
            // Chỉ chứa 1 loại ký tự phân cách nghìn
            str = str.replace(/[.,]/g, '');
          }
          
          const num = parseFloat(str);
          return isNaN(num) ? 0 : num;
        };

        const qty = parseCleanNumber(p.quantity);
        const price = parseCleanNumber(p.price);
        const amount = parseCleanNumber(p.amount);

        if (colIndices.productCode) row.getCell(colIndices.productCode).value = pCode;
        if (colIndices.productName) row.getCell(colIndices.productName).value = pName;
        if (colIndices.unit) row.getCell(colIndices.unit).value = p.unit || '';
        if (colIndices.quantity) row.getCell(colIndices.quantity).value = qty;
        if (colIndices.price) row.getCell(colIndices.price).value = price;
        if (colIndices.amount) row.getCell(colIndices.amount).value = amount;

        // Tính thuế và điền vào các cột tương ứng
        const taxRate = p.taxPercent !== undefined ? Number(p.taxPercent) : 0;
        const taxAmt = Math.round(amount * taxRate / 100);

        if (colIndices.discountPercent) row.getCell(colIndices.discountPercent).value = 0;
        if (colIndices.discountAmount) row.getCell(colIndices.discountAmount).value = 0;
        if (colIndices.taxPercent) row.getCell(colIndices.taxPercent).value = taxRate / 100;
        if (colIndices.taxAmount) row.getCell(colIndices.taxAmount).value = taxAmt;
        if (colIndices.paymentAmount) row.getCell(colIndices.paymentAmount).value = amount + taxAmt;

        row.commit();
        currentRow++;
      }
    }

    // Thiết lập Header tải file về
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Nhap_khau_phieu_nhap_kho_export.xlsx');

    // Ghi trực tiếp vào response stream
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Lỗi API export-inventory:', err);
    res.status(500).json({ ok: false, message: 'Lỗi máy chủ khi xuất Excel: ' + err.message });
  }
});

// ---------------------------------------------------------------------
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    console.log(`🔐 Trang quản trị: http://localhost:${PORT}${ADMIN_PATH}`);
    console.log(`💾 Dữ liệu lưu tại: ${DATA_DIR}`);
  });
}

module.exports = app;
