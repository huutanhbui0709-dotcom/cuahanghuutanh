// =====================================================================
// CỬA HÀNG VẬT TƯ KỸ THUẬT - SERVER
// Express + lưu dữ liệu bằng file JSON (không cần database).
// Trang quản trị có URL riêng, yêu cầu đăng nhập bằng mật khẩu.
// =====================================================================

require('dotenv').config();

// Monkey-patch ExcelJS lazily để tránh crash khi Conditional Formatting trong template MISA bị lỗi

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
const { uploadImageFile, deleteImageFile, listFiles } = require('./lib/storage');
const { sendOrderNotification } = require('./lib/mailer');
const { neon } = require('@neondatabase/serverless');
const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const sql = dbUrl ? neon(dbUrl, { fullResults: true }) : null;

const IS_VERCEL = !!process.env.VERCEL;

// Tính toán DATA_DIR giống hệt để đảm bảo ảnh lưu đúng chỗ
// Thư mục mặc định khi chạy dưới máy local của bồ
const BUNDLED_DATA_DIR = path.join(__dirname, 'data');
let defaultDataDir = BUNDLED_DATA_DIR;

if (IS_VERCEL) {
  defaultDataDir = '/tmp/data';
} else if (process.env.WEBSITE_SITE_NAME) {
  // Trên Azure Linux, biến process.env.HOME luôn luôn là '/home'
  // Thư mục '/home/site/' là vùng ĐỘC LẬP, vĩnh viễn không bị GitHub Actions đè dữ liệu
  defaultDataDir = path.join('/home', 'site', 'cuahang_data_benvung');
}

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : defaultDataDir;

const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SPAM_DEVICES_FILE = path.join(DATA_DIR, 'spam_devices.json');
const SUPPLIERS_FILE = path.join(DATA_DIR, 'suppliers.json');
const STOCK_RECEIPTS_FILE = path.join(DATA_DIR, 'stock_receipts.json');
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
  // Giới hạn 4MB/file (Vercel Hobby giới hạn request body 4.5MB tổng cộng).
  // Client phải gửi từng file một để đảm bảo không vượt ngưỡng.
  limits: { fileSize: 4 * 1024 * 1024, files: 3 }
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

