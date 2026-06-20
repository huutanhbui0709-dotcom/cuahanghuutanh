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
const rateLimitModule = require('express-rate-limit');
const rateLimit = rateLimitModule.rateLimit || rateLimitModule.default || rateLimitModule;
const multer = require('multer');
const { uploadImageFile, deleteImageFile, USE_BLOB, vercelBlob } = require('./lib/storage');

const IS_VERCEL = !!process.env.VERCEL;

const BUNDLED_DATA_DIR = path.join(__dirname, 'data');

let defaultDataDir = BUNDLED_DATA_DIR;
if (process.env.WEBSITE_SITE_NAME) {
  const azureHome = process.env.HOME || (process.env.HOMEDRIVE && process.env.HOMEPATH ? process.env.HOMEDRIVE + process.env.HOMEPATH : null);
  if (azureHome) {
    defaultDataDir = path.join(azureHome, 'data', 'cuahanghuutanh');
  }
}

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : defaultDataDir;

const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
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
        } catch (err) {}
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
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSONSync(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function makeQueuedWriter(filePath, blobPath) {
  let queue = Promise.resolve();
  return function write(data) {
    queue = queue
      .catch(() => {}) // không để lỗi trước đó chặn lần ghi sau
      .then(async () => {
        await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        if (USE_BLOB) {
          try {
            await vercelBlob.put(blobPath, JSON.stringify(data, null, 2), {
              access: 'public',
              addRandomSuffix: false
            });
            console.log(`☁️ Đã đồng bộ lên Vercel Blob: ${blobPath}`);
          } catch (err) {
            console.error(`❌ Lỗi đồng bộ lên Blob ${blobPath}:`, err.message);
          }
        }
      });
    return queue;
  };
}

ensureDirSync(DATA_DIR);
ensureDirSync(SLIDE_IMG_DIR);

// Nếu chưa có products.json trong DATA_DIR, dùng dữ liệu mẫu đi kèm repo
// (trường hợp DATA_DIR được trỏ tới 1 ổ đĩa mới gắn lần đầu).
if (!fs.existsSync(PRODUCTS_FILE)) {
  const seed = fs.existsSync(BUNDLED_PRODUCTS_SEED)
    ? fs.readFileSync(BUNDLED_PRODUCTS_SEED, 'utf8')
    : '[]';
  fs.writeFileSync(PRODUCTS_FILE, seed, 'utf8');
  console.log('📦 Đã tạo products.json mới từ dữ liệu mẫu tại:', PRODUCTS_FILE);
}
if (!fs.existsSync(ORDERS_FILE)) {
  const seedOrders = path.join(BUNDLED_DATA_DIR, 'orders.json');
  const seed = fs.existsSync(seedOrders)
    ? fs.readFileSync(seedOrders, 'utf8')
    : '[]';
  fs.writeFileSync(ORDERS_FILE, seed, 'utf8');
  console.log('📋 Đã tạo orders.json mới từ dữ liệu mẫu tại:', ORDERS_FILE);
}
if (!fs.existsSync(SETTINGS_FILE)) {
  const seedSettings = path.join(BUNDLED_DATA_DIR, 'settings.json');
  if (fs.existsSync(seedSettings)) {
    fs.writeFileSync(SETTINGS_FILE, fs.readFileSync(seedSettings, 'utf8'), 'utf8');
  } else {
    const defaultSettings = {
      address: "Thị trấn Thốt Nốt, Quận Thốt Nốt, Thành phố Cần Thơ",
      phone: "0945 592 209",
      email: "diennuochuutanh@gmail.com",
      mapUrl: "https://maps.google.com/maps?q=C%E1%BB%ADa%20h%C3%A0ng%20%C4%91i%E1%BB%87n%20n%C6%B0%E1%BB%9Bc%20H%E1%BB%AFu%20T%C3%A1nh,%20Th%E1%BB%91t%20N%E1%BB%91t,%20C%E1%BA%A7n%20Th%C6%A1&t=&z=15&ie=UTF8&iwloc=&output=embed"
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), 'utf8');
  }
  console.log('⚙️ Đã tạo settings.json mới tại:', SETTINGS_FILE);
}

let products = readJSONSync(PRODUCTS_FILE, []);
let orders = readJSONSync(ORDERS_FILE, []);
let settings = readJSONSync(SETTINGS_FILE, {
  address: "Thị trấn Thốt Nốt, Quận Thốt Nốt, Thành phố Cần Thơ",
  phone: "0945 592 209",
  email: "diennuochuutanh@gmail.com",
  mapUrl: "https://maps.google.com/maps?q=C%E1%BB%ADa%20h%C3%A0ng%20%C4%91i%E1%BB%87n%20n%C6%B0%E1%BB%9Bc%20H%E1%BB%AFu%20T%C3%A1nh,%20Th%E1%BB%91t%20N%E1%BB%91t,%20C%E1%BA%A7n%20Th%C6%A1&t=&z=15&ie=UTF8&iwloc=&output=embed"
});

const saveProducts = makeQueuedWriter(PRODUCTS_FILE, 'data/products.json');
const saveOrders = makeQueuedWriter(ORDERS_FILE, 'data/orders.json');
const saveSettings = makeQueuedWriter(SETTINGS_FILE, 'data/settings.json');

