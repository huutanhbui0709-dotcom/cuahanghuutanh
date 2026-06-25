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
        <td style="padding:8px 12px;border:1px solid #ddd">${item.ma}</td>
        <td style="padding:8px 12px;border:1px solid #ddd">${item.ten}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;text-align:center">${item.qty} ${item.donvi}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;text-align:right">${item.gia.toLocaleString('vi-VN')} ₫</td>
        <td style="padding:8px 12px;border:1px solid #ddd;text-align:right">${(item.gia * item.qty).toLocaleString('vi-VN')} ₫</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>Đơn hàng mới</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f2f5">
  <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)">
    <!-- Header -->
    <div style="background:#e65c00;padding:24px 32px">
      <h1 style="margin:0;color:#ffffff;font-size:22px;text-shadow:0 1px 2px rgba(218, 165, 165, 0.3)">🛒 Đơn hàng mới - Cửa hàng Hữu Tảnh</h1>
      <p style="margin:6px 0 0;color:#fff3e0;font-size:14px">Mã đơn: <strong style="color:#ffffff">${order.id}</strong> &nbsp;|&nbsp; ${order.createdAt}</p>
    </div>

    <!-- Thông tin khách -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee">
      <h2 style="margin:0 0 12px;font-size:16px;color:#333">👤 Thông tin khách hàng</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr><td style="padding:4px 0;color:#888;width:140px">Họ tên:</td><td style="padding:4px 0;font-weight:bold">${order.customer}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Điện thoại:</td><td style="padding:4px 0">${order.phone}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Địa chỉ:</td><td style="padding:4px 0">${order.address}</td></tr>
        ${order.note ? `<tr><td style="padding:4px 0;color:#888">Ghi chú:</td><td style="padding:4px 0;color:#d97706">${order.note}</td></tr>` : ''}
      </table>
    </div>

    <!-- Danh sách sản phẩm -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee">
      <h2 style="margin:0 0 12px;font-size:16px;color:#333">📦 Sản phẩm đặt mua</h2>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr style="background:#e65c00;color:#fff">
            <th style="padding:8px 12px;border:1px solid #c0392b;text-align:left">Mã SP</th>
            <th style="padding:8px 12px;border:1px solid #c0392b;text-align:left">Tên sản phẩm</th>
            <th style="padding:8px 12px;border:1px solid #c0392b;text-align:center">SL</th>
            <th style="padding:8px 12px;border:1px solid #c0392b;text-align:right">Đơn giá</th>
            <th style="padding:8px 12px;border:1px solid #c0392b;text-align:right">Thành tiền</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <!-- Tổng tiền -->
    <div style="padding:16px 32px;text-align:right;background:#fff8f0">
      <span style="font-size:16px;color:#333">Tổng cộng: </span>
      <span style="font-size:22px;font-weight:bold;color:#e65c00">${order.total.toLocaleString('vi-VN')} ₫</span>
    </div>

    <!-- Footer -->
    <div style="padding:12px 32px;background:#f5f5f5;text-align:center;font-size:12px;color:#999">
      Cửa hàng Vật tư Kỹ thuật Hữu Tảnh &bull; Email tự động, vui lòng không trả lời.
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
    await transporter.sendMail({
      from: `"Cửa hàng Hữu Tánh" <${senderEmail}>`,
      to: NOTIFY_TO,
      subject: `📦 Đơn hàng mới #${order.id} - ${order.customer}`,
      html: buildOrderEmailHtml(order),
    });
    console.log(`📧 Đã gửi mail thông báo đơn hàng #${order.id} → ${NOTIFY_TO}`);
  } catch (err) {
    console.error(`❌ Lỗi gửi mail thông báo đơn hàng #${order.id}:`, err.message);
  }
}

module.exports = { sendOrderNotification };
