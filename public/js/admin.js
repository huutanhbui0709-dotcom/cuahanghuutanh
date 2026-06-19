// ==============================
// STATE
// ==============================
if (window.location.protocol === 'file:') {
  window.location.href = 'https://cuahanghuutanh.vercel.app/admin';
}

let products = [];
let orders = [];

const ITEMS_PER_PAGE = 24;
let adminPage = 1;

function formatPrice(p) {
  if (!p || p === 0) return 'Liên hệ';
  return p.toLocaleString('vi-VN') + '₫';
}

function statusBadge(s) {
  if (s === 'Đã xác nhận') return 'badge-green';
  if (s === 'Đã huỷ') return 'badge-red';
  return 'badge-yellow';
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Gọi fetch tới các API cần đăng nhập; nếu phiên đăng nhập hết hạn (401)
// thì tự động quay về màn hình đăng nhập thay vì để lỗi mơ hồ.
async function adminFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Phiên đăng nhập đã hết, vui lòng đăng nhập lại', 'error');
    showLogin();
  }
  return res;
}

// ==============================
// AUTH
// ==============================
async function checkAuth() {
  try {
    const res = await fetch('/api/admin/me');
    const data = await res.json();
    if (data.authenticated) {
      showDashboard();
    } else {
      showLogin();
    }
  } catch (err) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('adminView').classList.add('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('adminView').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  loadAllData();
}

async function handleLogin(e) {
  e.preventDefault();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  errEl.classList.remove('visible');
  btn.disabled = true;
  btn.textContent = 'Đang kiểm tra...';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      document.getElementById('loginPassword').value = '';
      showDashboard();
    } else {
      errEl.textContent = '<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Sai mật khẩu.');
      errEl.classList.add('visible');
    }
  } catch (err) {
    errEl.textContent = '<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server.';
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Đăng nhập';
  }
  return false;
}

async function adminLogout() {
  try { await fetch('/api/admin/logout', { method: 'POST' }); } catch (err) {}
  showLogin();
}

// ==============================
// LOAD DATA
// ==============================
async function loadAllData() {
  await Promise.all([loadProducts(), loadOrders()]);
  populateProductTypeFilter();
  renderDashboard();
  renderAdminTable();
  renderOrdersTable();
}

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    products = await res.json();
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Không tải được sản phẩm', 'error');
  }
}

async function loadOrders() {
  try {
    const res = await adminFetch('/api/admin/orders');
    if (res.status === 401) return;
    orders = await res.json();
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Không tải được đơn hàng', 'error');
  }
}

// ==============================
// TABS
// ==============================
function adminTab(tab, el) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-sidebar-item').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  el.classList.add('active');
  if (tab === 'products') renderAdminTable();
  if (tab === 'orders') renderOrdersTable();
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'settings') loadSettingsForm();
  if (tab === 'slides') loadAdminSlides();
}

async function loadSettingsForm() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    document.getElementById('sf_address').value = settings.address || '';
    document.getElementById('sf_phone').value = settings.phone || '';
    document.getElementById('sf_email').value = settings.email || '';
    document.getElementById('sf_mapUrl').value = settings.mapUrl || '';
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Không tải được cấu hình Footer', 'error');
  }
}

async function saveSettingsForm() {
  const address = document.getElementById('sf_address').value.trim();
  const phone = document.getElementById('sf_phone').value.trim();
  const email = document.getElementById('sf_email').value.trim();
  const mapUrl = document.getElementById('sf_mapUrl').value.trim();

  try {
    const res = await adminFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, phone, email, mapUrl }),
    });
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast('<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Lỗi lưu cấu hình'), 'error');
      return;
    }
    showToast('<i class="fa-solid fa-circle-check"></i> Đã cập nhật cấu hình Footer', 'success');
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
  }
}