function makeQueuedWriter(filePath, dbKey) {
  let queue = Promise.resolve();
  return function write(data) {
    if (IS_VERCEL) {
      // Trên Vercel: persist vào Vercel DB (bảng app_settings) thay vì file
      // Nếu dbKey là null, bỏ qua (orders/spamDevices có đường ghi riêng)
      if (!dbKey) return Promise.resolve();
      queue = queue
        .catch(() => { })
        .then(async () => {
          try {
            const content = JSON.stringify(data);
            await sql`
              INSERT INTO app_settings (key, value, updated_at)
              VALUES (${dbKey}, ${content}, NOW())
              ON CONFLICT (key) DO UPDATE
                SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
            `;
          } catch (err) {
            console.error(`❌ Lỗi ghi DB (${dbKey}):`, err.message);
          }
        });
      return queue;
    }
    // Local: ghi ra file
    queue = queue
      .catch(() => { }) // không để lỗi trước đó chặn lần ghi sau
      .then(async () => {
        try {
          const content = JSON.stringify(data, null, 2);
          await fsp.writeFile(filePath, content, 'utf8');
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
let stockReceipts = [];

const deviceOrderAttempts = new Map();
const blockedDevices = new Map();

// Trên Vercel: products/settings/suppliers lưu vào bảng app_settings.
// orders và spamDevices được ghi trực tiếp theo từng hành động vào bảng riêng.
const saveProducts = makeQueuedWriter(PRODUCTS_FILE, 'products');
const saveOrders = makeQueuedWriter(ORDERS_FILE, null); // orders ghi trực tiếp vào bảng orders
const saveSettings = makeQueuedWriter(SETTINGS_FILE, 'settings');
const saveSpamDevices = makeQueuedWriter(SPAM_DEVICES_FILE, null); // visitor_activity ghi trực tiếp
const saveSuppliers = makeQueuedWriter(SUPPLIERS_FILE, 'suppliers');
const saveStockReceipts = makeQueuedWriter(STOCK_RECEIPTS_FILE, null);

// seedImagesFromPublic() removed — images are now stored in Vercel Blob, not local FS.

let isInitialized = false;
let initPromise = null;

async function initDbSchema() {
  if (!IS_VERCEL) return;
  try {
    // Bảng đơn hàng
    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(100) PRIMARY KEY,
        created_at VARCHAR(100),
        customer VARCHAR(100),
        phone VARCHAR(100),
        address TEXT,
        note TEXT,
        items JSONB,
        total NUMERIC,
        status VARCHAR(50),
        device_id VARCHAR(100),
        visitor_id VARCHAR(100)
      );
    `;
    // Bảng theo dõi thiết bị spam
    await sql`
      CREATE TABLE IF NOT EXISTS visitor_activity (
        visitor_id VARCHAR(100) PRIMARY KEY,
        device_id VARCHAR(100),
        ip VARCHAR(100),
        fingerprint VARCHAR(100),
        lock_until BIGINT DEFAULT 0,
        attempts JSONB DEFAULT '[]'::jsonb,
        count INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Normal',
        last_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    // Bảng lưu JSON data (products, settings, suppliers, ...)
    await sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(200) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    // Bảng theo dõi thời điểm cập nhật gần nhất của từng loại dữ liệu (dùng cho polling)
    await sql`
      CREATE TABLE IF NOT EXISTS last_updates (
        topic VARCHAR(50) PRIMARY KEY,
        updated_at BIGINT NOT NULL
      );
    `;
    // Bảng phiếu nhập kho
    await sql`
      CREATE TABLE IF NOT EXISTS stock_receipts (
        id SERIAL PRIMARY KEY,
        receipt_code VARCHAR(100),
        import_date VARCHAR(100),
        supplier_name TEXT,
        note TEXT,
        warehouse_name TEXT,
        total_amount NUMERIC DEFAULT 0,
        invoice_number VARCHAR(100),
        serial_number VARCHAR(100),
        tax_code VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    // Thêm cột mới nếu bảng đã tồn tại (idempotent migration)
    await sql`ALTER TABLE stock_receipts ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100)`;
    await sql`ALTER TABLE stock_receipts ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100)`;
    await sql`ALTER TABLE stock_receipts ADD COLUMN IF NOT EXISTS tax_code VARCHAR(100)`;
    // Bảng chi tiết phiếu nhập kho
    await sql`
      CREATE TABLE IF NOT EXISTS stock_receipt_items (
        id SERIAL PRIMARY KEY,
        receipt_id INTEGER REFERENCES stock_receipts(id) ON DELETE CASCADE,
        product_sku VARCHAR(100),
        product_name TEXT,
        unit VARCHAR(50),
        quantity NUMERIC DEFAULT 0,
        unit_price NUMERIC DEFAULT 0,
        tax_rate NUMERIC DEFAULT 0,
        total_price NUMERIC DEFAULT 0,
        import_cost NUMERIC DEFAULT 0
      );
    `;
    console.log('✅ Vercel DB tables initialized successfully.');
  } catch (err) {
    console.error('❌ Lỗi tạo table trong Vercel DB:', err);
  }
}


async function initializeData() {
  try {
    if (IS_VERCEL) {
      // ================================================================
      // Môi trường Vercel: tất cả data từ Vercel DB, không dùng filesystem
      // ================================================================
      
      // Luôn đồng bộ schema khi khởi động (idempotent, an toàn)
      await initDbSchema();

      // Chạy song song các truy vấn tải dữ liệu chính để giảm thiểu roundtrip latency
      const results = await Promise.allSettled([
        sql`SELECT value FROM app_settings WHERE key = 'products'`,
        sql`SELECT value FROM app_settings WHERE key = 'settings'`,
        sql`SELECT value FROM app_settings WHERE key = 'suppliers'`,
        sql`SELECT * FROM orders ORDER BY created_at DESC`,
        sql`SELECT * FROM visitor_activity WHERE lock_until > ${Date.now()}`
      ]);

      const [prodRes, setRes, supRes, orderRes, visitorRes] = results;

      // 1. Parse products từ kết quả
      if (prodRes.status === 'fulfilled' && prodRes.value.rows.length > 0) {
        products = JSON.parse(prodRes.value.rows[0].value);
        console.log(`✅ Loaded ${products.length} products from Vercel DB.`);
      } else {
        try {
          const raw = await fsp.readFile(BUNDLED_PRODUCTS_SEED, 'utf8');
          products = JSON.parse(raw);
        } catch {
          products = [];
        }
        if (prodRes.status === 'fulfilled') {
          await sql`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('products', ${JSON.stringify(products)}, NOW())
            ON CONFLICT (key) DO NOTHING
          `.catch(e => console.error('Lỗi seed products:', e));
        }
        console.log(`📦 Seeded/Loaded default ${products.length} products.`);
      }

      // 2. Parse settings từ kết quả
      if (setRes.status === 'fulfilled' && setRes.value.rows.length > 0) {
        settings = JSON.parse(setRes.value.rows[0].value);
        console.log('✅ Loaded settings from Vercel DB.');
      } else {
        if (setRes.status === 'fulfilled') {
          await sql`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('settings', ${JSON.stringify(settings)}, NOW())
            ON CONFLICT (key) DO NOTHING
          `.catch(e => console.error('Lỗi seed settings:', e));
        }
        console.log('⚙️ Seeded/Loaded default settings.');
      }

      // 3. Parse suppliers từ kết quả
      if (supRes.status === 'fulfilled' && supRes.value.rows.length > 0) {
        suppliers = JSON.parse(supRes.value.rows[0].value);
        console.log(`✅ Loaded ${suppliers.length} suppliers from Vercel DB.`);
      } else {
        if (supRes.status === 'fulfilled') {
          await sql`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('suppliers', '[]', NOW())
            ON CONFLICT (key) DO NOTHING
          `.catch(e => console.error('Lỗi seed suppliers:', e));
        }
        suppliers = [];
        console.log('📦 Seeded/Loaded default suppliers.');
      }

      // 4. Parse orders từ kết quả
      if (orderRes.status === 'fulfilled') {
        orders = orderRes.value.rows.map(r => ({
          id: r.id,
          createdAt: r.created_at,
          customer: r.customer,
          phone: r.phone,
          address: r.address,
          note: r.note,
          items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
          total: Number(r.total),
          status: r.status,
          deviceId: r.device_id,
          visitorId: r.visitor_id
        }));
        console.log(`✅ Loaded ${orders.length} orders from Vercel DB.`);
      } else {
        console.error('❌ Lỗi load orders từ Vercel DB:', orderRes.reason);
        orders = [];
      }

      // 5. Parse spam visitor activity từ kết quả
      if (visitorRes.status === 'fulfilled') {
        blockedDevices.clear();
        spamDevices = visitorRes.value.rows.map(r => ({
          deviceId: r.device_id,
          fingerprint: r.fingerprint,
          ip: r.ip,
          count: r.count,
          time: r.last_time,
          status: r.status,
          lockUntil: Number(r.lock_until)
        }));
        spamDevices.forEach(entry => {
          if (entry.lockUntil && entry.lockUntil > Date.now()) {
            if (entry.deviceId) blockedDevices.set(entry.deviceId, entry.lockUntil);
            if (entry.ip) blockedDevices.set(entry.ip, entry.lockUntil);
            if (entry.fingerprint) blockedDevices.set(entry.fingerprint, entry.lockUntil);
          }
        });
        console.log(`✅ Loaded ${spamDevices.length} blocked visitors from Vercel DB.`);
      } else {
        console.error('❌ Lỗi load spamDevices từ Vercel DB:', visitorRes.reason);
        spamDevices = [];
      }

    } else {
      // ================================================================
      // Môi trường Local: dùng filesystem JSON
      // ================================================================
      await fsp.mkdir(DATA_DIR, { recursive: true });

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
          await fsp.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
        }
        console.log('⚙️ Đã tạo settings.json mới tại:', SETTINGS_FILE);
      }

      if (!(await existsAsync(SPAM_DEVICES_FILE))) {
        await fsp.writeFile(SPAM_DEVICES_FILE, '[]', 'utf8');
      } else {
        try {
          const spamStats = await fsp.stat(SPAM_DEVICES_FILE);
          if (spamStats.size === 0) await fsp.writeFile(SPAM_DEVICES_FILE, '[]', 'utf8');
        } catch (err) { }
      }

      if (!(await existsAsync(SUPPLIERS_FILE))) {
        await fsp.writeFile(SUPPLIERS_FILE, '[]', 'utf8');
      }

      if (!(await existsAsync(STOCK_RECEIPTS_FILE))) {
        await fsp.writeFile(STOCK_RECEIPTS_FILE, '[]', 'utf8');
      }

      // Load vào RAM
      products = await readJSONAsync(PRODUCTS_FILE, []);
      settings = await readJSONAsync(SETTINGS_FILE, settings);
      suppliers = await readJSONAsync(SUPPLIERS_FILE, []);
      orders = await readJSONAsync(ORDERS_FILE, []);
      spamDevices = await readJSONAsync(SPAM_DEVICES_FILE, []);
      stockReceipts = await readJSONAsync(STOCK_RECEIPTS_FILE, []);

      blockedDevices.clear();
      spamDevices.forEach(entry => {
        if (entry.lockUntil && entry.lockUntil > Date.now()) {
          if (entry.deviceId) blockedDevices.set(entry.deviceId, entry.lockUntil);
          if (entry.ip) blockedDevices.set(entry.ip, entry.lockUntil);
          if (entry.fingerprint) blockedDevices.set(entry.fingerprint, entry.lockUntil);
        }
      });
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

const instanceTimestamps = { products: 0, settings: 0, suppliers: 0 };

async function syncVercelCache() {
  if (!IS_VERCEL) return;
  try {
    const { rows } = await sql`SELECT topic, updated_at FROM last_updates`;
    const updates = {};
    rows.forEach(r => { updates[r.topic] = Number(r.updated_at); });

    if (updates.products && updates.products > instanceTimestamps.products) {
      const { rows: prodRows } = await sql`SELECT value FROM app_settings WHERE key = 'products'`;
      if (prodRows.length > 0) {
        products = JSON.parse(prodRows[0].value);
        instanceTimestamps.products = updates.products;
      }
    }
    if (updates.settings && updates.settings > instanceTimestamps.settings) {
      const { rows: setRows } = await sql`SELECT value FROM app_settings WHERE key = 'settings'`;
      if (setRows.length > 0) {
        settings = JSON.parse(setRows[0].value);
        instanceTimestamps.settings = updates.settings;
      }
    }
    if (updates.suppliers && updates.suppliers > instanceTimestamps.suppliers) {
      const { rows: supRows } = await sql`SELECT value FROM app_settings WHERE key = 'suppliers'`;
      if (supRows.length > 0) {
        suppliers = JSON.parse(supRows[0].value);
        instanceTimestamps.suppliers = updates.suppliers;
      }
    }
  } catch (err) {
    console.error('Lỗi sync cache:', err);
  }
}

app.use(async (req, res, next) => {
  try {
    await ensureInitialized();
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      await syncVercelCache();
    }
    next();
  } catch (err) {
    console.error('Lỗi khởi tạo dữ liệu:', err);
    res.status(500).send('Lỗi khởi tạo server.');
  }
});

app.use(express.json({ limit: '2mb' }));

// Mount tools sub-app for local development
const toolsApp = require('./api/tools');
app.use(toolsApp);

// Hàm trích xuất IP sạch từ request (xử lý trường hợp Azure proxy gửi IP:PORT)
function extractCleanIp(req) {
  // Ưu tiên x-forwarded-for (IP thật của client qua reverse proxy)
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    return xff.split(',')[0].trim();
  }
  // Fallback: req.ip có thể chứa dạng "IP:PORT" trên Azure Linux
  if (req.ip) {
    // IPv6 mapped IPv4: "::ffff:1.2.3.4" → giữ nguyên
    // Dạng "1.2.3.4:12345" → bỏ port
    const ip = req.ip;
    if (ip.includes(':') && !ip.includes('::')) {
      // Dạng IPv4 có port: "1.2.3.4:12345"
      return ip.split(':')[0];
    }
    return ip;
  }
  return 'unknown-ip';
}

// Giới hạn số lần thử đăng nhập admin để chống dò mật khẩu
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => extractCleanIp(req),
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

app.get('/api/updates/poll', async (req, res) => {
  if (IS_VERCEL) {
    try {
      const { rows } = await sql`SELECT topic, updated_at FROM last_updates`;
      const result = {};
      rows.forEach(r => { result[r.topic] = Number(r.updated_at); });
      return res.json({ ok: true, updates: result, serverTime: Date.now() });
    } catch (err) {
      console.error('Lỗi đọc last_updates:', err);
      return res.status(500).json({ ok: false });
    }
  }

  // Local: dùng cache RAM
  res.json({ ok: true, updates: localUpdateTimestamps, serverTime: Date.now() });
});

// Route SSE: luôn đăng ký để tránh 404.
// - Trên Vercel: trả 410 Gone để trình duyệt dừng retry ngay lập tức.
// - Local: SSE bình thường (server chạy liên tục, không có vấn đề timeout).
app.get('/api/updates/stream', (req, res) => {
  if (IS_VERCEL) {
    // Vercel serverless không hỗ trợ SSE long-lived connection.
    // 410 Gone báo cho client biết endpoint đã bị bỏ, không retry nữa.
    return res.status(410).json({
      ok: false,
      message: 'SSE không khả dụng trên Vercel. Vui lòng dùng /api/updates/poll.'
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});


// Cache RAM cho local (không cần DB); trên Vercel dùng bảng last_updates
const localUpdateTimestamps = {};

async function broadcastUpdate(type, data = {}) {
  const now = Date.now();
  // type dạng 'orders_updated' -> topic 'orders'
  const topic = type.replace('_updated', '');

  if (IS_VERCEL) {
    try {
      await sql`
        INSERT INTO last_updates (topic, updated_at)
        VALUES (${topic}, ${now})
        ON CONFLICT (topic) DO UPDATE SET updated_at = ${now}
      `;
    } catch (err) {
      console.error('Lỗi ghi last_updates:', err);
    }
  } else {
    localUpdateTimestamps[topic] = now;
    // Vẫn giữ SSE cho môi trường local (server chạy liên tục, không có vấn đề timeout)
    const payload = JSON.stringify({ type, data });
    sseClients.forEach(client => {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (err) { }
    });
  }
}

// ---------------------------------------------------------------------
// PHỤC VỤ FILE TĨNH (trang khách hàng, css, js dùng chung)
// ---------------------------------------------------------------------
// Product images are stored in Vercel Blob and served via their public HTTPS URL.
// The /img route only serves bundled static assets (favicon, Slide_img, placeholder).
app.use('/img', express.static(path.join(__dirname, 'public', 'img')));

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
  try {
    // Lấy danh sách ảnh slide từ Cloudflare R2
    const items = await listFiles('slides');
    const images = items
      .filter(i => /\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(i.key))
      .map(i => i.url);

    // Fallback: nếu chưa có slide trên R2, trả về ảnh mẫu từ repo
    if (images.length === 0) {
      const bundledDir = path.join(__dirname, 'public', 'img', 'Slide_img');
      if (await existsAsync(bundledDir)) {
        const bundledFiles = await fsp.readdir(bundledDir);
        const fallback = bundledFiles
          .filter(f => /\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(f))
          .map(f => '/img/Slide_img/' + f);
        return res.json(fallback);
      }
    }
    res.json(images);
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không thể đọc danh sách slide.' });
  }
});

// API tra cứu đơn hàng bằng ID (không cần đăng nhập quản trị)
app.get('/api/orders/:id', async (req, res) => {
  const orderId = String(req.params.id || '').trim().toUpperCase();

  let order = null;

  if (IS_VERCEL) {
    // Luôn đọc trực tiếp từ Postgres, không dùng RAM cache
    // vì các serverless instance không chia sẻ bộ nhớ với nhau
    try {
      const { rows } = await sql`SELECT * FROM orders WHERE UPPER(id) = ${orderId}`;
      if (rows.length > 0) {
        const r = rows[0];
        order = {
          id: r.id,
          createdAt: r.created_at,
          customer: r.customer,
          phone: r.phone,
          address: r.address,
          note: r.note,
          items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
          total: Number(r.total),
          status: r.status,
          deviceId: r.device_id,
          visitorId: r.visitor_id
        };
      }
    } catch (err) {
      console.error('Lỗi tra cứu đơn hàng từ DB:', err);
      return res.status(500).json({ ok: false, message: 'Lỗi hệ thống, vui lòng thử lại.' });
    }
  } else {
    order = orders.find(o => o.id.toUpperCase() === orderId);
  }

  if (!order) {
    return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng nào có mã này.' });
  }

  const enrichedItems = order.items.map(item => {
    const p = products.find(prod => prod.ma === item.ma);
    return {
      ...item,
      image: p ? (p.image || '/img/placeholder.png') : '/img/placeholder.png'
    };
  });

  res.json({ ok: true, order: { ...order, items: enrichedItems } });
});

app.post('/api/orders', async (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.admin_token;
  const expectedToken = crypto.createHmac('sha256', SESSION_SECRET).update('admin').digest('hex');
  const isAdmin = (token === expectedToken);

  if (isAdmin) {
    // --- ADMIN MANUAL ORDER CREATION ---
    try {
      const { customer, phone, address, note, items, shippingFee, status } = req.body || {};
      const cName = String(customer || '').trim();
      const cPhone = String(phone || '').trim();
      const cAddress = String(address || '').trim();
      const cNote = String(note || '').trim();
      const sFee = parseFloat(shippingFee || 0);
      const orderStatus = String(status || 'Đã xác nhận').trim();

      if (!cName) {
        return res.status(400).json({ ok: false, message: 'Tên khách hàng không được để trống.' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ ok: false, message: 'Đơn hàng phải có ít nhất 1 sản phẩm.' });
      }

      const orderItems = [];
      for (const raw of items) {
        const productId = String(raw.productId || raw.ma || '').trim();
        const sku = String(raw.sku || raw.ma || '').trim();
        const name = String(raw.name || raw.ten || '').trim();
        const quantity = parseFloat(raw.quantity !== undefined ? raw.quantity : (raw.qty !== undefined ? raw.qty : 0));
        const unitPrice = parseFloat(raw.unitPrice !== undefined ? raw.unitPrice : (raw.gia !== undefined ? raw.gia : 0));
        const itemNote = String(raw.note || '').trim();
        const donvi = String(raw.donvi || '').trim();

        if (!productId || quantity <= 0) continue;

        orderItems.push({
          productId,
          sku,
          name,
          quantity,
          unitPrice,
          note: itemNote,
          
          // Backward compatibility fields
          ma: productId,
          ten: name,
          qty: quantity,
          gia: unitPrice,
          donvi
        });
      }

      if (orderItems.length === 0) {
        return res.status(400).json({ ok: false, message: 'Danh sách sản phẩm không hợp lệ.' });
      }

      const itemsTotal = orderItems.reduce((sum, x) => sum + x.unitPrice * x.quantity, 0);
      const grandTotal = itemsTotal + sFee;

      const order = {
        id: 'DH' + Date.now().toString().slice(-8),
        createdAt: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        customer: cName,
        phone: cPhone,
        address: cAddress,
        note: cNote,
        items: orderItems,
        shippingFee: sFee,
        total: grandTotal,
        status: orderStatus,
        deviceId: 'admin',
        visitorId: 'admin'
      };

      orders.unshift(order);

      // Lưu đơn hàng
      if (IS_VERCEL) {
        await sql`
          INSERT INTO orders (id, created_at, customer, phone, address, note, items, total, status, device_id, visitor_id)
          VALUES (${order.id}, ${order.createdAt}, ${order.customer}, ${order.phone}, ${order.address}, ${order.note}, ${JSON.stringify(order.items)}, ${order.total}, ${order.status}, 'admin', 'admin')
        `;
      } else {
        await saveOrders(orders);
      }

      // Giảm trừ số lượng tồn kho của các sản phẩm tương ứng
      let productsList = [...products];
      if (IS_VERCEL) {
        try {
          const { rows } = await sql`SELECT value FROM app_settings WHERE key = 'products'`;
          if (rows.length > 0) productsList = JSON.parse(rows[0].value);
        } catch (e) { /* bỏ qua */ }
      }

      let updatedCount = 0;
      for (const item of orderItems) {
        const targetNorm = normalizeProductCode(item.ma);
        if (!targetNorm) continue;
        const prod = productsList.find(p => normalizeProductCode(p.ma) === targetNorm);
        if (prod) {
          prod.stock = parseFloat(prod.stock || 0) - parseFloat(item.qty || 0);
          prod.updatedAt = Date.now();
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        products = productsList;
        await saveProducts(productsList);
        await broadcastUpdate('products_updated');
      }

      await broadcastUpdate('orders_updated');
      return res.json({ ok: true, message: 'Đã tạo và lưu đơn hàng thủ công thành công!', orderId: order.id });

    } catch (err) {
      console.error('Lỗi khi Admin tạo đơn hàng thủ công:', err);
      return res.status(500).json({ ok: false, message: 'Lỗi máy chủ khi tạo đơn: ' + err.message });
    }
  }

  // ─── CHỐNG SPAM ─────────────────────────────────────────────────────────────
  // Cảnh báo khi đặt đơn trong 2 phút qua.
  // Khoá 24 giờ khi đặt >= 5 đơn trong 5 phút.
  // Nhận dạng theo: visitorId > deviceId > IP > browserFingerprint
  // Trên Vercel: mọi trạng thái lưu trong bảng visitor_activity (DB bền vững).
  // Local:       dùng RAM Map (server không restart giữa request).
  // ─────────────────────────────────────────────────────────────────────────────
  const deviceId    = req.headers['x-device-id'] || 'unknown-device';
  const ip          = extractCleanIp(req) || req.ip || 'unknown-ip';
  const fingerprint = req.headers['x-browser-fingerprint'] || 'unknown-fp';
  const visitorId   = req.headers['x-visitor-id']
    || req.body?.visitorId
    || req.headers['visitor-id']
    || req.body?.visitor_id
    || ('dev_' + deviceId);   // fallback: dùng deviceId nếu không có visitorId
  const now = Date.now();

  // ── 1. Lấy trạng thái block / attempts ──────────────────────────────────────
  let blockEntry = null;
  let attempts   = [];  // mảng timestamp (ms) các lần đặt trong 5 phút qua

  if (IS_VERCEL) {
    // Trên Vercel: query DB theo mọi định danh để tránh bỏ sót khi visitorId khác nhau
    try {
      const { rows } = await sql`
        SELECT * FROM visitor_activity
        WHERE visitor_id   = ${visitorId}
           OR device_id    = ${deviceId}
           OR ip           = ${ip}
           OR fingerprint  = ${fingerprint}
        ORDER BY lock_until DESC
        LIMIT 1
      `;
      if (rows.length > 0) {
        blockEntry = rows[0];
        const raw = blockEntry.attempts;
        attempts  = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
      }
    } catch (err) {
      console.error('Lỗi truy vấn visitor_activity:', err);
    }
  } else {
    // Local: dùng RAM Map (deviceId là khoá chính)
    attempts = deviceOrderAttempts.get(deviceId) || [];
  }

  // ── 2. Kiểm tra đang bị khoá không ─────────────────────────────────────────
  const dbLockUntil     = blockEntry ? Number(blockEntry.lock_until) : 0;
  const ramLockUntil    = Math.max(
    blockedDevices.get(deviceId)    || 0,
    blockedDevices.get(ip)          || 0,
    blockedDevices.get(fingerprint) || 0
  );
  const lockUntil = Math.max(dbLockUntil, ramLockUntil);

  if (lockUntil && now < lockUntil) {
    const remainingMin = Math.ceil((lockUntil - now) / 60000);
    let remainingStr;
    if (remainingMin >= 60) {
      const h = Math.floor(remainingMin / 60);
      const m = remainingMin % 60;
      remainingStr = `${h} giờ${m > 0 ? ` ${m} phút` : ''}`;
    } else {
      remainingStr = `${remainingMin} phút`;
    }
    return res.status(429).json({
      ok: false,
      message: `Thiết bị của bạn đã bị tạm khóa do phát hiện spam đặt hàng. Vui lòng quay lại sau ${remainingStr}.`
    });
  }

  // ── 3. Kiểm tra cảnh báo (đã đặt trong 2 phút qua) ─────────────────────────
  const recentAttempts = attempts.filter(t => t > now - 300000); // chỉ giữ trong 5 phút
  const hasOrderInTwoMin = recentAttempts.some(t => t > now - 120000);

  const { customer, phone, address, note, items, force } = req.body || {};

  if (hasOrderInTwoMin && !force) {
    return res.json({
      ok: false,
      requireConfirmation: true,
      message: 'Hệ thống ghi nhận bạn đã có đơn đặt trong 2 phút qua. Bạn có muốn tiếp tục đặt không?'
    });
  }

  // ── 4. Ghi nhận lần đặt mới ─────────────────────────────────────────────────
  const updatedAttempts = [...recentAttempts, now];
  const currentCount    = updatedAttempts.length;

  if (!IS_VERCEL) {
    // Local: cập nhật RAM Map cho cả deviceId, IP và fingerprint
    deviceOrderAttempts.set(deviceId,    updatedAttempts);
    deviceOrderAttempts.set(ip,          [...(deviceOrderAttempts.get(ip) || []).filter(t => t > now - 300000), now]);
    deviceOrderAttempts.set(fingerprint, [...(deviceOrderAttempts.get(fingerprint) || []).filter(t => t > now - 300000), now]);
  }

  // ── 5. Khoá nếu đủ 5 lần trong 5 phút ──────────────────────────────────────
  if (currentCount >= 5) {
    const lockTime = now + 86400000; // Khoá 24 giờ

    // Cập nhật RAM Map (dùng cho local và để check nhanh ngay trong session)
    blockedDevices.set(deviceId,    lockTime);
    blockedDevices.set(ip,          lockTime);
    blockedDevices.set(fingerprint, lockTime);

    if (IS_VERCEL) {
      try {
        await sql`
          INSERT INTO visitor_activity
            (visitor_id, device_id, ip, fingerprint, lock_until, attempts, count, status, last_time)
          VALUES
            (${visitorId}, ${deviceId}, ${ip}, ${fingerprint},
             ${lockTime}, ${JSON.stringify(updatedAttempts)}, ${currentCount}, 'Spam', NOW())
          ON CONFLICT (visitor_id) DO UPDATE SET
            device_id   = EXCLUDED.device_id,
            ip          = EXCLUDED.ip,
            fingerprint = EXCLUDED.fingerprint,
            lock_until  = EXCLUDED.lock_until,
            attempts    = EXCLUDED.attempts,
            count       = EXCLUDED.count,
            status      = EXCLUDED.status,
            last_time   = NOW()
        `;
      } catch (err) {
        console.error('Lỗi lưu spam lock lên DB:', err);
      }
    } else {
      // Local: cập nhật danh sách spam_devices
      let entry = spamDevices.find(e => e.fingerprint === fingerprint || e.ip === ip || e.deviceId === deviceId);
      if (!entry) {
        entry = { deviceId, fingerprint, ip, count: 0, time: '', status: 'Spam' };
        spamDevices.push(entry);
      }
      entry.count     = currentCount;
      entry.lockUntil = lockTime;
      entry.time      = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      entry.status    = 'Spam';
      try { await saveSpamDevices(spamDevices); } catch (err) { console.error('Lỗi lưu spam_devices:', err); }
    }

    return res.status(429).json({
      ok: false,
      message: 'Phát hiện hành vi spam đặt hàng liên tục. Thiết bị của bạn đã bị tạm khóa 24 giờ.'
    });
  }

  // ── 6. Ghi nhận hoạt động hợp lệ (để đếm lần sau) ──────────────────────────
  if (IS_VERCEL) {
    try {
      await sql`
        INSERT INTO visitor_activity
          (visitor_id, device_id, ip, fingerprint, lock_until, attempts, count, status, last_time)
        VALUES
          (${visitorId}, ${deviceId}, ${ip}, ${fingerprint},
           0, ${JSON.stringify(updatedAttempts)}, ${currentCount}, 'Normal', NOW())
        ON CONFLICT (visitor_id) DO UPDATE SET
          device_id   = EXCLUDED.device_id,
          ip          = EXCLUDED.ip,
          fingerprint = EXCLUDED.fingerprint,
          lock_until  = LEAST(visitor_activity.lock_until, EXCLUDED.lock_until),
          attempts    = EXCLUDED.attempts,
          count       = EXCLUDED.count,
          status      = CASE WHEN visitor_activity.lock_until > ${now}
                             THEN visitor_activity.status
                             ELSE EXCLUDED.status END,
          last_time   = NOW()
      `;
    } catch (err) {
      console.error('Lỗi cập nhật visitor activity:', err);
    }
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
    visitorId,
  };

  orders.unshift(order);
  try {
    if (IS_VERCEL) {
      await sql`
        INSERT INTO orders (id, created_at, customer, phone, address, note, items, total, status, device_id, visitor_id)
        VALUES (${order.id}, ${order.createdAt}, ${order.customer}, ${order.phone}, ${order.address}, ${order.note}, ${JSON.stringify(order.items)}, ${order.total}, ${order.status}, ${order.deviceId}, ${visitorId})
      `;
    } else {
      await saveOrders(orders);
    }
    await broadcastUpdate('orders_updated');
  } catch (err) {
    console.error('Lỗi lưu đơn hàng:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi lưu đơn hàng, vui lòng thử lại.' });
  }

  // Gửi mail thông báo bất đồng bộ — không chặn response trả về khách
  if (IS_VERCEL) {
    await sendOrderNotification(order);
  } else {
    // Local: không cần chờ, server luôn chạy nền được
    sendOrderNotification(order);
  }

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

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  if (IS_VERCEL) {
    try {
      const { rows } = await sql`SELECT * FROM orders ORDER BY created_at DESC`;
      const freshOrders = rows.map(r => ({
        id: r.id,
        createdAt: r.created_at,
        customer: r.customer,
        phone: r.phone,
        address: r.address,
        note: r.note,
        items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
        total: Number(r.total),
        status: r.status,
        deviceId: r.device_id,
        visitorId: r.visitor_id
      }));
      return res.json(freshOrders);
    } catch (err) {
      console.error('Lỗi tải danh sách đơn từ DB:', err);
      return res.status(500).json({ ok: false, message: 'Lỗi tải danh sách đơn.' });
    }
  }
  // Fallback: trả về từ RAM, sort mới nhất lên trên
  const sorted = orders.slice().sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt) : new Date(0);
    const db = b.createdAt ? new Date(b.createdAt) : new Date(0);
    return db - da;
  });
  res.json(sorted);
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
    if (IS_VERCEL) {
      await sql`UPDATE orders SET status = ${status} WHERE id = ${req.params.id}`;
    } else {
      await saveOrders(orders);
    }
    await broadcastUpdate('orders_updated');
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
    if (IS_VERCEL) {
      await sql`DELETE FROM orders WHERE id = ${req.params.id}`;
    } else {
      await saveOrders(orders);
    }
    await broadcastUpdate('orders_updated');
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
    if (IS_VERCEL) {
      await sql`DELETE FROM orders WHERE status = 'Đã huỷ'`;
    } else {
      await saveOrders(orders);
    }
    await broadcastUpdate('orders_updated');
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

    let productsList;

    if (IS_VERCEL) {
      // Trên Vercel: products nằm trong Postgres (app_settings), không phải file
      try {
        const { rows } = await sql`SELECT value FROM app_settings WHERE key = 'products'`;
        productsList = rows.length > 0 ? JSON.parse(rows[0].value) : [];
      } catch (err) {
        console.error('Lỗi đọc products từ DB:', err);
        return res.status(500).json({ ok: false, message: 'Lỗi đọc dữ liệu sản phẩm.' });
      }
    } else {
      const raw = await fsp.readFile(PRODUCTS_FILE, 'utf8');
      productsList = JSON.parse(raw || '[]');
    }

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

    // saveProducts tự biết ghi vào DB (Vercel) hay file (local)
    await saveProducts(productsList);
    await broadcastUpdate('products_updated');

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
    await broadcastUpdate('products_updated');
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
        await deleteImageFile(product.image, 'products');
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
    await broadcastUpdate('products_updated');
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
        await deleteImageFile(product.image, 'products');
      }
      product.image = newImagePath;
    } catch (err) {
      return res.status(500).json({ ok: false, message: 'Lỗi upload ảnh: ' + err.message });
    }
  }

  try {
    await saveProducts(products);
    await broadcastUpdate('products_updated');
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
    await deleteImageFile(product.image, 'products');
  }

  products.splice(idx, 1);
  try {
    await saveProducts(products);
    await broadcastUpdate('products_updated');
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
    await deleteImageFile(product.image, 'products');
  }

  products.splice(idx, 1);
  try {
    await saveProducts(products);
    await broadcastUpdate('products_updated');
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

  res.json({ ok: true, added, updated, errors });
});

// =====================================================================
// API NHẬP KHO (INVENTORY STOCK INFLOW)
// =====================================================================

const uploadExcelFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: function (req, file, cb) {
    if (/\.(xlsx|xls)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file Excel (.xlsx hoặc .xls).'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

function parseCleanNumber(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  let str = String(val).replace(/[^0-9.,-]/g, '').trim();
  const lastDot = str.lastIndexOf('.');
  const lastComma = str.lastIndexOf(',');
  if (lastComma > lastDot) {
    str = str.replace(/\./g, '').replace(/,/g, '.');
  } else if (lastDot > lastComma) {
    str = str.replace(/,/g, '');
  } else {
    str = str.replace(/[.,]/g, '');
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

app.post('/api/admin/inventory/import-receipt', requireAdmin, uploadExcelFile.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, message: 'Vui lòng tải lên file Excel phiếu nhập kho.' });
  }

  try {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ ok: false, message: 'File Excel không có sheet nào.' });
    }

    // ── Helper: parse one sheet ────────────────────────────────────────
    function parseSheet(worksheet, sheetLabel) {
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (!rawData || rawData.length === 0) return null;

      let receipt_code = '';
      let import_date = '';

      // A5 (row index 4, col 0)
      if (rawData[4] && rawData[4][0]) {
        const cellVal = rawData[4][0];
        if (cellVal instanceof Date) {
          const d = cellVal.getDate().toString().padStart(2, '0');
          const m = (cellVal.getMonth() + 1).toString().padStart(2, '0');
          const y = cellVal.getFullYear();
          import_date = `${d}/${m}/${y}`;
        } else {
          import_date = String(cellVal).trim();
        }
      }

      let supplier_name = '';
      let note = '';
      let warehouse_name = '';

      const cleanVal = (str) => {
        if (!str) return '';
        return String(str).replace(/^[:\-\s\+]+|[:\-\s\+]+$/g, '').trim();
      };

      // Scan first 15 rows for header metadata
      for (let r = 0; r < Math.min(rawData.length, 15); r++) {
        const row = rawData[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || '').trim();
          if (!val) continue;
          const valLower = val.toLowerCase();

          // Receipt code
          if (valLower.includes('số:') || valLower.includes('số phiếu:') || valLower.includes('số chứng từ:')) {
            const match = val.match(/(?:số|số phiếu|số chứng từ)\s*[:\-\s]*\s*([^\s,;]+)/i);
            if (match && match[1]) {
              receipt_code = match[1].trim();
            } else {
              const nextVal = String(row[c + 1] || '').trim();
              if (nextVal) receipt_code = nextVal;
            }
          }

          // Date (fallback)
          if (!import_date) {
            if (valLower.includes('ngày') && valLower.includes('tháng') && valLower.includes('năm')) {
              import_date = val.trim();
            } else if (['ngày', 'ngày ct', 'ngày chứng từ', 'ngày lập'].includes(valLower)) {
              const nextVal = String(row[c + 1] || '').trim();
              if (nextVal) import_date = nextVal;
            }
          }

          // Supplier
          if (valLower.includes('nhà cung cấp') || valLower.includes('đơn vị giao')) {
            const match = val.match(/(?:nhà cung cấp|đơn vị giao)\s*[:\-\s]*\s*(.*)/i);
            if (match && match[1] && match[1].trim()) {
              supplier_name = match[1].trim();
            } else {
              const nextVal = String(row[c + 1] || '').trim();
              if (nextVal) supplier_name = nextVal;
            }
          }

          // Note
          if (valLower.includes('diễn giải') || valLower.includes('lý do nhập') || valLower.includes('nội dung')) {
            const match = val.match(/(?:diễn giải|lý do nhập|nội dung)\s*[:\-\s]*\s*(.*)/i);
            if (match && match[1] && match[1].trim()) {
              note = match[1].trim();
            } else {
              const nextVal = String(row[c + 1] || '').trim();
              if (nextVal) note = nextVal;
            }
          }

          // Warehouse
          if (valLower.startsWith('kho:') || valLower.includes('kho nhập') || valLower.includes('vào kho') || valLower.includes('nhập tại kho')) {
            const match = val.match(/(?:kho|kho nhập|vào kho|nhập tại kho)\s*[:\-\s]*\s*(.*)/i);
            if (match && match[1] && match[1].trim()) {
              warehouse_name = match[1].trim();
            } else {
              const nextVal = String(row[c + 1] || '').trim();
              if (nextVal) warehouse_name = nextVal;
            }
          }
        }
      }

      receipt_code = cleanVal(receipt_code);
      import_date  = cleanVal(import_date);
      supplier_name = cleanVal(supplier_name);
      note = cleanVal(note);
      warehouse_name = cleanVal(warehouse_name);

      // Find header row
      let headerRowIdx = -1;
      let colMap = { sku: -1, name: -1, unit: -1, quantity: -1, price: -1, amount: -1, taxRate: -1, totalAmount: -1 };

      for (let r = 0; r < Math.min(rawData.length, 30); r++) {
        const row = rawData[r];
        if (!row) continue;
        let skuIdx=-1, nameIdx=-1, unitIdx=-1, qtyIdx=-1, priceIdx=-1, amtIdx=-1, taxIdx=-1, totalAmtIdx=-1;

        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || '').toLowerCase().trim();
          if (!val) continue;
          if (val.includes('mã sku') || val === 'mã hàng' || val === 'mã hàng hóa' || val === 'mã hàng hoá' || val === 'mã vật tư' || val === 'mã sp' || val === 'mã sản phẩm') {
            skuIdx = c;
          } else if (val.includes('tên hàng hóa') || val.includes('tên hàng hoá') || val.includes('tên hàng') || val === 'tên vật tư' || val === 'tên sản phẩm' || val === 'tên sp') {
            nameIdx = c;
          } else if (val.includes('đơn vị tính') || val === 'đvt' || val === 'đơn vị') {
            unitIdx = c;
          } else if (val === 'số lượng' || val === 'sl' || val.includes('số lượng')) {
            qtyIdx = c;
          } else if (val === 'đơn giá' || val === 'đơn giá mua' || val.includes('đơn giá')) {
            priceIdx = c;
          } else if (val === 'thành tiền' || val.includes('thành tiền')) {
            amtIdx = c;
          } else if (val.includes('thuế suất') || val.includes('% thuế') || val === 'thuế (%)' || val === 'thuế suất (%)' || val === 'thuế') {
            taxIdx = c;
          } else if (val.includes('tiền thanh toán') || val.includes('giá trị nhập kho') || val === 'thanh toán' || val.includes('tổng cộng tiền') || val.includes('tổng tiền') || val.includes('tiền thanh toán / giá trị nhập kho')) {
            totalAmtIdx = c;
          }
        }

        if ((skuIdx !== -1 || nameIdx !== -1) && qtyIdx !== -1) {
          headerRowIdx = r;
          colMap = { sku: skuIdx, name: nameIdx, unit: unitIdx, quantity: qtyIdx, price: priceIdx, amount: amtIdx, taxRate: taxIdx, totalAmount: totalAmtIdx };
          break;
        }
      }

      if (headerRowIdx === -1) return null; // Not a product sheet

      const items = [];
      let total_amount = 0;

      for (let r = headerRowIdx + 1; r < rawData.length; r++) {
        const row = rawData[r];
        if (!row) continue;

        // Stop when STT column (A, index 0) is no longer a valid number
        const sttNum = parseInt(row[0], 10);
        if (isNaN(sttNum) || sttNum <= 0) break;

        const sku = colMap.sku !== -1 ? String(row[colMap.sku] || '').trim() : '';
        if (!sku) continue;

        const name = colMap.name !== -1 ? String(row[colMap.name] || '').trim() : '';
        const unit = colMap.unit !== -1 ? String(row[colMap.unit] || '').trim() : '';
        const quantity = colMap.quantity !== -1 ? parseCleanNumber(row[colMap.quantity]) : 0;
        const unitPrice = colMap.price !== -1 ? parseCleanNumber(row[colMap.price]) : 0;
        const amount = colMap.amount !== -1 ? parseCleanNumber(row[colMap.amount]) : (quantity * unitPrice);

        let taxRate = 0;
        if (colMap.taxRate !== -1) {
          const rawTax = String(row[colMap.taxRate] || '').trim();
          if (rawTax) {
            if (rawTax.includes('%')) {
              taxRate = parseCleanNumber(rawTax.replace('%', ''));
            } else {
              const taxVal = parseCleanNumber(rawTax);
              taxRate = (taxVal > 0 && taxVal <= 1) ? taxVal * 100 : taxVal;
            }
          }
        }

        const totalAmount = colMap.totalAmount !== -1
          ? parseCleanNumber(row[colMap.totalAmount])
          : (amount + Math.round(amount * taxRate / 100));
        const importCost = quantity > 0 ? (totalAmount / quantity) : 0;

        total_amount += totalAmount;

        const existingProduct = products.find(p => normalizeProductCode(p.ma) === normalizeProductCode(sku));
        items.push({
          product_sku: sku,
          product_name: name,
          unit,
          quantity,
          unit_price: unitPrice,
          tax_rate: taxRate,
          total_price: amount,        // before-tax; tax already reflected in import_cost & receipt.total_amount
          import_cost: importCost,
          system_match: !!existingProduct,
          current_stock: existingProduct ? (existingProduct.stock || 0) : 0,
          current_cost: existingProduct ? (existingProduct.cost_price || 0) : 0
        });
      }

      if (items.length === 0) return null; // Empty product list — skip this sheet

      return {
        sheet_name: sheetLabel,
        receipt: {
          receipt_code: receipt_code || ('PNK-' + sheetLabel.replace(/\s/g, '')),
          import_date: import_date || new Date().toLocaleDateString('vi-VN'),
          supplier_name: supplier_name || 'Nhà cung cấp vãng lai',
          note: note || '',
          warehouse_name: warehouse_name || 'Kho chính',
          total_amount
        },
        items
      };
    }
    // ── End helper ─────────────────────────────────────────────────────

    const parsedReceipts = [];
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const parsed = parseSheet(worksheet, sheetName);
      if (parsed) parsedReceipts.push(parsed);
    }

    if (parsedReceipts.length === 0) {
      return res.status(400).json({ ok: false, message: 'Không tìm thấy dữ liệu phiếu nhập kho hợp lệ trong file. Cần có cột Mã hàng/Mã SKU, Tên hàng, Số lượng.' });
    }

    // Return all parsed receipts; also keep legacy `receipt` + `items` pointing to the first receipt
    const first = parsedReceipts[0];
    res.json({
      ok: true,
      total_sheets: workbook.SheetNames.length,
      parsed_sheets: parsedReceipts.length,
      receipts: parsedReceipts,       // full array for multi-sheet UI
      receipt: first.receipt,         // backward compat
      items: first.items              // backward compat
    });

  } catch (err) {
    console.error('Lỗi khi phân tích file Excel nhập kho:', err);
    res.status(500).json({ ok: false, message: 'Lỗi phân tích file Excel: ' + err.message });
  }
});

app.post('/api/admin/inventory/save-receipt', requireAdmin, async (req, res) => {
  const { receipt, items } = req.body || {};
  if (!receipt || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: 'Dữ liệu phiếu nhập kho không hợp lệ.' });
  }

  try {
    const targetCode = String(receipt.receipt_code || '').trim();
    if (!targetCode) {
      return res.status(400).json({ ok: false, message: 'Mã chứng từ không được để trống.' });
    }

    // Kiểm tra trùng Mã chứng từ
    if (IS_VERCEL) {
      const checkResult = await sql`
        SELECT id FROM stock_receipts WHERE LOWER(TRIM(receipt_code)) = LOWER(TRIM(${targetCode})) LIMIT 1
      `;
      if (checkResult.rows.length > 0) {
        return res.status(400).json({ ok: false, message: `Mã chứng từ "${targetCode}" đã tồn tại trong hệ thống. Không thể lưu trùng.` });
      }
    } else {
      const exists = stockReceipts.some(r => String(r.receipt_code || '').trim().toLowerCase() === targetCode.toLowerCase());
      if (exists) {
        return res.status(400).json({ ok: false, message: `Mã chứng từ "${targetCode}" đã tồn tại trong hệ thống. Không thể lưu trùng.` });
      }
    }

    // 1. Save receipt and items to Database (or local JSON)
    let receiptId = 0;
    const createdAt = new Date().toISOString();

    if (IS_VERCEL) {
      const receiptResult = await sql`
        INSERT INTO stock_receipts (receipt_code, import_date, supplier_name, note, warehouse_name, total_amount, created_at)
        VALUES (${receipt.receipt_code}, ${receipt.import_date}, ${receipt.supplier_name}, ${receipt.note}, ${receipt.warehouse_name}, ${receipt.total_amount}, NOW())
        RETURNING id
      `;
      receiptId = receiptResult.rows[0].id;

      for (const item of items) {
        await sql`
          INSERT INTO stock_receipt_items (receipt_id, product_sku, product_name, unit, quantity, unit_price, tax_rate, total_price, import_cost)
          VALUES (${receiptId}, ${item.product_sku}, ${item.product_name}, ${item.unit}, ${item.quantity}, ${item.unit_price}, ${item.tax_rate}, ${item.total_price}, ${item.import_cost})
        `;
      }
    } else {
      // Local mode — use max existing ID to avoid duplicates when IDs are non-contiguous
      receiptId = stockReceipts.length > 0 ? Math.max(...stockReceipts.map(r => r.id || 0)) + 1 : 1;
      const localReceipt = {
        id: receiptId,
        receipt_code: receipt.receipt_code,
        import_date: receipt.import_date,
        supplier_name: receipt.supplier_name,
        note: receipt.note,
        warehouse_name: receipt.warehouse_name,
        total_amount: receipt.total_amount,
        created_at: createdAt,
        items: items.map(item => ({
          product_sku: item.product_sku,
          product_name: item.product_name,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          total_price: item.total_price,
          import_cost: item.import_cost
        }))
      };
      stockReceipts.push(localReceipt);
      await saveStockReceipts(stockReceipts);
    }

    // 2. Update products inventory and average cost price
    let productsUpdatedCount = 0;
    
    // Read fresh products on Vercel to avoid cache race conditions
    let productsList = [...products];
    if (IS_VERCEL) {
      try {
        const { rows } = await sql`SELECT value FROM app_settings WHERE key = 'products'`;
        if (rows.length > 0) productsList = JSON.parse(rows[0].value);
      } catch (err) {
        console.error('Lỗi đọc products từ DB trong save-receipt:', err);
      }
    }

    for (const item of items) {
      const targetNorm = normalizeProductCode(item.product_sku);
      if (!targetNorm) continue;
      
      const product = productsList.find(p => normalizeProductCode(p.ma) === targetNorm);
      if (product) {
        const oldStock = parseFloat(product.stock || 0);
        const oldCost = parseFloat(product.cost_price || 0);
        const addedQty = parseFloat(item.quantity || 0);
        const addedPrice = parseFloat(item.unit_price || 0);
        
        const newStock = oldStock + addedQty;
        if (newStock > 0) {
          // Average weighted cost price
          product.cost_price = Math.round(((oldStock * oldCost) + (addedQty * addedPrice)) / newStock);
        } else {
          product.cost_price = addedPrice;
        }
        product.stock = newStock;
        product.updatedAt = Date.now();
        productsUpdatedCount++;
      }
    }

    if (productsUpdatedCount > 0) {
      products = productsList;
      await saveProducts(productsList);
      await broadcastUpdate('products_updated');
    }

    res.json({ ok: true, message: 'Nhập kho thành công!', receiptId });

  } catch (err) {
    console.error('Lỗi khi lưu phiếu nhập kho:', err);
    res.status(500).json({ ok: false, message: 'Lỗi lưu phiếu nhập kho: ' + err.message });
  }
});

// =====================================================================
// API: LƯU HÓA ĐƠN AI VÀO NHẬP KHO
// POST /api/admin/inventory/save-from-invoice
// Body: { invoiceData: { sellerName, serial, invoiceNumber, taxCode,
//          invoiceDate, products: [{name, unit, quantity, price, amount, taxPercent}] } }
// =====================================================================
// Helper functions for invoice mapping and matching
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }
  const distance = track[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  if (maxLength === 0) return 1.0;
  return (maxLength - distance) / maxLength;
}

function compactName(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[\s\-×x\/\.]/g, '')
    .trim();
}

function parseCleanNumber(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  let str = String(val).replace(/[^0-9.,-]/g, '').trim();
  const lastDot = str.lastIndexOf('.');
  const lastComma = str.lastIndexOf(',');
  if (lastComma > lastDot) {
    str = str.replace(/\./g, '').replace(/,/g, '.');
  } else if (lastDot > lastComma) {
    str = str.replace(/,/g, '');
  } else {
    str = str.replace(/[.,]/g, '');
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

app.post('/api/admin/inventory/save-from-invoice', requireAdmin, async (req, res) => {
  const { invoiceData } = req.body || {};
  if (!invoiceData) {
    return res.status(400).json({ ok: false, message: 'Thiếu dữ liệu hóa đơn.' });
  }

  try {
    const invoiceNum = String(invoiceData.invoiceNumber || '').trim();
    const serial = String(invoiceData.serial || '').trim();
    const taxCode = String(invoiceData.taxCode || '').trim();

    if (!invoiceNum && !serial) {
      return res.status(400).json({ ok: false, message: 'Hóa đơn thiếu Số hóa đơn hoặc Ký hiệu (Serial).' });
    }

    // --- Tạo mã chứng từ từ số HĐ + serial (giống exportSingleInvoiceExcel) ---
    const invoiceNumStripped = invoiceNum.replace(/^0+/, '');
    const receipt_code = (invoiceNumStripped + serial) || ('HDAI-' + Date.now());

    // --- Kiểm tra trùng bằng: invoice_number + serial + taxCode ---
    const dupKey = `${invoiceNum}|${serial}|${taxCode}`.toLowerCase();

    if (IS_VERCEL) {
      // Kiểm tra trùng theo invoice_number + serial + taxCode
      const dupCheck = await sql`
        SELECT id FROM stock_receipts
        WHERE LOWER(invoice_number) = LOWER(${invoiceNum})
          AND LOWER(serial_number) = LOWER(${serial})
          AND LOWER(tax_code) = LOWER(${taxCode})
        LIMIT 1
      `;
      // Kiểm tra trùng theo receipt_code (bắt phiếu cũ không có invoice_number)
      const dupByCodeCheck = await sql`
        SELECT id FROM stock_receipts
        WHERE LOWER(receipt_code) = LOWER(${receipt_code})
        LIMIT 1
      `;
      if (dupCheck.rows.length > 0 || dupByCodeCheck.rows.length > 0) {
        return res.status(409).json({
          ok: false,
          isDuplicate: true,
          message: `Hóa đơn này [Số HĐ: ${invoiceNum} / Serial: ${serial}] đã được lưu vào hệ thống trước đó!`
        });
      }
    } else {
      // Kiểm tra trùng theo invoice_number + serial + taxCode
      const dup = stockReceipts.find(r => {
        const rKey = `${r.invoice_number || ''}|${r.serial_number || ''}|${r.tax_code || ''}`.toLowerCase();
        return rKey === dupKey;
      });
      // Kiểm tra trùng theo receipt_code (bắt phiếu cũ không có invoice_number)
      const dupByCode = stockReceipts.find(r =>
        String(r.receipt_code || '').trim().toLowerCase() === receipt_code.toLowerCase()
      );
      if (dup || dupByCode) {
        return res.status(409).json({
          ok: false,
          isDuplicate: true,
          message: `Hóa đơn này [Số HĐ: ${invoiceNum} / Serial: ${serial}] đã được lưu vào hệ thống trước đó!`
        });
      }
    }

    // --- Load fresh suppliers for matching ---
    let suppliersList = [...suppliers];
    if (IS_VERCEL) {
      try {
        const { rows } = await sql`SELECT value FROM app_settings WHERE key = 'suppliers'`;
        if (rows.length > 0) suppliersList = JSON.parse(rows[0].value);
      } catch (e) { /* ignore */ }
    }

    const normalizeNameStr = (str) => {
      if (!str) return '';
      return str.toLowerCase().replace(/\s+/g, ' ').replace(/[.,-]/g, '').trim();
    };

    const sellerNameNormalized = normalizeNameStr(invoiceData.sellerName);
    const foundSupplier = suppliersList.find(s => {
      const supNorm = normalizeNameStr(s.name);
      if (!supNorm) return false;
      const sim = calculateSimilarity(supNorm, sellerNameNormalized);
      return supNorm === sellerNameNormalized || sim >= 0.8 || supNorm.includes(sellerNameNormalized) || sellerNameNormalized.includes(supNorm);
    });

    let supplierName = invoiceData.sellerName || '';
    if (foundSupplier) {
      supplierName = foundSupplier.name;
    }

    // --- Load fresh products for matching ---
    let systemProducts = [...products];
    if (IS_VERCEL) {
      try {
        const { rows } = await sql`SELECT value FROM app_settings WHERE key = 'products'`;
        if (rows.length > 0) systemProducts = JSON.parse(rows[0].value);
      } catch (e) { /* ignore */ }
    }

    // --- Chuyển đổi sản phẩm hóa đơn sang items nhập kho (khớp sản phẩm giống Excel) ---
    const rawProducts = invoiceData.products || [];
    const items = rawProducts.map(p => {
      const prodNameLower = (p.name || '').toLowerCase().trim();
      const prodCodeLower = (p.code || '').toLowerCase().trim();
      const systemMatch = systemProducts.find(sysP => {
        const sysCodeRaw = (sysP.ma || '').toLowerCase().trim();
        const sysNameLower = (sysP.ten || '').toLowerCase().trim();

        // 1. Khớp chính xác theo mã SP
        if (prodCodeLower && sysCodeRaw && sysCodeRaw === prodCodeLower) return true;
        // 2. Mã SP có trong tên sản phẩm hóa đơn
        if (sysCodeRaw && prodNameLower.includes(sysCodeRaw)) return true;
        if (sysCodeRaw.length >= 6 && sysCodeRaw.includes(prodNameLower)) return true;

        // 3. So sánh tên rút gọn
        const prodCompact = compactName(prodNameLower);
        const sysCompact = compactName(sysNameLower);
        if (prodCompact && sysCompact) {
          if (prodCompact === sysCompact) return true;
          const minLen = Math.min(prodCompact.length, sysCompact.length);
          if (minLen >= 5 && (prodCompact.includes(sysCompact) || sysCompact.includes(prodCompact))) return true;
        }

        // 4. Số chứa trong tên (soft guard)
        const prodNums = (prodNameLower.match(/\d+/g) || []).sort().join(',');
        const sysNums = (sysNameLower.match(/\d+/g) || []).sort().join(',');
        if (prodNums && sysNums && prodNums !== sysNums) return false;

        // 5. Độ tương đồng Levenshtein (ngưỡng 0.80)
        const sim = calculateSimilarity(prodNameLower, sysNameLower);
        if (sim >= 0.80) return true;

        // 6. Tên nằm trong nhau
        if (prodNameLower.length >= 5 && sysNameLower.length >= 5) {
          if (prodNameLower.includes(sysNameLower) || sysNameLower.includes(prodNameLower)) return true;
        }
        return false;
      });

      let pCode = 'SP_MOI';
      let pName = p.name || '';
      let pUnit = p.unit || 'Cái';
      if (systemMatch) {
        pCode = systemMatch.ma;
        pName = systemMatch.ten;
        pUnit = systemMatch.donvi || pUnit;
      }

      const qty = parseCleanNumber(p.quantity);
      const price = parseCleanNumber(p.price);
      const amount = parseCleanNumber(p.amount);
      const taxRate = p.taxPercent !== undefined ? parseCleanNumber(p.taxPercent) : 0;

      return {
        product_sku: pCode,
        product_name: pName,
        unit: pUnit,
        quantity: qty,
        unit_price: price,
        tax_rate: taxRate,
        total_price: amount,
        import_cost: price
      };
    });

    const totalAmount = items.reduce((s, i) => {
      const taxAmt = Math.round((i.total_price || 0) * (i.tax_rate || 0) / 100);
      return s + (i.total_price || 0) + taxAmt;
    }, 0);

    // --- Build import_date string ---
    let importDate = '';
    if (invoiceData.invoiceDate) {
      const { date, month, year } = invoiceData.invoiceDate;
      importDate = `${String(date).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
    }

    const receipt = {
      receipt_code,
      import_date: importDate,
      supplier_name: supplierName,
      note: `Nhập từ hóa đơn GTGT - Số HĐ: ${invoiceNum} / Serial: ${serial}`,
      warehouse_name: 'Kho chính',
      total_amount: totalAmount,
      invoice_number: invoiceNum,
      serial_number: serial,
      tax_code: taxCode
    };

    let receiptId = 0;
    const createdAt = new Date().toISOString();

    if (IS_VERCEL) {
      // Cần đảm bảo bảng stock_receipts có cột invoice_number, serial_number, tax_code
      const receiptResult = await sql`
        INSERT INTO stock_receipts
          (receipt_code, import_date, supplier_name, note, warehouse_name, total_amount,
           invoice_number, serial_number, tax_code, created_at)
        VALUES
          (${receipt.receipt_code}, ${receipt.import_date}, ${receipt.supplier_name},
           ${receipt.note}, ${receipt.warehouse_name}, ${receipt.total_amount},
           ${invoiceNum}, ${serial}, ${taxCode}, NOW())
        RETURNING id
      `;
      receiptId = receiptResult.rows[0].id;

      for (const item of items) {
        await sql`
          INSERT INTO stock_receipt_items
            (receipt_id, product_sku, product_name, unit, quantity, unit_price, tax_rate, total_price, import_cost)
          VALUES
            (${receiptId}, ${item.product_sku}, ${item.product_name}, ${item.unit},
             ${item.quantity}, ${item.unit_price}, ${item.tax_rate}, ${item.total_price}, ${item.import_cost})
        `;
      }
    } else {
      // Local JSON mode — use max existing ID to avoid duplicates when IDs are non-contiguous
      receiptId = stockReceipts.length > 0 ? Math.max(...stockReceipts.map(r => r.id || 0)) + 1 : 1;
      const localReceipt = {
        id: receiptId,
        ...receipt,
        created_at: createdAt,
        items
      };
      stockReceipts.push(localReceipt);
      await saveStockReceipts(stockReceipts);
    }

    // --- Cập nhật tồn kho sản phẩm (chỉ những mặt hàng khớp SKU) ---
    let productsList = [...products];
    if (IS_VERCEL) {
      try {
        const { rows } = await sql`SELECT value FROM app_settings WHERE key = 'products'`;
        if (rows.length > 0) productsList = JSON.parse(rows[0].value);
      } catch (e) { /* bỏ qua */ }
    }

    let updatedCount = 0;
    for (const item of items) {
      if (!item.product_sku) continue; // không có SKU → không đối chiếu
      const tNorm = normalizeProductCode(item.product_sku);
      const prod = productsList.find(p => normalizeProductCode(p.ma) === tNorm);
      if (prod) {
        const oldStock = parseFloat(prod.stock || 0);
        const oldCost = parseFloat(prod.cost_price || 0);
        const qty = parseFloat(item.quantity || 0);
        const price = parseFloat(item.unit_price || 0);
        const newStock = oldStock + qty;
        prod.cost_price = newStock > 0
          ? Math.round(((oldStock * oldCost) + (qty * price)) / newStock)
          : price;
        prod.stock = newStock;
        prod.updatedAt = Date.now();
        updatedCount++;
      }
    }
    if (updatedCount > 0) {
      products = productsList;
      await saveProducts(productsList);
      await broadcastUpdate('products_updated');
    }

    res.json({ ok: true, message: 'Đã lưu phiếu nhập kho từ hóa đơn thành công!', receiptId });

  } catch (err) {
    console.error('Lỗi save-from-invoice:', err);
    res.status(500).json({ ok: false, message: 'Lỗi máy chủ: ' + err.message });
  }
});

app.get('/api/admin/inventory/receipts', requireAdmin, async (req, res) => {
  try {
    if (IS_VERCEL) {
      const { rows } = await sql`
        SELECT r.*,
               (SELECT COUNT(*)::int FROM stock_receipt_items WHERE receipt_id = r.id) as item_count
        FROM stock_receipts r
        ORDER BY r.created_at DESC, r.id DESC
      `;
      const formatted = rows.map(r => ({
        id: r.id,
        receipt_code: r.receipt_code,
        import_date: r.import_date,
        supplier_name: r.supplier_name,
        note: r.note,
        warehouse_name: r.warehouse_name,
        total_amount: Math.round(Number(r.total_amount || 0)), // use stored value — correct at save time
        item_count: r.item_count,
        created_at: r.created_at
      }));
      res.json(formatted);
    } else {
      const formatted = [...stockReceipts].reverse().map(r => ({
        id: r.id,
        receipt_code: r.receipt_code,
        import_date: r.import_date,
        supplier_name: r.supplier_name,
        note: r.note,
        warehouse_name: r.warehouse_name,
        total_amount: Math.round(Number(r.total_amount || 0)), // use stored value — correct at save time
        item_count: r.items ? r.items.length : 0,
        created_at: r.created_at
      }));
      res.json(formatted);
    }
  } catch (err) {
    console.error('Lỗi lấy lịch sử nhập kho:', err);
    res.status(500).json({ ok: false, message: 'Lỗi hệ thống: ' + err.message });
  }
});

app.get('/api/admin/inventory/receipts/:id', requireAdmin, async (req, res) => {
  const receiptId = parseInt(req.params.id);
  if (isNaN(receiptId)) {
    return res.status(400).json({ ok: false, message: 'Mã phiếu nhập không hợp lệ.' });
  }

  try {
    if (IS_VERCEL) {
      const receiptRes = await sql`SELECT * FROM stock_receipts WHERE id = ${receiptId}`;
      if (receiptRes.rows.length === 0) {
        return res.status(404).json({ ok: false, message: 'Không tìm thấy phiếu nhập kho.' });
      }
      const receipt = receiptRes.rows[0];
      const itemsRes = await sql`SELECT * FROM stock_receipt_items WHERE receipt_id = ${receiptId}`;
      
      res.json({
        ok: true,
        receipt: {
          id: receipt.id,
          receipt_code: receipt.receipt_code,
          import_date: receipt.import_date,
          supplier_name: receipt.supplier_name,
          note: receipt.note,
          warehouse_name: receipt.warehouse_name,
          total_amount: Number(receipt.total_amount),
          created_at: receipt.created_at
        },
        items: itemsRes.rows.map(item => ({
          product_sku: item.product_sku,
          product_name: item.product_name,
          unit: item.unit,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          tax_rate: Number(item.tax_rate),
          total_price: Number(item.total_price),
          import_cost: Number(item.import_cost)
        }))
      });
    } else {
      const receipt = stockReceipts.find(r => r.id === receiptId);
      if (!receipt) {
        return res.status(404).json({ ok: false, message: 'Không tìm thấy phiếu nhập kho.' });
      }
      res.json({
        ok: true,
        receipt: {
          id: receipt.id,
          receipt_code: receipt.receipt_code,
          import_date: receipt.import_date,
          supplier_name: receipt.supplier_name,
          note: receipt.note,
          warehouse_name: receipt.warehouse_name,
          total_amount: receipt.total_amount,
          created_at: receipt.created_at
        },
        items: receipt.items
      });
    }
  } catch (err) {
    console.error('Lỗi lấy chi tiết phiếu nhập kho:', err);
    res.status(500).json({ ok: false, message: 'Lỗi hệ thống: ' + err.message });
  }
});

app.delete('/api/admin/inventory/receipts/:id', requireAdmin, async (req, res) => {
  const receiptId = parseInt(req.params.id);
  if (isNaN(receiptId)) {
    return res.status(400).json({ ok: false, message: 'Mã phiếu nhập không hợp lệ.' });
  }

  try {
    if (IS_VERCEL) {
      const check = await sql`SELECT id FROM stock_receipts WHERE id = ${receiptId}`;
      if (check.rows.length === 0) {
        return res.status(404).json({ ok: false, message: 'Không tìm thấy chứng từ nhập kho.' });
      }
      await sql`DELETE FROM stock_receipts WHERE id = ${receiptId}`;
    } else {
      const index = stockReceipts.findIndex(r => r.id === receiptId);
      if (index === -1) {
        return res.status(404).json({ ok: false, message: 'Không tìm thấy chứng từ nhập kho.' });
      }
      stockReceipts.splice(index, 1);
      await saveStockReceipts(stockReceipts);
    }

    res.json({ ok: true, message: 'Xóa chứng từ nhập kho thành công!' });
  } catch (err) {
    console.error('Lỗi khi xóa chứng từ nhập kho:', err);
    res.status(500).json({ ok: false, message: 'Lỗi khi xóa chứng từ: ' + err.message });
  }
});

// Hàm chuẩn hóa mã SP dùng chung giữa import-images và cleanup.
// Phải nhất quán với hàm normalizeCode() phía client trong admin.js.
function normalizeProductCode(c) {
  if (!c) return '';
  return String(c)
    .trim()
    .toLowerCase()
    .replace(/[/:*?"<>|]/g, '_')   // ký tự cấm
    .replace(/[-\s]/g, '_');        // gạch ngang và khoảng trắng → _
}

app.post('/api/admin/products/import-images', requireAdmin, uploadFolderImages.array('images', 3), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, message: 'Kh\u00f4ng nh\u1eadn \u0111\u01b0\u1ee3c file \u1ea3nh n\u00e0o.' });
    }

    // \u2500\u2500 Tr\u00ean Vercel: \u0111\u1ecdc fresh products t\u1eeb DB \u0111\u1ec3 tr\u00e1nh ghi \u0111\u00e8 stale RAM cache \u2500\u2500
    let productsList;
    if (IS_VERCEL) {
      try {
        const { rows } = await sql`SELECT value FROM app_settings WHERE key = 'products'`;
        productsList = rows.length > 0 ? JSON.parse(rows[0].value) : [];
      } catch (err) {
        console.error('L\u1ed7i \u0111\u1ecdc products t\u1eeb DB (import-images):', err);
        return res.status(500).json({ ok: false, message: 'L\u1ed7i \u0111\u1ecdc d\u1eef li\u1ec7u s\u1ea3n ph\u1ea9m t\u1eeb DB.' });
      }
    } else {
      productsList = products;
    }

    let updatedCount = 0;
    const failedFiles = []; // { filename, reason } — upload th\u1ea5t b\u1ea1i th\u1ef1c s\u1ef1

    for (const file of req.files) {
      // multer m\u00e3 h\u00f3a originalname b\u1eb1ng latin1; decode l\u1ea1i sang utf8
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/\\/g, '/');
      const ext = path.extname(originalName).toLowerCase();
      const code = path.basename(originalName, ext).trim();

      // D\u00f9ng h\u00e0m normalizeProductCode nh\u1ea5t qu\u00e1n v\u1edbi client
      const targetNorm = normalizeProductCode(code);
      const product = productsList.find(p => normalizeProductCode(p.ma) === targetNorm);

      if (product) {
        const filename = code + ext;
        try {
          const newImagePath = await uploadImageFile({ ...file, filename }, 'products');
          // uploadImageFile \u0111\u00e3 verify HTTP 200 \u2014 n\u1ebfu kh\u00f4ng throw th\u00ec upload th\u00e0nh c\u00f4ng
          if (product.image && product.image !== newImagePath) {
            await deleteImageFile(product.image, 'products');
          }
          product.image = newImagePath;
          product.updatedAt = Date.now();
          updatedCount++;
          file.buffer = null; // Gi\u1ea3i ph\u00f3ng RAM
        } catch (err) {
          console.error(`L\u1ed7i upload \u1ea3nh ${filename}:`, err.message);
          // Kh\u00f4ng ghi URL v\u00e0o DB \u2014 ch\u1ec9 b\u00e1o l\u1ed7i cho client
          failedFiles.push({ filename, reason: err.message });
        }
      }
      // Kh\u00f4ng match m\u00e3 \u2192 b\u1ecf qua (\u0111\u00e3 \u0111\u01b0\u1ee3c l\u1ecdc ph\u00eda client)
    }

    if (updatedCount > 0) {
      if (IS_VERCEL) products = productsList;
      await saveProducts(productsList);
      await broadcastUpdate('products_updated');
    }

    res.json({ ok: true, updated: updatedCount, failedFiles });

  } catch (err) {
    console.error('\u274c L\u1ed7i nghi\u00eam tr\u1ecdng trong import-images:', err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: 'L\u1ed7i m\u00e1y ch\u1ee7 khi upload \u1ea3nh: ' + err.message });
    }
  }
});

