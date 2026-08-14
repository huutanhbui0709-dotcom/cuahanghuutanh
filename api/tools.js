'use strict';
require('dotenv').config();

// Dọn dẹp dấu nháy kép/đơn và khoảng trắng thừa của biến môi trường
for (const key in process.env) {
  if (typeof process.env[key] === 'string') {
    process.env[key] = process.env[key].replace(/^["']|["']$/g, '').trim();
  }
}

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie');
const express = require('express');
const multer = require('multer');

const { neon } = require('@neondatabase/serverless');
const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const sql = dbUrl ? neon(dbUrl, { fullResults: true }) : null;

// ── Storage (Cloudflare R2) ───────────────────────────────────────────
const { uploadImageFile, listFiles } = require('../lib/storage');

const IS_VERCEL = !!process.env.VERCEL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-please';

// ── Auth helper (giống server.js) ─────────────────────────────────────
function parseCookies(request) {
  const cookieHeader = request.headers.cookie || '';
  try {
    return cookieParser.parse(cookieHeader);
  } catch (err) {
    return {};
  }
}

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies.admin_token;
  const expectedToken = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update('admin')
    .digest('hex');
  if (token === expectedToken) return next();
  return res.status(401).json({ ok: false, message: 'Chưa đăng nhập quản trị.' });
}

// ── ExcelJS monkey-patch (chống crash MISA template) ─────────────────
let isExcelJsPatched = false;
function applyExcelJsPatch() {
  if (isExcelJsPatched) return;
  try {
    const CfRuleXform = require('exceljs/lib/xlsx/xform/sheet/cf/cf-rule-xform');
    const _origRender = CfRuleXform.prototype.render;
    CfRuleXform.prototype.render = function (xmlStream, model) {
      if (model) { if (!model.formulae) model.formulae = []; }
      try { return _origRender.call(this, xmlStream, model); } catch (e) {
        console.warn('[ExcelJS Warning] Bỏ qua lỗi CfRuleXform.render:', e.message);
      }
    };
    const _origRenderExpression = CfRuleXform.prototype.renderExpression;
    CfRuleXform.prototype.renderExpression = function (xmlStream, model) {
      if (model) {
        if (!model.formulae) model.formulae = [];
        if (model.formulae.length === 0) model.formulae.push('');
      }
      try { return _origRenderExpression.call(this, xmlStream, model); } catch (e) {
        console.warn('[ExcelJS Warning] Bỏ qua lỗi renderExpression:', e.message);
      }
    };
    const _origRenderCellIs = CfRuleXform.prototype.renderCellIs;
    CfRuleXform.prototype.renderCellIs = function (xmlStream, model) {
      if (model) { if (!model.formulae) model.formulae = []; }
      try { return _origRenderCellIs.call(this, xmlStream, model); } catch (e) {
        console.warn('[ExcelJS Warning] Bỏ qua lỗi renderCellIs:', e.message);
      }
    };
    isExcelJsPatched = true;
  } catch (ignored) { }
}

// ── Load shared state tối thiểu từ DB ────────────────────────────────
// (tools function cần products, suppliers, settings để đối chiếu sản phẩm)
let products = [];
let suppliers = [];
let settings = {};
let isInitialized = false;
let initPromise = null;

async function loadSharedState() {
  const prodPath = path.join(__dirname, '..', 'data', 'products.json');
  const supPath = path.join(__dirname, '..', 'data', 'suppliers.json');
  const setPath = path.join(__dirname, '..', 'data', 'settings.json');

  if (sql && typeof sql === 'function') {
    try {
      const [prodResult, supResult, setResult] = await Promise.all([
        sql`SELECT value FROM app_settings WHERE key = 'products'`,
        sql`SELECT value FROM app_settings WHERE key = 'suppliers'`,
        sql`SELECT value FROM app_settings WHERE key = 'settings'`,
      ]);
      const prodRows = prodResult.rows ?? prodResult;
      const supRows = supResult.rows ?? supResult;
      const setRows = setResult.rows ?? setResult;

      if (prodRows.length > 0) products = JSON.parse(prodRows[0].value);
      if (supRows.length > 0) suppliers = JSON.parse(supRows[0].value);
      if (setRows.length > 0) settings = JSON.parse(setRows[0].value);

      console.log(`[tools] Đã load: ${products.length} sản phẩm, ${suppliers.length} nhà cung cấp từ Vercel DB.`);
      isInitialized = true;
      return;
    } catch (err) {
      console.error('[tools] Lỗi load shared state từ DB:', err.message);
    }
  }

  // Fallback to local files
  try {
    if (fs.existsSync(prodPath)) products = JSON.parse(fs.readFileSync(prodPath, 'utf8'));
    if (fs.existsSync(supPath)) suppliers = JSON.parse(fs.readFileSync(supPath, 'utf8'));
    if (fs.existsSync(setPath)) settings = JSON.parse(fs.readFileSync(setPath, 'utf8'));
    console.log(`[tools] Đã load: ${products.length} sản phẩm, ${suppliers.length} nhà cung cấp từ File cục bộ.`);
  } catch (err) {
    console.error('[tools] Lỗi load shared state từ File cục bộ:', err.message);
  }
  isInitialized = true;
}

async function ensureInitialized() {
  if (isInitialized) return;
  if (!initPromise) initPromise = loadSharedState();
  await initPromise;
}

// ── Multer configs ────────────────────────────────────────────────────
const uploadInvoice = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (/\.(pdf|png|jpe?g|webp|bmp|jfif)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file PDF hoặc hình ảnh (PNG, JPG, WEBP, BMP, JFIF).'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (/\.(xlsx|xls)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file Excel (.xlsx hoặc .xls).'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── Helper functions ──────────────────────────────────────────────────
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

function normalizeProductCode(c) {
  if (!c) return '';
  return String(c).trim().toLowerCase()
    .replace(/[/:*?"<>|]/g, '_')
    .replace(/[-\s]/g, '_');
}

function compactName(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[\s\-×x\/\.]/g, '') // bỏ space, gạch ngang, dấu x/×, dấu chấm, dấu slash
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

// ── Express app ───────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// Middleware: initialize shared state trước khi xử lý request
app.use(async (req, res, next) => {
  try {
    await ensureInitialized();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  } catch (err) {
    console.error('[tools] Lỗi khởi tạo:', err);
    res.status(500).send('Lỗi khởi tạo tools server.');
  }
});

// =====================================================================
// ROUTE: POST /api/tools/parse-invoice (Gemini AI — đọc hóa đơn GTGT)
// =====================================================================
app.post('/api/tools/parse-invoice', requireAdmin, uploadInvoice.array('files', 15), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, message: 'Không có file PDF hoặc hình ảnh nào được tải lên.' });
    }

    const apiKey = (settings.geminiKeySource === 'custom' && settings.geminiApiKey)
      ? settings.geminiApiKey
      : process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, message: 'Chưa cấu hình Gemini API Key trong hệ thống. Vui lòng nhập ở phần Công cụ hoặc kiểm tra cấu hình file .env.' });
    }

    const systemProducts = products;
    const systemSuppliers = suppliers;

    // Lazy-load heavy lib
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const results = [];

    for (const file of req.files) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      try {
        const prompt = `Hãy đọc hóa đơn GTGT (dạng PDF hoặc hình ảnh) được cung cấp và trích xuất thông tin chi tiết chính xác theo định dạng JSON sau:\n{\n  "sellerName": "Tên đơn vị bán hàng",\n  "serial": "Ký hiệu hóa đơn (Ký hiệu / Serial, ví dụ: 1C26TAA)",\n  "invoiceNumber": "Số hóa đơn (Số / No., ví dụ: 00029613)",\n  "taxCode": "Mã của cơ quan thuế hoặc Mã số thuế người bán",\n  "invoiceDate": {\n    "date": "Ngày (dạng số ví dụ: 25)",\n    "month": "Tháng (dạng số ví dụ: 06)",\n    "year": "Năm (dạng số ví dụ: 2026)"\n  },\n  "products": [\n    {\n      "name": "Tên sản phẩm",\n      "unit": "ĐVT",\n      "quantity": 10,\n      "price": 5000,\n      "amount": 50000,\n      "taxPercent": 10\n    }\n  ]\n}\nLưu ý: "taxPercent" là phần trăm thuế suất GTGT (VAT) áp dụng riêng cho sản phẩm đó (ví dụ: 0, 5, 8, 10). Nếu không ghi thuế hoặc thuế suất là 0% thì trả về 0.`;

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
        let cleanedText = textResult
          .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
          .replace(/\/\/[^\n]*/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,\s*([}\]])/g, '$1')
          .trim();

        if (!cleanedText.startsWith('{') && !cleanedText.startsWith('[')) {
          const firstBrace = cleanedText.indexOf('{');
          const firstBracket = cleanedText.indexOf('[');
          const start = firstBrace === -1 ? firstBracket : (firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket));
          if (start !== -1) cleanedText = cleanedText.slice(start);
        }

        const parsed = JSON.parse(cleanedText);

        if (parsed.products && Array.isArray(parsed.products)) {
          for (const prod of parsed.products) {
            const prodNameLower = (prod.name || '').toLowerCase().trim();
            const prodCodeLower = (prod.code || '').toLowerCase().trim();
            const hasMatch = systemProducts.some(sysP => {
              const sysCodeRaw = (sysP.ma || '').toLowerCase().trim();
              const sysNameLower = (sysP.ten || '').toLowerCase().trim();

              // 1. Khớp chính xác theo mã SP
              if (prodCodeLower && sysCodeRaw && sysCodeRaw === prodCodeLower) return true;
              // 2. Mã SP có trong tên sản phẩm hóa đơn (vd: "...model COV-22-RS")
              if (sysCodeRaw && prodNameLower.includes(sysCodeRaw)) return true;
              if (sysCodeRaw.length >= 6 && sysCodeRaw.includes(prodNameLower)) return true;

              // 3. So sánh tên rút gọn: bỏ khoảng trắng/dấu phân cách
              // VD: "màn phủ 1mx100m" ↔ "màn phủ 1m x 100m" → compact khớp
              const prodCompact = compactName(prodNameLower);
              const sysCompact = compactName(sysNameLower);
              if (prodCompact && sysCompact) {
                if (prodCompact === sysCompact) return true;
                const minLen = Math.min(prodCompact.length, sysCompact.length);
                if (minLen >= 5 && (prodCompact.includes(sysCompact) || sysCompact.includes(prodCompact))) return true;
              }

              // 4. Số chứa trong tên (soft guard — chỉ loại nếu cả hai có số VÀ khác nhau rõ ràng)
              const prodNums = (prodNameLower.match(/\d+/g) || []).sort().join(',');
              const sysNums = (sysNameLower.match(/\d+/g) || []).sort().join(',');
              if (prodNums && sysNums && prodNums !== sysNums) return false;

              // 5. Độ tương đồng Levenshtein (ngưỡng 0.80)
              const sim = calculateSimilarity(prodNameLower, sysNameLower);
              if (sim >= 0.80) return true;

              // 6. Tên nằm trong nhau (tên dài bao tên ngắn)
              if (prodNameLower.length >= 5 && sysNameLower.length >= 5) {
                if (prodNameLower.includes(sysNameLower) || sysNameLower.includes(prodNameLower)) return true;
              }
              return false;
            });
            if (!hasMatch) prod.isNewSystemProduct = true;
          }
        }

        if (parsed.sellerName && systemSuppliers.length > 0) {
          const sellerLower = parsed.sellerName.toLowerCase().trim();
          const supplierMatch = systemSuppliers.some(sup => {
            const supName = (sup.name || '').toLowerCase().trim();
            if (!supName) return false;
            const sim = calculateSimilarity(sellerLower, supName);
            return sim >= 0.8 || sellerLower.includes(supName) || supName.includes(sellerLower);
          });
          if (!supplierMatch) parsed.isNewSupplier = true;
        }

        results.push({ ok: true, fileName: originalName, data: parsed });
      } catch (err) {
        console.error(`Lỗi xử lý file ${originalName}:`, err);
        results.push({ ok: false, fileName: originalName, message: err.message });
      } finally {
        file.buffer = null;
      }
    }

    res.json({ ok: true, results });
  } catch (err) {
    console.error('Lỗi API parse-invoice:', err);
    res.status(500).json({ ok: false, message: 'Lỗi máy chủ khi xử lý hóa đơn: ' + err.message });
  }
});