// ==============================
// SLIDES MANAGEMENT
// ==============================
async function loadAdminSlides() {
  const listEl = document.getElementById('slidesList');
  listEl.innerHTML = '<p style="color:var(--muted);font-size:.875rem;">Đang tải...</p>';
  try {
    const res = await fetch('/api/slides');
    const slides = await res.json();
    if (slides.length === 0) {
      listEl.innerHTML = '<p style="color:var(--muted);font-size:.875rem;">Chưa có ảnh slide nào. Hãy tải lên ảnh mới.</p>';
      return;
    }
    listEl.innerHTML = slides.map(url => `
      <div style="border:1.5px solid var(--border); border-radius:8px; overflow:hidden; display:flex; flex-direction:column; background:#fff;">
        <div style="height:120px; background-image:url('${url}'); background-size:cover; background-position:center;"></div>
        <div style="padding:10px; display:flex; flex-direction:column; gap:8px;">
          <code style="font-size:.7rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${url}">${url.split('/').pop()}</code>
          <button class="btn btn-sm btn-danger" style="width:100%; justify-content:center;" onclick="deleteSlide('${url}')">
            <i class="fa-solid fa-trash"></i> Xóa Slide
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = '<p style="color:var(--danger);font-size:.875rem;"><i class="fa-solid fa-xmark"></i> Lỗi khi tải danh sách slide.</p>';
  }
}

async function uploadNewSlide(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const statusEl = document.getElementById('slideUploadStatus');
  statusEl.textContent = 'Đang tải lên...';
  
  const formData = new FormData();
  formData.append('image', file);
  
  try {
    const res = await adminFetch('/api/admin/slides', {
      method: 'POST',
      body: formData
    });
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok || !data.ok) {
      statusEl.textContent = '<i class="fa-solid fa-xmark"></i> Lỗi: ' + (data.message || 'Không thể tải lên.');
      showToast('<i class="fa-solid fa-xmark"></i> Tải lên slide thất bại', 'error');
      return;
    }
    statusEl.textContent = 'Chưa chọn file nào';
    event.target.value = '';
    await loadAdminSlides();
    showToast('<i class="fa-solid fa-circle-check"></i> Đã thêm ảnh slide mới', 'success');
  } catch (err) {
    statusEl.textContent = '<i class="fa-solid fa-xmark"></i> Lỗi kết nối.';
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
  }
}

async function deleteSlide(url) {
  if (!confirm('Bạn có chắc chắn muốn xóa slide này? Hành động này không thể hoàn tác.')) return;
  try {
    const res = await adminFetch('/api/admin/slides', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast('<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Lỗi khi xóa slide'), 'error');
      return;
    }
    await loadAdminSlides();
    showToast('<i class="fa-solid fa-trash"></i> Đã xóa slide thành công', 'success');
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
  }
}

// ==============================
// DASHBOARD
// ==============================
function renderDashboard() {
  const pending = orders.filter(o => o.status === 'Chờ xác nhận').length;
  const confirmed = orders.filter(o => o.status === 'Đã xác nhận').length;
  const revenue = orders.filter(o => o.status !== 'Đã huỷ').reduce((s, o) => s + o.total, 0);

  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="stat-value">${products.length}</div><div class="stat-label"><i class="fa-solid fa-box"></i> Sản phẩm</div></div>
    <div class="stat-card"><div class="stat-value">${orders.length}</div><div class="stat-label"><i class="fa-solid fa-clipboard-list"></i> Tổng đơn hàng</div></div>
    <div class="stat-card"><div class="stat-value" style="color:#f59e0b">${pending}</div><div class="stat-label"><i class="fa-solid fa-hourglass-half"></i> Chờ xác nhận</div></div>
    <div class="stat-card"><div class="stat-value" style="color:#10b981">${confirmed}</div><div class="stat-label"><i class="fa-solid fa-circle-check"></i> Đã xác nhận</div></div>
    <div class="stat-card"><div class="stat-value" style="font-size:1.2rem">${revenue > 0 ? revenue.toLocaleString('vi-VN') : '0'}</div><div class="stat-label"><i class="fa-solid fa-sack-dollar"></i> Doanh thu (VNĐ)</div></div>
  `;

  const dashboardStatusFilter = document.getElementById('dashboardOrderStatusFilter')?.value || '';
  const filteredOrders = dashboardStatusFilter ? orders.filter(o => o.status === dashboardStatusFilter) : orders;
  const recent = filteredOrders.slice(0, 5);
  
  if (recent.length === 0) {
    document.getElementById('recentOrdersTable').innerHTML = '<p style="color:var(--muted);font-size:.875rem;padding:16px 0">Chưa có đơn hàng nào.</p>';
    return;
  }
  document.getElementById('recentOrdersTable').innerHTML = `
    <table><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>SĐT</th><th>Sản phẩm</th><th>Tổng tiền</th><th>Trạng thái</th></tr></thead>
    <tbody>${recent.map(o => `
      <tr>
        <td>${o.id}</td>
        <td>${o.customer}</td>
        <td>${o.phone}</td>
        <td><span class="order-detail" title="${o.items.map(i => `${i.ten} (x${i.qty})`).join(', ')}">${o.items.map(i => `${i.ten} (x${i.qty})`).join(', ')}</span></td>
        <td style="font-weight:700;color:var(--primary)">${formatPrice(o.total)}</td>
        <td><span class="badge ${statusBadge(o.status)}">${o.status}</span></td>
      </tr>`).join('')}
    </tbody></table>
  `;
}

// ==============================
// PRODUCTS TABLE
// ==============================
function populateProductTypeFilter() {
  const select = document.getElementById('adminTypeFilter');
  if (!select) return;
  const currentVal = select.value;
  
  const types = [...new Set(products.map(p => p.loai).filter(Boolean))].sort();
  
  let html = '<option value="">Tất cả loại</option>';
  html += types.map(t => `<option value="${t}">${t}</option>`).join('');
  select.innerHTML = html;
  
  if (types.includes(currentVal)) {
    select.value = currentVal;
  } else {
    select.value = '';
  }
}

function renderPagination(total, current, id, onPage) {
  const el = document.getElementById(id);
  if (total <= 1) { el.innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="(${onPage.toString()})(${current-1})" ${current<=1?'disabled':''}>‹</button>`;
  for (let i = 1; i <= total; i++) {
    if (total > 7 && Math.abs(i - current) > 2 && i !== 1 && i !== total) {
      if (i === 2 || i === total-1) html += `<span style="padding:0 4px;color:var(--muted)">…</span>`;
      continue;
    }
    html += `<button class="page-btn ${i===current?'active':''}" onclick="(${onPage.toString()})(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" onclick="(${onPage.toString()})(${current+1})" ${current>=total?'disabled':''}>›</button>`;
  el.innerHTML = html;
}

function renderAdminTable() {
  const q = (document.getElementById('adminSearch')?.value || '').toLowerCase();
  const typeFilter = document.getElementById('adminTypeFilter')?.value || '';
  
  let list = products.filter(p => {
    if (q && !p.ten.toLowerCase().includes(q) && !p.ma.toLowerCase().includes(q)) return false;
    if (typeFilter && p.loai !== typeFilter) return false;
    return true;
  });
  
  const total = list.length;
  const pages = Math.ceil(total / ITEMS_PER_PAGE);
  if (adminPage > pages) adminPage = Math.max(1, pages);
  const paged = list.slice((adminPage-1)*ITEMS_PER_PAGE, adminPage*ITEMS_PER_PAGE);

  document.getElementById('adminProductCount').textContent = total;
  document.getElementById('adminTable').innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Ảnh</th><th>Mã SP</th><th>Tên sản phẩm</th><th>Giá bán</th><th>ĐVT</th><th>Loại</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>${paged.map((p, i) => `
        <tr>
          <td>${(adminPage-1)*ITEMS_PER_PAGE + i + 1}</td>
          <td>${p.image ? `<img src="${p.image}" style="width:40px;height:40px;object-fit:cover;border-radius:4px" />` : '<i class="fa-solid fa-box"></i>'}</td>
          <td><code style="font-size:.78rem;background:var(--bg);padding:2px 6px;border-radius:4px">${p.ma}</code></td>
          <td style="max-width:300px">${p.ten}</td>
          <td style="font-weight:700;color:var(--primary)">${formatPrice(p.gia)}</td>
          <td>${p.donvi || '-'}</td>
          <td><span class="badge ${p.loai === 'Hàng hóa dịch vụ' ? 'badge-green' : 'badge-blue'}">${p.loai || '-'}</span></td>
          <td><span class="badge badge-yellow">${p.trangthai || '-'}</span></td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm btn-outline" style="color:var(--text);border-color:var(--border)" onclick="openProductModal('${p.ma.replace(/'/g,"\\'")}')"><i class="fa-solid fa-pencil"></i></button>
              <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.ma.replace(/'/g,"\\'")}')"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
  renderPagination(pages, adminPage, 'adminPagination', (p) => { adminPage = p; renderAdminTable(); });
}

// ==============================
// PRODUCT ADD / EDIT / DELETE
// ==============================
function openProductModal(ma) {
  const isEdit = !!ma;
  document.getElementById('productModalTitle').innerHTML = isEdit
    ? `<i class="fa-solid fa-pencil"></i> Sửa sản phẩm &nbsp;<code style="font-size:.8rem;background:var(--bg);padding:2px 8px;border-radius:4px;font-weight:600">${ma}</code>`
    : `<i class="fa-solid fa-plus"></i> Thêm sản phẩm`;
  document.getElementById('pf_originalMa').value = ma || '';
  const p = isEdit ? products.find(x => x.ma === ma) : null;

  document.getElementById('pf_ma').value = p ? p.ma : '';
  document.getElementById('pf_ma').disabled = isEdit; // không cho đổi mã khi sửa
  document.getElementById('pf_ten').value = p ? p.ten : '';
  document.getElementById('pf_gia').value = p ? p.gia : '';
  document.getElementById('pf_donvi').value = p ? (p.donvi || '') : '';
  document.getElementById('pf_loai').value = p ? (p.loai || 'Hàng hóa thường') : 'Hàng hóa thường';
  document.getElementById('pf_trangthai').value = p ? (p.trangthai || 'Đang theo dõi') : 'Đang theo dõi';

  document.getElementById('pf_image').value = '';
  const previewWrap = document.getElementById('pf_image_preview');
  const previewImg = document.getElementById('pf_image_img');
  if (p && p.image) {
    previewImg.src = p.image;
    previewWrap.style.display = 'block';
  } else {
    previewImg.src = '';
    previewWrap.style.display = 'none';
  }

  document.getElementById('productModal').classList.add('open');
}

function previewProductImage(event) {
  const file = event.target.files[0];
  const previewWrap = document.getElementById('pf_image_preview');
  const previewImg = document.getElementById('pf_image_img');
  
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      previewImg.src = e.target.result;
      previewWrap.style.display = 'block';
    }
    reader.readAsDataURL(file);
  } else {
    previewWrap.style.display = 'none';
  }
}

async function saveProductForm() {
  const originalMa = document.getElementById('pf_originalMa').value;
  const isEdit = !!originalMa;
  const ma = document.getElementById('pf_ma').value.trim();
  const ten = document.getElementById('pf_ten').value.trim();
  const gia = document.getElementById('pf_gia').value;
  const donvi = document.getElementById('pf_donvi').value.trim();
  const loai = document.getElementById('pf_loai').value;
  const trangthai = document.getElementById('pf_trangthai').value.trim();

  if (!ma) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng nhập mã sản phẩm', 'error'); return; }
  if (!ten) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng nhập tên sản phẩm', 'error'); return; }

  try {
    const formData = new FormData();
    formData.append('ma', ma);
    formData.append('ten', ten);
    formData.append('gia', gia);
    formData.append('donvi', donvi);
    formData.append('loai', loai);
    formData.append('trangthai', trangthai);

    const imageFile = document.getElementById('pf_image').files[0];
    if (imageFile) {
      formData.append('image', imageFile);
    }

    let res;
    if (isEdit) {
      res = await adminFetch('/api/admin/products/' + encodeURIComponent(originalMa), {
        method: 'PUT',
        body: formData,
      });
    } else {
      res = await adminFetch('/api/admin/products', {
        method: 'POST',
        body: formData,
      });
    }
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast('<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Lỗi lưu sản phẩm'), 'error');
      return;
    }
    closeModal('productModal');
    await loadProducts();
    populateProductTypeFilter();
    renderAdminTable();
    renderDashboard();
    showToast(isEdit ? '<i class="fa-solid fa-circle-check"></i> Đã cập nhật sản phẩm' : '<i class="fa-solid fa-circle-check"></i> Đã thêm sản phẩm', 'success');
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
  }
}

