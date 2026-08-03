// =====================================================================
// CỬA HÀNG VẬT TƯ KỸ THUẬT - SERVER
// Express + lưu dữ liệu bằng file JSON (không cần database).
// Trang quản trị có URL riêng, yêu cầu đăng nhập bằng mật khẩu.
// =====================================================================

require('dotenv').config();

// Monkey-patch ExcelJS để tránh crash khi Conditional Formatting trong template MISA bị lỗi
try {
  const CfRuleXform = require('exceljs/lib/xlsx/xform/sheet/cf/cf-rule-xform');

  // Patch hàm render tổng
  const _origRender = CfRuleXform.prototype.render;
  CfRuleXform.prototype.render = function (xmlStream, model) {
    if (model) {
      if (!model.formulae) model.formulae = [];
    }
    try {
      return _origRender.call(this, xmlStream, model);
    } catch (e) {
      console.warn('[ExcelJS Warning] Bỏ qua lỗi vẽ CfRuleXform.render:', e.message);
    }
  };

  // Patch hàm renderExpression chi tiết
  const _origRenderExpression = CfRuleXform.prototype.renderExpression;
  CfRuleXform.prototype.renderExpression = function (xmlStream, model) {
    if (model) {
      if (!model.formulae) model.formulae = [];
      if (model.formulae.length === 0) model.formulae.push('');
    }
    try {
      return _origRenderExpression.call(this, xmlStream, model);
    } catch (e) {
      console.warn('[ExcelJS Warning] Bỏ qua lỗi renderExpression:', e.message);
    }
  };

  // Patch hàm renderCellIs chi tiết
  const _origRenderCellIs = CfRuleXform.prototype.renderCellIs;
  CfRuleXform.prototype.renderCellIs = function (xmlStream, model) {
    if (model) {
      if (!model.formulae) model.formulae = [];
    }
    try {
      return _origRenderCellIs.call(this, xmlStream, model);
    } catch (e) {
      console.warn('[ExcelJS Warning] Bỏ qua lỗi renderCellIs:', e.message);
    }
  };
} catch (ignored) { }



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
const { uploadImageFile, deleteImageFile, listFiles } = require('./lib/storage');
const { sendOrderNotification } = require('./lib/mailer');
const { sql } = require('@vercel/postgres');

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

const deviceOrderAttempts = new Map();
const blockedDevices = new Map();

