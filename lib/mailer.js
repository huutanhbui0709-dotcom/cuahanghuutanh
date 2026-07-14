// =====================================================================
// MAILER - Gửi thông báo đơn hàng qua Gmail SMTP
// Lấy thông tin xác thực từ Azure Key Vault bằng DefaultAzureCredential
// =====================================================================

const nodemailer = require('nodemailer');
const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');

const VAULT_URL = 'https://keyemailofchht.vault.azure.net';
const NOTIFY_TO = 'Cuahanghuutanh@gmail.com';

// Cache transporter để không gọi Key Vault mỗi lần gửi mail
let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  const credential = new DefaultAzureCredential();
  const client = new SecretClient(VAULT_URL, credential);

  const [userSecret, passSecret] = await Promise.all([
    client.getSecret('GmailAddress'),
    client.getSecret('GmailAppPassword'),
  ]);

  const gmailUser = userSecret.value;
  const gmailPass = passSecret.value;

  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });

  return _transporter;
}

/**
 * Tạo nội dung HTML email thông báo đơn hàng
 */
function buildOrderEmailHtml(order) {
  const rowsHtml = order.items
    .map(
      (item, i) => `
      <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#ffffff'}">
        <td style="padding:8px 12px;border:1px solid #ddd;font-family:Arial,sans-serif;">${item.ma}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;font-family:Arial,sans-serif;">${item.ten}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;text-align:center;font-family:Arial,sans-serif;">${item.qty} ${item.donvi}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;text-align:right;font-family:Arial,sans-serif;">${item.gia.toLocaleString('vi-VN')} ₫</td>
        <td style="padding:8px 12px;border:1px solid #ddd;text-align:right;font-family:Arial,sans-serif;">${(item.gia * item.qty).toLocaleString('vi-VN')} ₫</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Đơn hàng mới</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f2f5">
  <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)">
    
    <!-- Header: Đã sửa tiêu đề chính xác và xóa chữ "nh" thừa -->
    <div style="background:#e65c00;padding:24px 32px">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-family:Arial,sans-serif;font-weight:bold;text-shadow:0 1px 2px rgba(0,0,0,.15)">
        🛒 Đơn hàng mới - Cửa hàng Hữu Tánh
      </h1>
      <p style="margin:6px 0 0;color:#fff3e0;font-size:14px;font-family:Arial,sans-serif;">
        Mã đơn: <strong style="color:#ffffff">${order.id}</strong> &nbsp;|&nbsp; ${order.createdAt}
      </p>
    </div>

    <!-- Thông tin khách -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee">
      <h2 style="margin:0 0 12px;font-size:16px;color:#333;font-family:Arial,sans-serif;">👤 Thông tin khách hàng</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px;font-family:Arial,sans-serif;">
        <tr><td style="padding:4px 0;color:#888;width:140px">Họ tên:</td><td style="padding:4px 0;font-weight:bold">${order.customer}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Điện thoại:</td><td style="padding:4px 0">${order.phone}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Địa chỉ:</td><td style="padding:4px 0">${order.address}${(() => {
      const m = order.address.match(/Toạ độ:\s*([-\d.]+),\s*([-\d.]+)/);
      if (!m) return '';
      const lat = m[1], lon = m[2];
      return '<br><a href="https://www.google.com/maps?q=' + lat + ',' + lon +
        '" target="_blank" style="color:#1a73e8;font-size:13px;text-decoration:underline">' +
        '<i class="fa-solid fa-map-location-dot"></i> Xem trên Google Maps</a>';
    })()}</td></tr>
        ${order.note ? `<tr><td style="padding:4px 0;color:#888">Ghi chú:</td><td style="padding:4px 0;color:#d97706">${order.note}</td></tr>` : ''}
      </table>
    </div>

    <!-- Danh sách sản phẩm -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee">
      <h2 style="margin:0 0 12px;font-size:16px;color:#333;font-family:Arial,sans-serif;">📦 Sản phẩm đặt mua</h2>
      <table style="border-collapse:collapse;width:100%;font-size:13px;font-family:Arial,sans-serif;">
        <thead>
          <tr style="background:#e65c00;color:#fff">
            <th style="padding:8px 12px;border:1px solid #e65c00;text-align:left">Mã SP</th>
            <th style="padding:8px 12px;border:1px solid #e65c00;text-align:left">Tên sản phẩm</th>
            <th style="padding:8px 12px;border:1px solid #e65c00;text-align:center">SL</th>
            <th style="padding:8px 12px;border:1px solid #e65c00;text-align:right">Đơn giá</th>
            <th style="padding:8px 12px;border:1px solid #e65c00;text-align:right">Thành tiền</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <!-- Tổng tiền -->
    <div style="padding:16px 32px;text-align:right;background:#fff8f0">
      <span style="font-size:16px;color:#333;font-family:Arial,sans-serif;">Tổng cộng: </span>
      <span style="font-size:22px;font-weight:bold;color:#e65c00;font-family:Arial,sans-serif;">${order.total.toLocaleString('vi-VN')} ₫</span>
    </div>

    <!-- Footer: Đã ép font chữ Arial đồng bộ -->
    <div style="padding:12px 32px;background:#f5f5f5;text-align:center;font-size:12px;color:#999;font-family:Arial,sans-serif;">
      Cửa hàng Điện nước Hữu Tánh &bull; Email tự động, vui lòng không trả lời.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Gửi email thông báo đơn hàng mới.
 * Hàm không throw — lỗi chỉ được log để không ảnh hưởng response cho khách.
 * @param {object} order - Đối tượng đơn hàng đã được tạo
 */
async function sendOrderNotification(order) {
  try {
    const transporter = await getTransporter();
    const senderEmail = transporter.options?.auth?.user || 'noreply@cuahanghuutanh.com';
    const info = await transporter.sendMail({
      from: `"Cửa hàng Hữu Tánh" <${senderEmail}>`,
      to: NOTIFY_TO,
      subject: `📦 Đơn hàng mới #${order.id} - ${order.customer}`,
      html: buildOrderEmailHtml(order),
    });

    // Log đầy đủ SMTP response để debug
    console.log(`📧 Đã gửi mail đơn hàng #${order.id} → ${NOTIFY_TO}`);
    console.log(`   ├─ messageId: ${info.messageId}`);
    console.log(`   ├─ accepted: ${JSON.stringify(info.accepted)}`);
    console.log(`   ├─ rejected: ${JSON.stringify(info.rejected)}`);
    console.log(`   └─ response: ${info.response}`);

    // Cảnh báo nếu có recipient bị reject
    if (info.rejected && info.rejected.length > 0) {
      console.warn(`⚠️ SMTP đã từ chối gửi tới: ${info.rejected.join(', ')}`);
    }
  } catch (err) {
    console.error(`❌ Lỗi gửi mail đơn hàng #${order.id}:`, err.message);
    // Log thêm SMTP error code nếu có
    if (err.responseCode) console.error(`   ├─ SMTP Code: ${err.responseCode}`);
    if (err.response) console.error(`   └─ SMTP Response: ${err.response}`);
  }
}

module.exports = { sendOrderNotification };