async function deleteProduct(ma) {
  if (!confirm('Xoá sản phẩm "' + ma + '"? Hành động này không thể hoàn tác.')) return;
  try {
    const res = await adminFetch('/api/admin/products/' + encodeURIComponent(ma), { method: 'DELETE' });
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast('<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Lỗi xoá sản phẩm'), 'error');
      return;
    }
    await loadProducts();
    populateProductTypeFilter();
    renderAdminTable();
    renderDashboard();
    showToast('<i class="fa-solid fa-trash"></i> Đã xoá sản phẩm', 'success');
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
  }
}

// ==============================
// ORDERS
// ==============================
function parseCreatedAt(createdAtStr) {
  if (!createdAtStr) return null;
  const parts = createdAtStr.split(/\s+/);
  let datePart = '';
  for (const part of parts) {
    if (part.includes('/') || part.includes('-')) {
      datePart = part.replace(/,/g, '').trim();
      break;
    }
  }
  if (!datePart) return null;
  
  const separator = datePart.includes('/') ? '/' : '-';
  const dateSplit = datePart.split(separator);
  if (dateSplit.length !== 3) return null;
  
  let day, month, year;
  if (dateSplit[0].length === 4) {
    year = parseInt(dateSplit[0], 10);
    month = parseInt(dateSplit[1], 10) - 1;
    day = parseInt(dateSplit[2], 10);
  } else {
    day = parseInt(dateSplit[0], 10);
    month = parseInt(dateSplit[1], 10) - 1;
    year = parseInt(dateSplit[2], 10);
  }
  
  return new Date(year, month, day);
}