// =====================================================================
// ROUTE: POST /api/tools/export-inventory (ExcelJS — xuất phiếu nhập kho)
// =====================================================================
app.post('/api/tools/export-inventory', requireAdmin, async (req, res) => {
  try {
    let invoices = req.body;
    if (!invoices) return res.status(400).json({ ok: false, message: 'Dữ liệu hóa đơn không hợp lệ.' });
    if (!Array.isArray(invoices)) invoices = [invoices];

    const templatePath = path.join(__dirname, '..', 'data', 'template', 'Nhap_khau_phieu_nhap_kho.xlsx');
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy file template Nhap_khau_phieu_nhap_kho.xlsx' });
    }

    applyExcelJsPatch();
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    let worksheet = workbook.getWorksheet(1);

    const suppliersList = suppliers;
    const systemProducts = products;

    const normalizeName = (str) => {
      if (!str) return '';
      return str.toLowerCase().replace(/\s+/g, ' ').replace(/[.,-]/g, '').trim();
    };

    let headerRowNumber = 8;
    let colIndices = {
      date: 2, serial: 3, supplierCode: 4, supplierName: 5, description: 6,
      paymentMethod: 7, productCode: 8, productName: 9, warehouseCode: 12,
      unit: 14, quantity: 15, price: 16, amount: 17,
      discountPercent: 18, discountAmount: 19, taxPercent: 20, taxAmount: 21, paymentAmount: 22
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
      if (val.includes('tên') && (val.includes('sản phẩm') || val.includes('hàng') || val.includes('vật tư'))) colIndices.productName = colNumber;
      if (val.includes('đơn vị tính') || val === 'đvt') colIndices.unit = colNumber;
      if (val.includes('số lượng')) colIndices.quantity = colNumber;
      if (val.includes('đơn giá')) colIndices.price = colNumber;
      if (val.includes('thành tiền')) colIndices.amount = colNumber;
      if (val === 'ngày' || val.includes('ngày chứng từ') || val.includes('ngày hóa đơn') || val.includes('ngày ct')) colIndices.date = colNumber;
      if (val.includes('số chứng từ') || val.includes('số hóa đơn') || val.includes('ký hiệu')) colIndices.serial = colNumber;
      if (val.includes('mã đối tượng') || val.includes('mã nhà cung cấp') || val.includes('mã khách')) colIndices.supplierCode = colNumber;
      if (val.includes('tên đối tượng') || val.includes('tên nhà cung cấp') || val.includes('tên khách')) colIndices.supplierName = colNumber;
      if (val.includes('mã sản phẩm') || val.includes('mã hàng') || val.includes('mã vật tư')) colIndices.productCode = colNumber;
      if (val.includes('hình thức') || val === 'hình thức thanh toán') colIndices.paymentMethod = colNumber;
      if (val.includes('thuế suất') || val === 'thuế (%)' || val === '% thuế') colIndices.taxPercent = colNumber;
      if (val.includes('tiền thuế') || val.includes('thuế gtgt')) {
        if (!val.includes('suất') && !val.includes('%')) colIndices.taxAmount = colNumber;
      }
    });

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

    const _row9 = worksheet.getRow(9);
    const defaultColA = _row9.getCell(1).value;
    const defaultColL = _row9.getCell(colIndices.warehouseCode || 12).value;

    worksheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v && typeof v === 'object' && (v.formula || v.sharedFormula)) {
          cell.value = (v.result !== undefined && v.result !== null) ? v.result : null;
        }
      });
    });

    const _cleanBuf = await workbook.xlsx.writeBuffer();
    await workbook.xlsx.load(_cleanBuf);
    worksheet = workbook.getWorksheet(1);

    const firstDataRow = worksheet.getRow(9);
    const lastTemplateRow = worksheet.rowCount;
    for (let r = 9; r <= lastTemplateRow; r++) {
      const tplRow = worksheet.getRow(r);
      tplRow.eachCell({ includeEmpty: true }, (cell) => { cell.value = null; });
      tplRow.commit();
    }

    let currentRow = headerRowNumber + 1;

    for (const inv of invoices) {
      const sellerNameNormalized = normalizeName(inv.sellerName);
      const foundSupplier = suppliersList.find(s => {
        const supNorm = normalizeName(s.name);
        if (!supNorm) return false;
        const sim = calculateSimilarity(supNorm, sellerNameNormalized);
        return supNorm === sellerNameNormalized || sim >= 0.8 || supNorm.includes(sellerNameNormalized) || sellerNameNormalized.includes(supNorm);
      });

      let supplierCode = 'NCC_MOI';
      let supplierName = inv.sellerName || 'N/A';
      if (foundSupplier) { supplierCode = foundSupplier.code; supplierName = foundSupplier.name; }

      let dateStr = '';
      if (inv.invoiceDate) {
        const d = String(inv.invoiceDate.date || '').padStart(2, '0');
        const m = String(inv.invoiceDate.month || '').padStart(2, '0');
        const y = inv.invoiceDate.year || '';
        if (d && m && y) dateStr = `${d}/${m}/${y}`;
      }

      const descriptionText = `Nhập kho hàng hóa hóa đơn của NCC ${supplierCode} - Số HĐ: ${inv.invoiceNumber || inv.serial || ''} ngày ${dateStr}`;
      const invProducts = inv.products || [];

      for (let pIdx = 0; pIdx < invProducts.length; pIdx++) {
        const p = invProducts[pIdx];
        const row = worksheet.getRow(currentRow);

        if (currentRow > 9) {
          row.height = firstDataRow.height;
          firstDataRow.eachCell({ includeEmpty: true }, (srcCell, colNumber) => {
            const destCell = row.getCell(colNumber);
            destCell.style = JSON.parse(JSON.stringify(srcCell.style));
            destCell.value = null;
          });
        }

        row.getCell(1).value = defaultColA;
        if (colIndices.warehouseCode) row.getCell(colIndices.warehouseCode).value = defaultColL;
        if (colIndices.date) row.getCell(colIndices.date).value = dateStr;

        const invoiceNumStripped = inv.invoiceNumber ? String(inv.invoiceNumber).replace(/^0+/, '') : '';
        const serialStr = inv.serial || '';
        const documentNumber = invoiceNumStripped ? (invoiceNumStripped + serialStr) : serialStr;

        if (colIndices.serial) row.getCell(colIndices.serial).value = documentNumber;
        if (colIndices.supplierCode) row.getCell(colIndices.supplierCode).value = supplierCode;
        if (colIndices.supplierName) row.getCell(colIndices.supplierName).value = supplierName;
        if (colIndices.description) row.getCell(colIndices.description).value = descriptionText;
        if (colIndices.paymentMethod) row.getCell(colIndices.paymentMethod).value = inv.paymentMethod || 'Tiền mặt';

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
        let pUnit = p.unit || '';
        if (systemMatch) { pCode = systemMatch.ma; pName = systemMatch.ten; pUnit = systemMatch.donvi || pUnit; }

        const qty = parseCleanNumber(p.quantity);
        const price = parseCleanNumber(p.price);
        const amount = parseCleanNumber(p.amount);

        if (colIndices.productCode) row.getCell(colIndices.productCode).value = pCode;
        if (colIndices.productName) row.getCell(colIndices.productName).value = pName;
        if (colIndices.unit) row.getCell(colIndices.unit).value = pUnit;
        if (colIndices.quantity) row.getCell(colIndices.quantity).value = qty;
        if (colIndices.price) row.getCell(colIndices.price).value = price;
        if (colIndices.amount) row.getCell(colIndices.amount).value = amount;

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

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Nhap_khau_phieu_nhap_kho_export.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Lỗi API export-inventory:', err);
    res.status(500).json({ ok: false, message: 'Lỗi máy chủ khi xuất Excel: ' + err.message });
  }
});