// \u2500\u2500 D\u1ecdn d\u1eb9p URL \u1ea3nh broken trong DB \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// So s\u00e1nh image URL trong DB v\u1edbi danh s\u00e1ch object th\u1ef1c t\u1ebf tr\u00ean R2.
// URL n\u00e0o kh\u00f4ng c\u00f3 tr\u00ean R2 \u2192 x\u00f3a kh\u1ecfi DB \u0111\u1ec3 filter "Ch\u01b0a c\u00f3 \u1ea3nh" ho\u1ea1t \u0111\u1ed9ng \u0111\u00fang.
app.post('/api/admin/products/cleanup-broken-images', requireAdmin, async (req, res) => {
  try {
    const { listFiles } = require('./lib/storage');

    // L\u1ea5y danh s\u00e1ch key th\u1ef1c t\u1ebf tr\u00ean R2
    const r2Objects = await listFiles('products');
    const r2Urls = new Set(r2Objects.map(o => o.url));

    let productsList;
    if (IS_VERCEL) {
      const { rows } = await sql`SELECT value FROM app_settings WHERE key = 'products'`;
      productsList = rows.length > 0 ? JSON.parse(rows[0].value) : [];
    } else {
      productsList = products;
    }

    const cleaned = [];
    for (const p of productsList) {
      if (p.image && !r2Urls.has(p.image)) {
        console.log(`\u1f9f9 X\u00f3a URL \u1ea3nh broken cho SP ${p.ma}: ${p.image}`);
        cleaned.push({ ma: p.ma, ten: p.ten, oldImage: p.image });
        p.image = null;
        p.updatedAt = Date.now();
      }
    }

    if (cleaned.length > 0) {
      if (IS_VERCEL) products = productsList;
      await saveProducts(productsList);
      await broadcastUpdate('products_updated');
    }

    res.json({ ok: true, cleaned: cleaned.length, details: cleaned });

  } catch (err) {
    console.error('L\u1ed7i cleanup-broken-images:', err);
    res.status(500).json({ ok: false, message: 'L\u1ed7i khi d\u1ecdn d\u1eb9p \u1ea3nh: ' + err.message });
  }
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
    await broadcastUpdate('settings_updated');
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

  try {
    await deleteImageFile(url, 'slides'); // url là Blob URL đầy đủ
    res.json({ ok: true });
  } catch (err) {
    console.error('Lỗi xoá slide:', err);
    res.status(500).json({ ok: false, message: 'Không tìm thấy ảnh slide hoặc lỗi khi xoá.' });
  }
});

// API lấy danh sách nhà cung cấp
app.get('/api/suppliers', requireAdmin, (req, res) => {
  res.json(suppliers);
});

// =====================================================================
// KHỞI ĐỘNG SERVER (chỉ chạy khi KHÔNG ở trên Vercel)
// =====================================================================
if (!IS_VERCEL) {
  // Bắt lỗi không mong muốn để tránh thoát im lặng
  process.on('uncaughtException', (err) => {
    console.error('❌ uncaughtException:', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('❌ unhandledRejection:', reason);
  });

  app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    console.log(`🔑 Trang quản trị: http://localhost:${PORT}${ADMIN_PATH}`);
  });
}

module.exports = app;