function resetOrderFilters() {
  const searchInput = document.getElementById('orderSearch');
  const dateFromInput = document.getElementById('orderDateFrom');
  const dateToInput = document.getElementById('orderDateTo');
  const statusFilter = document.getElementById('orderStatusFilter');
  if (searchInput) searchInput.value = '';
  if (dateFromInput) dateFromInput.value = '';
  if (dateToInput) dateToInput.value = '';
  if (statusFilter) statusFilter.value = '';
  renderOrdersTable();
}

function renderOrdersTable() {
  const filter = document.getElementById('orderStatusFilter')?.value || '';
  const searchQuery = (document.getElementById('orderSearch')?.value || '').toLowerCase().trim();
  
  const fromVal = document.getElementById('orderDateFrom')?.value;
  const toVal = document.getElementById('orderDateTo')?.value;
  let fromDate = null;
  let toDate = null;
  
  if (fromVal) {
    const [y, m, d] = fromVal.split('-').map(Number);
    fromDate = new Date(y, m - 1, d);
  }
  if (toVal) {
    const [y, m, d] = toVal.split('-').map(Number);
    toDate = new Date(y, m - 1, d);
  }

  let list = orders.filter(o => {
    // 1. Filter by status
    if (filter && o.status !== filter) return false;
    
    // 2. Filter by search query
    if (searchQuery) {
      const match = (o.id || '').toLowerCase().includes(searchQuery) ||
                    (o.customer || '').toLowerCase().includes(searchQuery) ||
                    (o.phone || '').toLowerCase().includes(searchQuery);
      if (!match) return false;
    }
    
    // 3. Filter by date range
    if (fromDate || toDate) {
      const orderDate = parseCreatedAt(o.createdAt);
      if (!orderDate) return false;
      if (fromDate && orderDate < fromDate) return false;
      if (toDate && orderDate > toDate) return false;
    }
    
    return true;
  });

  if (list.length === 0) {
    document.getElementById('ordersTable').innerHTML = '<p style="color:var(--muted);font-size:.875rem;padding:16px 0">Không tìm thấy đơn hàng phù hợp.</p>';
    return;
  }

  document.getElementById('ordersTable').innerHTML = `
    <table>
      <thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>SĐT</th><th>Địa chỉ</th><th>Sản phẩm</th><th>Tổng tiền</th><th>Ngày đặt</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>${list.map(o => `
        <tr class="order-row">
          <td>${o.id}</td>
          <td>${o.customer}</td>
          <td>${o.phone}</td>
          <td style="max-width:150px;font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.address}">${o.address}</td>
          <td><span class="order-detail">${o.items.length} sản phẩm</span></td>
          <td style="font-weight:700;color:var(--primary)">${formatPrice(o.total)}</td>
          <td style="font-size:.78rem;color:var(--muted)">${o.createdAt}</td>
          <td><span class="badge ${statusBadge(o.status)}">${o.status}</span></td>
          <td>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn btn-sm btn-primary" onclick="viewOrderDetail('${o.id}')"><i class="fa-solid fa-eye"></i></button>
              ${o.status === 'Chờ xác nhận' ? `<button class="btn btn-sm btn-success" onclick="updateOrderStatus('${o.id}','Đã xác nhận')"><i class="fa-solid fa-circle-check"></i></button><button class="btn btn-sm btn-danger" onclick="updateOrderStatus('${o.id}','Đã huỷ')">✕</button>` : ''}
              ${o.status === 'Đã huỷ' ? `<button class="btn btn-sm btn-danger" onclick="deleteOrder('${o.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}

async function deleteOrder(id) {
  if (!confirm(`Bạn có chắc chắn muốn xoá vĩnh viễn đơn hàng ${id}?`)) return;
  try {
    const res = await adminFetch('/api/admin/orders/' + encodeURIComponent(id), {
      method: 'DELETE',
    });
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast('<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Lỗi xoá đơn hàng'), 'error');
      return;
    }
    await loadOrders();
    renderOrdersTable();
    renderDashboard();
    showToast(`<i class="fa-solid fa-trash"></i> Đã xoá đơn hàng ${id}`, 'success');
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
  }
}

async function updateOrderStatus(id, status) {
  try {
    const res = await adminFetch('/api/admin/orders/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast('<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Lỗi cập nhật trạng thái'), 'error');
      return;
    }
    await loadOrders();
    renderOrdersTable();
    renderDashboard();
    showToast(`Đơn ${id} → ${status}`, 'success');
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
  }
}

function viewOrderDetail(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  document.getElementById('orderDetailBody').innerHTML = `
    <div style="display:grid;gap:16px">
      <div class="admin-card" style="border:none;background:var(--bg);padding:16px;border-radius:10px;margin:0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.875rem">
          <div><strong>Mã đơn:</strong> ${o.id}</div>
          <div><strong>Ngày đặt:</strong> ${o.createdAt}</div>
          <div><strong>Khách hàng:</strong> ${o.customer}</div>
          <div><strong>SĐT:</strong> ${o.phone}</div>
          <div style="grid-column:1/-1"><strong>Địa chỉ:</strong> ${o.address}</div>
          ${o.note ? `<div style="grid-column:1/-1"><strong>Ghi chú:</strong> ${o.note}</div>` : ''}
          <div><strong>Trạng thái:</strong> <span class="badge ${statusBadge(o.status)}">${o.status}</span></div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Sản phẩm</th><th>Mã SP</th><th>Đơn giá</th><th>SL</th><th>ĐVT</th><th>Thành tiền</th></tr></thead>
          <tbody>${o.items.map(item => `
            <tr>
              <td>${item.ten}</td>
              <td><code style="font-size:.72rem">${item.ma}</code></td>
              <td style="white-space:nowrap">${formatPrice(item.gia)}</td>
              <td style="text-align:center;font-weight:700">${item.qty}</td>
              <td>${item.donvi || '-'}</td>
              <td style="font-weight:700;color:var(--primary);white-space:nowrap">${formatPrice(item.gia * item.qty)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="5" style="text-align:right;font-weight:700;padding:10px 14px;border-top:2px solid var(--border)">Tổng cộng:</td><td style="font-weight:800;font-size:1.1rem;color:var(--primary);padding:10px 14px;border-top:2px solid var(--border);white-space:nowrap">${formatPrice(o.total)}</td></tr></tfoot>
        </table>
      </div>
      ${o.status === 'Chờ xác nhận' ? `
        <div style="display:flex;gap:10px;justify-content:center;padding-top:4px">
          <button class="btn btn-success" style="flex:1;max-width:200px;justify-content:center;padding:10px 20px" onclick="updateOrderStatus('${o.id}','Đã xác nhận');closeModal('orderDetailModal')"><i class="fa-solid fa-circle-check"></i> Xác nhận đơn</button>
          <button class="btn btn-danger" style="flex:1;max-width:200px;justify-content:center;padding:10px 20px" onclick="updateOrderStatus('${o.id}','Đã huỷ');closeModal('orderDetailModal')">✕ Huỷ đơn</button>
        </div>` : ''}
    </div>
  `;
  document.getElementById('orderDetailModal').classList.add('open');
}

// ==============================
// EXCEL IMPORT
// ==============================
function handleDragOver(e) { e.preventDefault(); document.getElementById('uploadZone').classList.add('drag-over'); }
function handleDragLeave(e) { document.getElementById('uploadZone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processExcelFile(file);
}
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (file) processExcelFile(file);
  e.target.value = '';
}

function processExcelFile(file) {
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Tìm dòng tiêu đề (chứa "Mã hàng hóa")
      let headerRow = -1;
      let colMap = {};
      for (let r = 0; r < Math.min(10, raw.length); r++) {
        const row = raw[r].map(c => String(c).trim());
        const maIdx = row.findIndex(c => c.includes('Mã hàng') || c.toLowerCase().includes('ma hang'));
        if (maIdx >= 0) {
          headerRow = r;
          colMap.ma = maIdx;
          colMap.ten = row.findIndex(c => c.includes('Tên hàng') || c.toLowerCase().includes('ten hang'));
          colMap.gia = row.findIndex(c => c.includes('Giá') || c.toLowerCase().includes('gia'));
          colMap.donvi = row.findIndex(c => c.includes('Đơn vị') || c.toLowerCase().includes('don vi'));
          colMap.loai = row.findIndex(c => c.includes('Loại') || c.toLowerCase().includes('loai'));
          colMap.trangthai = row.findIndex(c => c.includes('Trạng thái') || c.toLowerCase().includes('trang thai'));
          break;
        }
      }

      if (headerRow < 0 || colMap.ma < 0) {
        showUploadResult('error', '<i class="fa-solid fa-xmark"></i> Không tìm thấy cột "Mã hàng hóa". Kiểm tra định dạng file.');
        return;
      }

      const rows = [];
      for (let r = headerRow + 1; r < raw.length; r++) {
        const row = raw[r];
        const ma = String(row[colMap.ma] || '').trim();
        const ten = colMap.ten >= 0 ? String(row[colMap.ten] || '').trim() : '';
        if (!ma || !ten) continue;
        rows.push({
          ma, ten,
          gia: colMap.gia >= 0 ? (parseInt(String(row[colMap.gia]).replace(/\D/g,'')) || 0) : 0,
          donvi: colMap.donvi >= 0 ? String(row[colMap.donvi] || '').trim() : '',
          loai: colMap.loai >= 0 ? String(row[colMap.loai] || '').trim() : 'Hàng hóa thường',
          trangthai: colMap.trangthai >= 0 ? String(row[colMap.trangthai] || '').trim() : 'Đang theo dõi',
        });
      }

      const res = await fetch('/api/admin/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showUploadResult('error', '<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Lỗi import'));
        return;
      }

      await loadProducts();
      populateProductTypeFilter();
      renderAdminTable();
      renderDashboard();

      showUploadResult('success', `<i class="fa-solid fa-circle-check"></i> Import hoàn tất! <strong>Thêm mới: ${data.added}</strong> | Cập nhật: ${data.updated} | Lỗi dữ liệu: ${data.errors}`);
      showToast(`Import thành công: +${data.added} mới, ${data.updated} cập nhật`, 'success');
    } catch(err) {
      showUploadResult('error', `<i class="fa-solid fa-xmark"></i> Lỗi đọc file: ${err.message}`);
    }
  };
  reader.readAsArrayBuffer(file);
}

function showUploadResult(type, msg) {
  const el = document.getElementById('uploadResult');
  el.innerHTML = `<div class="upload-result ${type}">${msg}</div>`;
}

// ==============================
// FOLDER IMAGE IMPORT
// ==============================
function handleFolderDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('folderUploadZone').classList.add('drag-over');
}