// =====================================================================
// ROUTE: POST /api/tools/export-new-products (ExcelJS — xuất hàng hóa mới MISA)
// =====================================================================
app.post('/api/tools/export-new-products', requireAdmin, async (req, res) => {
  try {
    const newProducts = req.body;
    if (!newProducts || !Array.isArray(newProducts) || newProducts.length === 0) {
      return res.status(400).json({ ok: false, message: 'Danh sách sản phẩm không hợp lệ.' });
    }

    const templatePath = path.join(__dirname, '..', 'data', 'template', 'Nhap_khau_hang_hoa.xlsx');
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy file mẫu Nhap_khau_hang_hoa.xlsx' });
    }

    applyExcelJsPatch();
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    let worksheet = workbook.worksheets.find(ws => {
      const n = ws.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
      return n.startsWith('tep nhap khau') || n.startsWith('tep_nhap_khau');
    });
    if (!worksheet) {
      worksheet = workbook.worksheets.find(ws => {
        const n = ws.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        return n.includes('nhap khau') && !n.includes('huong dan');
      });
    }
    if (!worksheet) worksheet = workbook.getWorksheet(2) || workbook.getWorksheet(1);

    function generateSku(str) {
      if (!str) return 'SPMOI';
      let sku = str.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      if (sku.length > 20) sku = sku.substring(0, 20);
      return sku || 'SPMOI';
    }

    const sourceRow = worksheet.getRow(6);
    const sourceMap = {};
    const maxCol = worksheet.columnCount || 58;
    for (let c = 1; c <= maxCol; c++) {
      const val = sourceRow.getCell(c).value;
      if (val !== null && val !== undefined) sourceMap[c] = val;
    }
    delete sourceMap[5];

    const originalRowCount = worksheet.rowCount;
    let currentLine = 6;

    for (let i = 0; i < newProducts.length; i++) {
      const p = newProducts[i];
      const row = worksheet.getRow(currentLine);

      for (let c = 1; c <= maxCol; c++) row.getCell(c).value = null;
      for (const [col, val] of Object.entries(sourceMap)) row.getCell(Number(col)).value = val;

      let priceVal = 0;
      if (p.price !== undefined && p.price !== null) {
        let raw = String(p.price).replace(/[^\d.,-]/g, '');
        const lastComma = raw.lastIndexOf(',');
        const lastDot = raw.lastIndexOf('.');
        if (lastComma > lastDot) { raw = raw.replace(/\./g, '').replace(/,/g, '.'); }
        else { raw = raw.replace(/,/g, ''); }
        priceVal = Number(raw) || parseFloat(raw);
        if (isNaN(priceVal)) priceVal = 0;
      }

      row.getCell(3).value = 'Hàng hóa không có thuộc tính';
      row.getCell(4).value = generateSku(p.name);
      row.getCell(5).value = null;
      row.getCell(7).value = p.name || '';
      row.getCell(8).value = Math.round(priceVal);
      row.getCell(9).value = p.unit || '';
      row.commit();
      currentLine++;
    }

    for (let r = currentLine; r <= originalRowCount; r++) {
      const row = worksheet.getRow(r);
      const colCount = worksheet.columnCount || 20;
      for (let c = 1; c <= colCount; c++) row.getCell(c).value = null;
      row.commit();
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Danh_sach_hang_hoa_moi_MISA.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Lỗi API export-new-products:', err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: 'Lỗi máy chủ khi xuất Excel hàng hóa mới: ' + err.message });
    }
  }
});