let isInitialized = false;
let initPromise = null;

async function initializeData() {
  // Khởi tạo từ file cục bộ trước làm fallback
  products = readJSONSync(PRODUCTS_FILE, products);
  orders = readJSONSync(ORDERS_FILE, orders);
  settings = readJSONSync(SETTINGS_FILE, settings);

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
    } catch (err) {
      console.error('❌ Lỗi đồng bộ dữ liệu từ Blob:', err);
    }
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

// ---------------------------------------------------------------------
// APP
// ---------------------------------------------------------------------
const app = express();
app.set('trust proxy', 1); // cần thiết khi chạy sau proxy của Railway/Render

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

// ---------------------------------------------------------------------
// PHỤC VỤ FILE TĨNH (trang khách hàng, css, js dùng chung)
// ---------------------------------------------------------------------
// Phục vụ hình ảnh được tải lên từ thư mục bền vững (persistent directory)
app.use('/img', express.static(IMG_DIR));

if (IS_VERCEL) {
  app.use(express.static('/tmp/public'));
}
app.use(express.static(path.join(__dirname, 'public')));

// Trang quản trị KHÔNG nằm trong /public nên không thể truy cập trực tiếp
// qua đường dẫn file - chỉ phục vụ qua đúng ADMIN_PATH cấu hình ở .env
const ADMIN_HTML_PATH = path.join(__dirname, 'private', 'admin.html');
let adminHtmlCache = null;

app.get(ADMIN_PATH, (req, res) => {
  try {
    if (!adminHtmlCache) {
      adminHtmlCache = fs.readFileSync(ADMIN_HTML_PATH, 'utf8');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(adminHtmlCache);
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
  res.json(settings);
});

app.get('/api/slides', async (req, res) => {
  const dir = SLIDE_IMG_DIR;
  const bundledDir = path.join(__dirname, 'public', 'img', 'Slide_img');
  try {
    let files = [];
    if (fs.existsSync(dir)) {
      files = await fsp.readdir(dir);
    }
    // Lọc chỉ lấy các file định dạng ảnh
    let images = files
      .filter(f => /\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(f))
      .map(f => '/img/Slide_img/' + f);
      
    // Nếu trong thư mục ghi đè không có slide nào, lấy từ thư mục mẫu của repo
    if (images.length === 0 && fs.existsSync(bundledDir)) {
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
  const { customer, phone, address, note, items } = req.body || {};

  const cName = String(customer || '').trim();
  const cPhone = String(phone || '').trim();
  const cAddress = String(address || '').trim();
  const cNote = String(note || '').trim();

  if (!cName) return res.status(400).json({ ok: false, message: 'Vui lòng nhập họ tên.' });
  if (!cPhone) return res.status(400).json({ ok: false, message: 'Vui lòng nhập số điện thoại.' });
  if (!cAddress) return res.status(400).json({ ok: false, message: 'Vui lòng nhập địa chỉ giao hàng.' });
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
  };

  orders.unshift(order);
  try {
    await saveOrders(orders);
  } catch (err) {
    console.error('Lỗi lưu đơn hàng:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi lưu đơn hàng, vui lòng thử lại.' });
  }

  res.json({ ok: true, order });
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
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true });
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

  if (req.file) {
    const ext = path.extname(req.file.originalname);
    const filename = cleanMa + ext;
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
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true, product });
});

app.put('/api/admin/products/:ma', requireAdmin, upload.single('image'), async (req, res) => {
  const product = products.find((p) => p.ma === req.params.ma);
  if (!product) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm.' });

  const { ten, gia, donvi, loai, trangthai } = req.body || {};
  if (ten !== undefined) product.ten = String(ten).trim();
  if (gia !== undefined) product.gia = parseInt(gia, 10) || 0;
  if (donvi !== undefined) product.donvi = String(donvi).trim();
  if (loai !== undefined) product.loai = String(loai).trim();
  if (trangthai !== undefined) product.trangthai = String(trangthai).trim();

  if (req.file) {
    const ext = path.extname(req.file.originalname);
    const filename = product.ma + ext;
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
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true, product });
});

app.delete('/api/admin/products/:ma', requireAdmin, async (req, res) => {
  const idx = products.findIndex((p) => p.ma === req.params.ma);
  if (idx === -1) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm.' });

  const product = products[idx];
  if (product.image) {
    const filename = path.basename(product.image);
    await deleteImageFile(filename, 'products');
  }

  products.splice(idx, 1);
  try {
    await saveProducts(products);
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
      });
      added++;
    }
  }

  try {
    await saveProducts(products);
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
    const ext = path.extname(originalName);
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
    } catch (err) {
      return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu sản phẩm.' });
    }
  }

  res.json({ ok: true, updated: updatedCount, skipped: skippedCount });
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  const { address, phone, email, mapUrl } = req.body || {};
  
  if (address !== undefined) settings.address = String(address).trim();
  if (phone !== undefined) settings.phone = String(phone).trim();
  if (email !== undefined) settings.email = String(email).trim();
  
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

// ---------------------------------------------------------------------
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    console.log(`🔐 Trang quản trị: http://localhost:${PORT}${ADMIN_PATH}`);
    console.log(`💾 Dữ liệu lưu tại: ${DATA_DIR}`);
  });
}

module.exports = app;