function handleFolderDragLeave(e) {
  document.getElementById('folderUploadZone').classList.remove('drag-over');
}

function handleFolderDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('folderUploadZone').classList.remove('drag-over');

  const items = e.dataTransfer.items;
  if (!items || items.length === 0) return;

  const imageFiles = [];
  let pending = 0;

  function readEntry(entry) {
    if (entry.isFile) {
      pending++;
      entry.file(file => {
        if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) {
          imageFiles.push(file);
        }
        pending--;
        if (pending === 0) processImportImages(imageFiles);
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      function readAll() {
        pending++;
        reader.readEntries(entries => {
          pending--;
          for (const child of entries) readEntry(child);
          if (entries.length === 100) readAll(); // Có thể còn nhiều entry
          if (pending === 0) processImportImages(imageFiles);
        });
      }
      readAll();
    }
  }

  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
    if (entry) readEntry(entry);
  }

  // Fallback: nếu không có entry nào được xử lý
  if (pending === 0 && imageFiles.length === 0) {
    showFolderUploadResult('error', '<i class="fa-solid fa-xmark"></i> Không đọc được thư mục. Hãy dùng nút chọn thư mục bên dưới.');
  }
}

function handleFolderUpload(e) {
  const files = Array.from(e.target.files).filter(f => /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name));
  e.target.value = '';
  if (files.length === 0) {
    showFolderUploadResult('error', '<i class="fa-solid fa-triangle-exclamation"></i> Không tìm thấy ảnh trong thư mục được chọn.');
    return;
  }
  processImportImages(files);
}