// =====================================================================
// ROUTE: POST /api/suppliers/import (xlsx — import nhà cung cấp từ Excel)
// =====================================================================
app.post('/api/suppliers/import', requireAdmin, uploadExcel.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'Không có file nào được tải lên.' });

    const XLSX = require('xlsx');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (rawData.length < 3) {
      return res.status(400).json({ ok: false, message: 'File Excel không đúng định dạng hoặc không chứa đủ dữ liệu.' });
    }

    const headers = rawData[2];
    const colMap = {
      code: headers.findIndex(h => String(h || '').trim() === 'Mã nhà cung cấp'),
      name: headers.findIndex(h => String(h || '').trim() === 'Tên nhà cung cấp'),
      phone: headers.findIndex(h => String(h || '').trim() === 'Số điện thoại'),
      status: headers.findIndex(h => String(h || '').trim() === 'Trạng thái')
    };

    if (colMap.code === -1 || colMap.name === -1) {
      return res.status(400).json({ ok: false, message: 'File Excel thiếu các cột bắt buộc: "Mã nhà cung cấp", "Tên nhà cung cấp".' });
    }

    // Đọc fresh suppliers từ DB để tránh stale cache
    let currentSuppliers = [...suppliers];
    try {
      const rows = await sql`SELECT value FROM app_settings WHERE key = 'suppliers'`;
      if (rows.length > 0) currentSuppliers = JSON.parse(rows[0].value);
    } catch (err) {
      console.error('[tools] Lỗi đọc suppliers từ DB:', err.message);
    }

    let addedCount = 0;
    let updatedCount = 0;

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

    const content = JSON.stringify(currentSuppliers);
    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('suppliers', ${content}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `;
    // Cập nhật cache RAM của function này
    suppliers = currentSuppliers;

    res.json({ ok: true, message: `Import thành công! Thêm mới: ${addedCount}, Cập nhật: ${updatedCount}`, added: addedCount, updated: updatedCount });
  } catch (err) {
    console.error('Lỗi API import nhà cung cấp:', err);
    res.status(500).json({ ok: false, message: 'Lỗi xử lý file Excel: ' + err.message });
  } finally {
    if (req.file) req.file.buffer = null;
  }
});

// =====================================================================
// ROUTE: GET /api/admin/tools/download-images-zip (archiver — tải ZIP ảnh R2)
// =====================================================================
app.get('/api/admin/tools/download-images-zip', requireAdmin, async (req, res) => {
  try {
    // Lazy import archiver (heavy)
    const { ZipArchive } = await import('archiver');
    const { PassThrough } = require('stream');

    const allItems = await listFiles('');
    const imageItems = allItems.filter(item => /\.(png|jpe?g|gif|webp|bmp|jfif|pdf)$/i.test(item.key));

    const CONCURRENCY = 5;
    const fetched = [];
    for (let i = 0; i < imageItems.length; i += CONCURRENCY) {
      const batch = imageItems.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(async (item) => {
        const resp = await fetch(item.url);
        if (!resp.ok) { console.warn('Lỗi tải file từ R2:', item.url, resp.status); return null; }
        const arrayBuffer = await resp.arrayBuffer();
        return { key: item.key, buffer: Buffer.from(arrayBuffer) };
      }));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) fetched.push(r.value);
        else if (r.status === 'rejected') console.warn('Exception khi tải ảnh R2:', r.reason);
      }
    }

    const chunks = [];
    const passthrough = new PassThrough();
    passthrough.on('data', (chunk) => chunks.push(chunk));

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('Lỗi khi tạo ZIP:', err);
      if (!res.headersSent) res.status(500).json({ ok: false, message: 'Lỗi tạo ZIP: ' + err.message });
    });

    archive.pipe(passthrough);
    for (const { key, buffer } of fetched) archive.append(buffer, { name: key });

    await new Promise((resolve, reject) => {
      passthrough.on('end', resolve);
      passthrough.on('error', reject);
      archive.finalize();
    });

    const zipBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="images.zip"');
    res.setHeader('Content-Length', zipBuffer.length);
    res.end(zipBuffer);
  } catch (err) {
    console.error('Lỗi API download-images-zip:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, message: 'Lỗi tải ảnh: ' + err.message });
  }
});

module.exports = app;
