// Script test nhanh: kiểm tra Key Vault + gửi mail thử
// Chạy TRÊN MÁY LOCAL sẽ dùng Azure CLI credential
// Chạy TRÊN AZURE sẽ dùng Managed Identity

const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');
const nodemailer = require('nodemailer');

const VAULT_URL = 'https://keyemailofchht.vault.azure.net';

(async () => {
  console.log('=== BƯỚC 1: Kết nối Azure Key Vault ===');
  try {
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(VAULT_URL, credential);

    console.log('Đang lấy secret GmailAddress...');
    const userSecret = await client.getSecret('GmailAddress');
    console.log('✅ GmailAddress:', userSecret.value);

    console.log('Đang lấy secret GmailAppPassword...');
    const passSecret = await client.getSecret('GmailAppPassword');
    console.log('✅ GmailAppPassword:', passSecret.value ? '****(đã lấy được, ẩn giá trị)' : '❌ TRỐNG!');

    console.log('\n=== BƯỚC 2: Thử gửi mail ===');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: userSecret.value, pass: passSecret.value },
    });

    const info = await transporter.sendMail({
      from: `"Test Cửa Hàng" <${userSecret.value}>`,
      to: 'Cuahanghuutanh@gmail.com',
      subject: '✅ Test mail từ hệ thống - ' + new Date().toLocaleString('vi-VN'),
      html: '<h2>Mail test thành công!</h2><p>Nếu bạn thấy email này, hệ thống gửi mail hoạt động OK.</p>',
    });

    console.log('✅ GỬI MAIL THÀNH CÔNG!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
  } catch (err) {
    console.error('\n❌ LỖI:', err.message);
    console.error('   Chi tiết:', err.code || err.statusCode || '');
    if (err.message.includes('managed identity') || err.message.includes('IDENTITY')) {
      console.error('\n💡 GỢI Ý: Managed Identity chưa được bật hoặc chưa có quyền Key Vault.');
    }
    if (err.message.includes('Invalid login') || err.message.includes('BadCredentials')) {
      console.error('\n💡 GỢI Ý: Sai App Password hoặc chưa bật 2FA + tạo App Password cho Gmail gửi.');
    }
  }
})();