async function processImportImages(files) {
  if (!files || files.length === 0) {
    showFolderUploadResult('error', '<i class="fa-solid fa-triangle-exclamation"></i> Không có file ảnh nào để xử lý.');
    return;
  }

  // Lấy danh sách mã sản phẩm để kiểm tra phía client
  const productCodes = new Set(products.map(p => String(p.ma).trim().toLowerCase()));

  const matchedFiles = [];
  const skippedNames = [];

  for (const file of files) {
    const ext = file.name.lastIndexOf('.');
    const codePart = ext >= 0 ? file.name.slice(0, ext).trim() : file.name.trim();
    if (productCodes.has(codePart.toLowerCase())) {
      matchedFiles.push(file);
    } else {
      skippedNames.push(file.name);
    }
  }

  if (matchedFiles.length === 0) {
    let msg = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Không khớp mã sản phẩm nào!</strong> Kiểm tra tên file phải trùng chính xác với mã sản phẩm.<br>`;
    if (skippedNames.length > 0) {
      msg += `<small style="color:var(--muted)">File không khớp: ${skippedNames.slice(0, 10).join(', ')}${skippedNames.length > 10 ? ` và ${skippedNames.length - 10} file khác...` : ''}</small>`;
    }
    showFolderUploadResult('error', msg);
    return;
  }

  const BATCH_SIZE = 50;
  const totalBatches = Math.ceil(matchedFiles.length / BATCH_SIZE);
  let totalUpdated = 0;

  showFolderUploadResult('info', `<i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên <strong>${matchedFiles.length}</strong> ảnh khớp mã sản phẩm...`);

  for (let b = 0; b < totalBatches; b++) {
    const batch = matchedFiles.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const formData = new FormData();
    for (const file of batch) {
      const fileName = getBaseFileName(file.webkitRelativePath || file.name);
      formData.append('images', file, fileName);
    }

    // Hiển thị tiến trình
    const uploaded = Math.min((b + 1) * BATCH_SIZE, matchedFiles.length);
    showFolderUploadResult('info',
      `<i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên: <strong>${uploaded}/${matchedFiles.length}</strong> ảnh (đợt ${b + 1}/${totalBatches})...`
    );

    try {
      const res = await adminFetch('/api/admin/products/import-images', {
        method: 'POST',
        body: formData,
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showFolderUploadResult('error', `<i class="fa-solid fa-xmark"></i> Lỗi tải lên đợt ${b + 1}: ${data.message || 'Lỗi không xác định.'}`);
        return;
      }
      totalUpdated += data.updated || 0;
    } catch (err) {
      showFolderUploadResult('error', `<i class="fa-solid fa-xmark"></i> Lỗi kết nối: ${err.message}`);
      return;
    }
  }

  // Reload danh sách sản phẩm sau khi cập nhật ảnh
  await loadProducts();
  renderAdminTable();
  renderDashboard();

  function getBaseFileName(name) {
    const segments = name.split(/[/\\]/);
    return segments[segments.length - 1];
  }

  let resultMsg = `<i class="fa-solid fa-circle-check"></i> Import ảnh hoàn tất!
    <strong>${totalUpdated}</strong> sản phẩm đã được cập nhật ảnh.`;
  if (skippedNames.length > 0) {
    resultMsg += `<br><small style="margin-top:6px;display:block;color:inherit;opacity:.8">
      <i class="fa-solid fa-triangle-exclamation"></i> ${skippedNames.length} file bỏ qua (không khớp mã):
      ${skippedNames.slice(0, 10).join(', ')}${skippedNames.length > 10 ? ` và ${skippedNames.length - 10} file khác...` : ''}
    </small>`;
  }

  showFolderUploadResult('success', resultMsg);
  showToast(`<i class="fa-solid fa-circle-check"></i> Import ảnh: ${totalUpdated} sản phẩm cập nhật`, 'success');

  // Cập nhật text zone
  document.getElementById('folderUploadText').textContent = 'Kéo thả thư mục chứa ảnh sản phẩm vào đây hoặc nhấn để chọn thư mục';
}

function showFolderUploadResult(type, msg) {
  const el = document.getElementById('folderUploadResult');
  const bgMap = { success: '#d1fae5', error: '#fee2e2', info: '#dbeafe' };
  const colorMap = { success: '#065f46', error: '#991b1b', info: '#1e40af' };
  el.innerHTML = `<div class="upload-result" style="background:${bgMap[type]||'#f1f5f9'};color:${colorMap[type]||'#1e293b'};padding:14px 16px;border-radius:8px;font-size:.875rem;line-height:1.6">${msg}</div>`;
}

// ==============================
// TOAST
// ==============================
let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.className = `toast show ${type ? 'toast-' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ==============================
// INIT
// ==============================
checkAuth();

['productModal', 'orderDetailModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
});