// Trên Vercel: products/settings/suppliers lưu vào bảng app_settings.
// orders và spamDevices được ghi trực tiếp theo từng hành động vào bảng riêng.
const saveProducts = makeQueuedWriter(PRODUCTS_FILE, 'products');
const saveOrders = makeQueuedWriter(ORDERS_FILE, null); // orders ghi trực tiếp vào bảng orders
const saveSettings = makeQueuedWriter(SETTINGS_FILE, 'settings');
const saveSpamDevices = makeQueuedWriter(SPAM_DEVICES_FILE, null); // visitor_activity ghi trực tiếp
const saveSuppliers = makeQueuedWriter(SUPPLIERS_FILE, 'suppliers');

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
      await initDbSchema();

      // Load products từ DB
      try {
        const { rows } = await sql`SELECT value FROM app_settings WHERE key = 'products'`;
        if (rows.length > 0) {
          products = JSON.parse(rows[0].value);
          console.log(`✅ Loaded ${products.length} products from Vercel DB.`);
        } else {
          // Lần đầu: seed từ bundled data
          try {
            const raw = await fsp.readFile(BUNDLED_PRODUCTS_SEED, 'utf8');
            products = JSON.parse(raw);
          } catch { products = []; }
          await sql`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('products', ${JSON.stringify(products)}, NOW())
            ON CONFLICT (key) DO NOTHING
          `;
          console.log(`📦 Seeded ${products.length} products into Vercel DB.`);
        }
      } catch (err) {
        console.error('❌ Lỗi load products từ DB:', err);
        products = [];
      }

      // Load settings từ DB
      try {
        const { rows } = await sql`SELECT value FROM app_settings WHERE key = 'settings'`;
        if (rows.length > 0) {
          settings = JSON.parse(rows[0].value);
          console.log('✅ Loaded settings from Vercel DB.');
        } else {
          // Lần đầu: seed settings mặc định
          await sql`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('settings', ${JSON.stringify(settings)}, NOW())
            ON CONFLICT (key) DO NOTHING
          `;
          console.log('⚙️ Seeded default settings into Vercel DB.');
        }
      } catch (err) {
        console.error('❌ Lỗi load settings từ DB:', err);
      }

      // Load suppliers từ DB
      try {
        const { rows } = await sql`SELECT value FROM app_settings WHERE key = 'suppliers'`;
        if (rows.length > 0) {
          suppliers = JSON.parse(rows[0].value);
          console.log(`✅ Loaded ${suppliers.length} suppliers from Vercel DB.`);
        } else {
          await sql`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('suppliers', '[]', NOW())
            ON CONFLICT (key) DO NOTHING
          `;
          suppliers = [];
        }
      } catch (err) {
        console.error('❌ Lỗi load suppliers từ DB:', err);
        suppliers = [];
      }

      // Load orders từ DB
      try {
        const { rows } = await sql`SELECT * FROM orders ORDER BY created_at DESC`;
        orders = rows.map(r => ({
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
      } catch (err) {
        console.error('❌ Lỗi load orders từ Vercel DB:', err);
        orders = [];
      }

      // Load blocked visitors từ DB
      try {
        blockedDevices.clear();
        const { rows } = await sql`SELECT * FROM visitor_activity WHERE lock_until > ${Date.now()}`;
        spamDevices = rows.map(r => ({
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
      } catch (err) {
        console.error('❌ Lỗi load spamDevices từ Vercel DB:', err);
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

      // Load vào RAM
      products = await readJSONAsync(PRODUCTS_FILE, []);
      settings = await readJSONAsync(SETTINGS_FILE, settings);
      suppliers = await readJSONAsync(SUPPLIERS_FILE, []);
      orders = await readJSONAsync(ORDERS_FILE, []);
      spamDevices = await readJSONAsync(SPAM_DEVICES_FILE, []);

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

  try {
    await saveProducts(products);
    await broadcastUpdate('products_updated');
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Lỗi lưu dữ liệu.' });
  }
  res.json({ ok: true, added, updated, errors });
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

// =====================================================================
// TOOLS MODULE - PARSE INVOICE PDF WITH GEMINI
// =====================================================================
const uploadInvoice = multer({
  storage: multer.memoryStorage(),
  fileFilter: function (req, file, cb) {
    if (/\.(pdf|png|jpe?g|webp|bmp|jfif)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file PDF hoặc hình ảnh (PNG, JPG, WEBP, BMP, JFIF).'));
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
      return res.status(400).json({ ok: false, message: 'Không có file PDF hoặc hình ảnh nào được tải lên.' });
    }

    const apiKey = (settings.geminiKeySource === 'custom' && settings.geminiApiKey) ? settings.geminiApiKey : process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, message: 'Chưa cấu hình Gemini API Key trong hệ thống. Vui lòng nhập ở phần Công cụ hoặc kiểm tra cấu hình Azure/file .env.' });
    }

    // Đọc danh sách sản phẩm hiện có
    const systemProducts = products;
    const systemSuppliers = suppliers;

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
        const prompt = `Hãy đọc hóa đơn GTGT (dạng PDF hoặc hình ảnh) được cung cấp và trích xuất thông tin chi tiết chính xác theo định dạng JSON sau:
{
  "sellerName": "Tên đơn vị bán hàng",
  "serial": "Ký hiệu hóa đơn (Ký hiệu / Serial, ví dụ: 1C26TAA)",
  "invoiceNumber": "Số hóa đơn (Số / No., ví dụ: 00029613)",
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
              mimeType: file.mimetype || 'application/pdf'
            }
          }
        ]);

        const textResult = response.response.text();

        // Làm sạch JSON trả về từ Gemini (đặc biệt khi input là ảnh PNG/JPG
        // thay vì PDF — Gemini hay trả về JSON không hợp lệ: trailing comma,
        // comment JS, hoặc bọc trong markdown code fence)
        let cleanedText = textResult
          // Bỏ markdown code fence ```json ... ``` hoặc ``` ... ```
          .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
          // Bỏ comment dạng // ... (single-line)
          .replace(/\/\/[^\n]*/g, '')
          // Bỏ comment dạng /* ... */
          .replace(/\/\*[\s\S]*?\*\//g, '')
          // Bỏ trailing comma trước } hoặc ] (JSON không cho phép)
          .replace(/,\s*([}\]])/g, '$1')
          .trim();

        // Nếu Gemini trả về nhiều JSON object nối tiếp, chỉ lấy cái đầu tiên
        if (!cleanedText.startsWith('{') && !cleanedText.startsWith('[')) {
          const firstBrace = cleanedText.indexOf('{');
          const firstBracket = cleanedText.indexOf('[');
          const start = firstBrace === -1 ? firstBracket : (firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket));
          if (start !== -1) cleanedText = cleanedText.slice(start);
        }

        const parsed = JSON.parse(cleanedText);


        // Đối chiếu tên sản phẩm
        if (parsed.products && Array.isArray(parsed.products)) {
          for (const prod of parsed.products) {
            const prodNameLower = (prod.name || '').toLowerCase().trim();
            const prodCodeLower = (prod.code || '').toLowerCase().trim();
            const prodNums = (prodNameLower.match(/\d+(\.\d+)?/g) || []).join(',');
            const hasMatch = systemProducts.some(sysP => {
              const sysCodeLower = (sysP.ma || '').toLowerCase().trim();
              const sysNameLower = (sysP.ten || '').toLowerCase().trim();

              // 1. Kiểm tra khớp mã sản phẩm trước
              if (prodCodeLower && sysCodeLower === prodCodeLower) return true;
              if (prodNameLower.includes(sysCodeLower) || sysCodeLower.includes(prodNameLower)) return true;
              
              // 2. Nếu không khớp mã, kiểm tra khớp tên
              // Nếu cả 2 đều có số, thì các số này phải trùng nhau
              // Tránh trường hợp 'VSC - Oval 6.0' khớp nhầm với 'VSC - Oval 4.0'
              const sysNums = (sysNameLower.match(/\d+(\.\d+)?/g) || []).join(',');
              if (prodNums !== sysNums) return false;

              const sim = calculateSimilarity(prodNameLower, sysNameLower);
              if (sim >= 0.85) return true;
              // Chỉ dùng includes() khi cả 2 chuỗi đủ dài (>= 6 ký tự)
              // tránh khớp nhầm với tên ngắn/tên chung chung
              if (prodNameLower.length >= 6 && sysNameLower.length >= 6) {
                if (prodNameLower.includes(sysNameLower) || sysNameLower.includes(prodNameLower)) return true;
              }
              return false;
            });
            if (!hasMatch) {
              prod.isNewSystemProduct = true;
            }
          }
        }

        // Đối chiếu nhà cung cấp
        if (parsed.sellerName && systemSuppliers.length > 0) {
          const sellerLower = parsed.sellerName.toLowerCase().trim();
          const supplierMatch = systemSuppliers.some(sup => {
            const supName = (sup.name || '').toLowerCase().trim();
            if (!supName) return false;
            const sim = calculateSimilarity(sellerLower, supName);
            return sim >= 0.8 || sellerLower.includes(supName) || supName.includes(sellerLower);
          });
          if (!supplierMatch) {
            parsed.isNewSupplier = true;
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
    let worksheet = workbook.getWorksheet(1);

    const suppliersList = suppliers;
    const systemProducts = products;

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
      if (val === 'ngày' || val.includes('ngày chứng từ') || val.includes('ngày hóa đơn') || val.includes('ngày ct')) {
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

    // Lấy giá trị mặc định từ dòng 9 trước khi strip (vì sau strip cell.value có thể = null)
    const _row9 = worksheet.getRow(9);
    const defaultColA = _row9.getCell(1).value;
    const defaultColL = _row9.getCell(colIndices.warehouseCode || 12).value;

    // -----------------------------------------------------------------------
    // FIX: "Shared Formula master must exist above and or left of clone"
    // ExcelJS lưu shared formula tracking trong INTERNAL state (_sharedFormulae)
    // tách biệt với cell.value. Chỉ thay cell.value KHÔNG đủ.
    // Giải pháp: strip all formula values → serialize ra buffer → reload lại.
    // Khi reload, ExcelJS parse lại từ XML sạch (không còn <f t="shared">)
    // nên internal tracking được xóa hoàn toàn.
    // -----------------------------------------------------------------------

    // Bước 1: Strip tất cả formula/sharedFormula values (dùng includeEmpty:true
    // để không bỏ sót cell có formula result = 0)
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v && typeof v === 'object' && (v.formula || v.sharedFormula)) {
          // Giữ calculated result nếu có (kể cả khi result = 0)
          cell.value = (v.result !== undefined && v.result !== null) ? v.result : null;
        }
      });
    });

    // Bước 2: Serialize ra buffer và reload — xóa sạch internal shared formula state
    const _cleanBuf = await workbook.xlsx.writeBuffer();
    await workbook.xlsx.load(_cleanBuf);
    worksheet = workbook.getWorksheet(1); // Rebind sau reload

    // Lấy lại firstDataRow từ worksheet đã sạch (sau reload)
    const firstDataRow = worksheet.getRow(9);

    // Xóa sạch toàn bộ giá trị từ row 9 trở xuống (giữ style)
    // Tránh data mẫu của template bị dính kèm vào file xuất
    const lastTemplateRow = worksheet.rowCount;
    for (let r = 9; r <= lastTemplateRow; r++) {
      const tplRow = worksheet.getRow(r);
      tplRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.value = null;
      });
      tplRow.commit();
    }

    let currentRow = headerRowNumber + 1;


    for (const inv of invoices) {
      // 1. Logic dò tìm Mã nhà cung cấp (Cột D) và Tên đối tượng (Cột E)
      const sellerNameNormalized = normalizeName(inv.sellerName);
      // Đối chiếu NCC bằng similarity (nhất quán với logic parse-invoice)
      const foundSupplier = suppliersList.find(s => {
        const supNorm = normalizeName(s.name);
        if (!supNorm) return false;
        const sim = calculateSimilarity(supNorm, sellerNameNormalized);
        return supNorm === sellerNameNormalized ||
          sim >= 0.8 ||
          supNorm.includes(sellerNameNormalized) ||
          sellerNameNormalized.includes(supNorm);
      });

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

      // Định dạng ngày chứng từ DD/MM/YYYY
      let dateStr = '';
      if (inv.invoiceDate) {
        const d = String(inv.invoiceDate.date || '').padStart(2, '0');
        const m = String(inv.invoiceDate.month || '').padStart(2, '0');
        const y = inv.invoiceDate.year || '';
        if (d && m && y) dateStr = `${d}/${m}/${y}`;
      }

      const descriptionText = `Nhập kho hàng hóa hóa đơn của NCC ${supplierCode} - Số HĐ: ${inv.invoiceNumber || inv.serial || ''} ngày ${dateStr}`;

      const invProducts = inv.products || []; // Đổi tên tránh shadowing global `products`
      for (let pIdx = 0; pIdx < invProducts.length; pIdx++) {
        const p = invProducts[pIdx];
        const row = worksheet.getRow(currentRow);

        // Nếu vượt số dòng ban đầu của mẫu, sao chép định dạng từ Dòng 9
        if (currentRow > 9) {
          row.height = firstDataRow.height;
          firstDataRow.eachCell({ includeEmpty: true }, (srcCell, colNumber) => {
            const destCell = row.getCell(colNumber);
            // Chỉ copy style, KHÔNG copy value/formula để tránh lỗi Shared Formula
            destCell.style = JSON.parse(JSON.stringify(srcCell.style));
            destCell.value = null; // Reset value để xóa mọi shared formula reference
          });
        }

        // Điền giá trị mặc định cho Cột A và Cột L
        row.getCell(1).value = defaultColA;
        if (colIndices.warehouseCode) {
          row.getCell(colIndices.warehouseCode).value = defaultColL;
        }

        // Điền các cột chung từ hóa đơn
        if (colIndices.date) row.getCell(colIndices.date).value = dateStr;
        // Ghép Số chứng từ = số hoá đơn (bỏ số 0 đầu) + ký hiệu serial
        // VD: 00029613 + 1C26TAA -> 296131C26TAA
        const invoiceNumStripped = inv.invoiceNumber ? String(inv.invoiceNumber).replace(/^0+/, '') : '';
        const serialStr = inv.serial || '';
        const documentNumber = invoiceNumStripped ? (invoiceNumStripped + serialStr) : serialStr;
        if (colIndices.serial) row.getCell(colIndices.serial).value = documentNumber;
        if (colIndices.supplierCode) row.getCell(colIndices.supplierCode).value = supplierCode;
        if (colIndices.supplierName) row.getCell(colIndices.supplierName).value = supplierName;

        // Cột F (Diễn giải) và Cột G (Hình thức thanh toán): Fill đầy đủ cho mọi dòng sản phẩm
        if (colIndices.description) {
          row.getCell(colIndices.description).value = descriptionText;
        }
        if (colIndices.paymentMethod) {
          row.getCell(colIndices.paymentMethod).value = inv.paymentMethod || 'Tiền mặt';
        }

        // 3. Logic đối chiếu sản phẩm trong hệ thống (nhất quán với logic parse-invoice)
        const systemMatch = systemProducts.find(sysP => {
          const prodNameLower = (p.name || '').toLowerCase().trim();
          const prodCodeLower = (p.code || '').toLowerCase().trim();
          const sysCodeLower = (sysP.ma || '').toLowerCase().trim();
          const sysNameLower = (sysP.ten || '').toLowerCase().trim();

          // 1. Kiểm tra khớp mã sản phẩm trước
          if (prodCodeLower && sysCodeLower === prodCodeLower) return true;
          if (prodNameLower.includes(sysCodeLower) || sysCodeLower.includes(prodNameLower)) return true;

          // 2. Nếu không khớp mã, kiểm tra khớp tên
          const prodNums = (prodNameLower.match(/\d+(\.\d+)?/g) || []).join(',');
          const sysNums = (sysNameLower.match(/\d+(\.\d+)?/g) || []).join(',');
          if (prodNums !== sysNums) return false;

          const sim = calculateSimilarity(prodNameLower, sysNameLower);
          if (sim >= 0.85) return true;
          if (prodNameLower.length >= 6 && sysNameLower.length >= 6) {
            if (prodNameLower.includes(sysNameLower) || sysNameLower.includes(prodNameLower)) return true;
          }
          return false;
        });

        let pCode = 'SP_MOI';
        let pName = p.name || '';
        let pUnit = p.unit || '';
        if (systemMatch) {
          pCode = systemMatch.ma;
          pName = systemMatch.ten;
          pUnit = systemMatch.donvi || pUnit;
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
        if (colIndices.unit) row.getCell(colIndices.unit).value = pUnit;
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


// API xuất danh sách sản phẩm mới ra file MISA eShop Nhap_khau_hang_hoa.xlsx (dùng template gốc, clone dòng mẫu 6)
app.post('/api/tools/export-new-products', requireAdmin, async (req, res) => {
  try {
    const newProducts = req.body;
    if (!newProducts || !Array.isArray(newProducts) || newProducts.length === 0) {
      return res.status(400).json({ ok: false, message: 'Danh sách sản phẩm không hợp lệ.' });
    }

    const templatePath = path.join(__dirname, 'data', 'template', 'Nhap_khau_hang_hoa.xlsx');
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy file mẫu Nhap_khau_hang_hoa.xlsx' });
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    // Dò tìm sheet 'Tep nhap khau' — PHẢI bắt đầu bằng "tep" để tránh khớp nhầm "Hướng dẫn nhập khẩu"
    let worksheet = workbook.worksheets.find(ws => {
      const n = ws.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
      return n.startsWith("tep nhap khau") || n.startsWith("tep_nhap_khau");
    });
    if (!worksheet) {
      // Fallback: tìm sheet có tên chứa "nhap khau" nhưng KHÔNG chứa "huong dan"
      worksheet = workbook.worksheets.find(ws => {
        const n = ws.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
        return n.includes("nhap khau") && !n.includes("huong dan");
      });
    }
    if (!worksheet) {
      worksheet = workbook.getWorksheet(2) || workbook.getWorksheet(1);
    }

    // ===== HÀM SINH MÃ HÀNG HÓA (SKU) =====
    // Viết hoa hoàn toàn, bỏ dấu tiếng Việt, bỏ tất cả khoảng trắng & ký tự đặc biệt
    // Ví dụ: "Ống ruột gà âm tường Ø 20" → "ONGRUOTGA20"
    function generateSku(str) {
      if (!str) return 'SPMOI';
      let sku = str.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // bỏ dấu tiếng Việt
        .replace(/[đĐ]/g, 'd')            // chuyển đ/Đ thành d
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');        // chỉ giữ chữ cái và số
      // Giới hạn tối đa 20 ký tự theo yêu cầu MISA
      if (sku.length > 20) sku = sku.substring(0, 20);
      return sku || 'SPMOI';
    }

    // ===== ĐỌC DỮ LIỆU DÒNG MẪU SỐ 6 (chứa đầy đủ các cột mặc định phía sau) =====
    const sourceRow = worksheet.getRow(6);
    // Lưu toàn bộ giá trị dòng mẫu 6 vào map {colIndex: value} để clone chính xác
    const sourceMap = {};
    const maxCol = worksheet.columnCount || 58;
    for (let c = 1; c <= maxCol; c++) {
      const val = sourceRow.getCell(c).value;
      if (val !== null && val !== undefined) {
        sourceMap[c] = val;
      }
    }
    // Xóa cột E (index 5 = Mã vạch) khỏi sourceMap — không cần điền
    delete sourceMap[5];

    // Lưu số dòng ban đầu của template để dọn dẹp dòng thừa sau cùng
    const originalRowCount = worksheet.rowCount;

    // ===== GHI DỮ LIỆU SẢN PHẨM MỚI =====
    let currentLine = 6; // Bắt đầu ghi từ dòng 6 (ghi đè lên dòng mẫu)

    for (let i = 0; i < newProducts.length; i++) {
      const p = newProducts[i];
      const row = worksheet.getRow(currentLine);

      // Bước 1: Xóa sạch TOÀN BỘ ô của dòng này trước (tránh sót dữ liệu cũ từ template)
      for (let c = 1; c <= maxCol; c++) {
        row.getCell(c).value = null;
      }

      // Bước 2: Copy từng ô từ dòng mẫu 6 (chỉ copy những ô có giá trị)
      for (const [col, val] of Object.entries(sourceMap)) {
        row.getCell(Number(col)).value = val;
      }

      // Bước 3: Xử lý đơn giá — BẮT BUỘC ép kiểu số thuần túy
      let priceVal = 0;
      if (p.price !== undefined && p.price !== null) {
        let raw = String(p.price).replace(/[^\d.,-]/g, '');
        const lastComma = raw.lastIndexOf(',');
        const lastDot = raw.lastIndexOf('.');
        if (lastComma > lastDot) {
          raw = raw.replace(/\./g, '').replace(/,/g, '.');
        } else {
          raw = raw.replace(/,/g, '');
        }
        priceVal = Number(raw) || parseFloat(raw);
        if (isNaN(priceVal)) priceVal = 0;
      }

      // Bước 4: Ghi đè các thông tin sản phẩm mới vào đúng cột tĩnh (C=3, D=4, G=7, H=8, I=9)
      row.getCell(3).value = 'Hàng hóa không có thuộc tính';
      row.getCell(4).value = generateSku(p.name);
      row.getCell(5).value = null; // Đảm bảo cột E (Mã vạch) luôn trống
      row.getCell(7).value = p.name || '';
      row.getCell(8).value = Math.round(priceVal);
      row.getCell(9).value = p.unit || '';

      row.commit();
      currentLine++;
    }

    // ===== DỌN DẸP CÁC DÒNG MẪU THỪA CÒN SÓT LẠI Ở TEMPLATE GỐC =====
    for (let r = currentLine; r <= originalRowCount; r++) {
      const row = worksheet.getRow(r);
      // Xóa trắng giá trị từng ô (không xóa dòng để tránh lỗi merge cell)
      const colCount = worksheet.columnCount || 20;
      for (let c = 1; c <= colCount; c++) {
        row.getCell(c).value = null;
      }
      row.commit();
    }

    // ===== TRẢ FILE VỀ CLIENT =====
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Danh_sach_hang_hoa_moi_MISA.xlsx');
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Lỗi API export-new-products đầy đủ:', err);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        message: 'Lỗi máy chủ khi xuất Excel hàng hóa mới: ' + err.message,
        stack: err.stack
      });
    }
  }
});

app.get('/api/admin/tools/download-images-zip', requireAdmin, async (req, res) => {
  try {
    const archiver = require('archiver');

    // Set headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="images.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });

    // Listen for errors
    archive.on('error', (err) => {
      console.error('Lỗi khi tạo ZIP:', err);
      if (!res.headersSent) {
        res.status(500).end('Lỗi máy chủ khi tạo file ZIP.');
      }
    });

    // Pipe archive directly to response
    archive.pipe(res);

    // List all objects from Cloudflare R2 (products + slides)
    const allItems = await listFiles('');
    for (const item of allItems) {
      if (!/\.(png|jpe?g|gif|webp|bmp|jfif|pdf)$/i.test(item.key)) continue;
      try {
        const resp = await fetch(item.url);
        if (resp.ok) {
          const arrayBuffer = await resp.arrayBuffer();
          // item.key is like "products/file.jpg" or "slides/file.jpg"
          archive.append(Buffer.from(arrayBuffer), { name: item.key });
        } else {
          console.warn('Lỗi tải file từ R2:', item.url, resp.status);
        }
      } catch (fetchErr) {
        console.warn('Exception khi tải file từ R2:', item.url, fetchErr);
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('Lỗi API download-images-zip:', err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: 'Lỗi tải ảnh: ' + err.message });
    }
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
