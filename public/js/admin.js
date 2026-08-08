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

const ORDERS_PER_PAGE = 20;
let orderPage = 1;

function formatPrice(p) {
  if (!p || p === 0) return 'Liên hệ';
  return p.toLocaleString('vi-VN') + '₫';
}

function getProductImageUrl(p) {
  if (!p || !p.image) return '';
  return p.image + (p.updatedAt ? `?t=${p.updatedAt}` : '');
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
  options = options || {};
  if (!options.credentials) options.credentials = 'same-origin';
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
    const res = await fetch('/api/admin/me', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });
    const data = await res.json();
    if (data && data.authenticated) {
      showDashboard();
    } else {
      showLogin();
    }
  } catch (err) {
    console.error('Lỗi check auth:', err);
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
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      document.getElementById('loginPassword').value = '';
      // Đợi một chút để cookie được set, rồi mới load data
      await new Promise(resolve => setTimeout(resolve, 300));
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
  try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); } catch (err) { }
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
  let retries = 2;
  while (retries > 0) {
    try {
      const res = await fetch('/api/products', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      products = await res.json();
      return;
    } catch (err) {
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.error('Lỗi load sản phẩm:', err);
        showToast('<i class="fa-solid fa-xmark"></i> Không tải được sản phẩm', 'error');
      }
    }
  }
}

async function loadOrders() {
  let retries = 2;
  while (retries > 0) {
    try {
      const res = await adminFetch('/api/admin/orders', { credentials: 'same-origin' });
      if (res.status === 401) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      orders = await res.json();
      return;
    } catch (err) {
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.error('Lỗi load đơn hàng:', err);
        showToast('<i class="fa-solid fa-xmark"></i> Không tải được đơn hàng', 'error');
      }
    }
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
  if (tab === 'suppliers') loadSuppliersList();
  if (tab === 'tools') loadGeminiApiKeyToInput();
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
function goToProductsTab() {
  const target = Array.from(document.querySelectorAll('.admin-sidebar-item')).find(el => el.textContent.includes('Sản phẩm'));
  if (target) adminTab('products', target);
}

function filterDashboardStatus(status) {
  const select = document.getElementById('dashboardOrderStatusFilter');
  if (select) {
    select.value = status;
    renderDashboard();
  }
}

function renderDashboard() {
  const pending = orders.filter(o => o.status === 'Chờ xác nhận').length;
  const confirmed = orders.filter(o => o.status === 'Đã xác nhận').length;
  const revenue = orders.filter(o => o.status !== 'Đã huỷ').reduce((s, o) => s + o.total, 0);

  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card" style="cursor:pointer" onclick="goToProductsTab()"><div class="stat-value">${products.length}</div><div class="stat-label"><i class="fa-solid fa-box"></i> Sản phẩm</div></div>
    <div class="stat-card" style="cursor:pointer" onclick="filterDashboardStatus('')"><div class="stat-value">${orders.length}</div><div class="stat-label"><i class="fa-solid fa-clipboard-list"></i> Tổng đơn hàng</div></div>
    <div class="stat-card" style="cursor:pointer" onclick="filterDashboardStatus('Chờ xác nhận')"><div class="stat-value" style="color:#f59e0b">${pending}</div><div class="stat-label"><i class="fa-solid fa-hourglass-half"></i> Chờ xác nhận</div></div>
    <div class="stat-card" style="cursor:pointer" onclick="filterDashboardStatus('Đã xác nhận')"><div class="stat-value" style="color:#10b981">${confirmed}</div><div class="stat-label"><i class="fa-solid fa-circle-check"></i> Đã xác nhận</div></div>
    <div class="stat-card"><div class="stat-value" style="font-size:1.2rem">${revenue > 0 ? revenue.toLocaleString('vi-VN') : '0'}</div><div class="stat-label"><i class="fa-solid fa-sack-dollar"></i> Doanh thu (VNĐ)</div></div>
  `;

  const dashboardStatusFilter = document.getElementById('dashboardOrderStatusFilter')?.value || '';
  const filteredOrders = (dashboardStatusFilter ? orders.filter(o => o.status === dashboardStatusFilter) : orders)
    .slice().sort((a, b) => parseOrderDateTime(b.createdAt) - parseOrderDateTime(a.createdAt));
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
  let html = `<button class="page-btn" onclick="(${onPage.toString()})(${current - 1})" ${current <= 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= total; i++) {
    if (total > 7 && Math.abs(i - current) > 2 && i !== 1 && i !== total) {
      if (i === 2 || i === total - 1) html += `<span style="padding:0 4px;color:var(--muted)">…</span>`;
      continue;
    }
    html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="(${onPage.toString()})(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" onclick="(${onPage.toString()})(${current + 1})" ${current >= total ? 'disabled' : ''}>›</button>`;
  el.innerHTML = html;
}

function renderAdminTable() {
  const q = (document.getElementById('adminSearch')?.value || '').toLowerCase();
  const typeFilter = document.getElementById('adminTypeFilter')?.value || '';
  const statusFilter = document.getElementById('adminStatusFilter')?.value || '';
  const bestSellerFilter = document.getElementById('adminBestSellerFilter')?.value || '';
  const imageFilter = document.getElementById('adminImageFilter')?.value || '';

  let list = products.filter(p => {
    if (q && !p.ten.toLowerCase().includes(q) && !p.ma.toLowerCase().includes(q)) return false;
    if (typeFilter && p.loai !== typeFilter) return false;
    if (statusFilter && (p.trangthai || 'Đang theo dõi') !== statusFilter) return false;
    if (bestSellerFilter === 'yes' && !p.isBestSeller) return false;
    if (bestSellerFilter === 'no' && p.isBestSeller) return false;
    if (imageFilter === 'yes' && !p.image) return false;
    if (imageFilter === 'no' && p.image) return false;
    return true;
  });

  const total = list.length;
  const pages = Math.ceil(total / ITEMS_PER_PAGE);
  if (adminPage > pages) adminPage = Math.max(1, pages);
  const paged = list.slice((adminPage - 1) * ITEMS_PER_PAGE, adminPage * ITEMS_PER_PAGE);

  document.getElementById('adminProductCount').textContent = total;
  document.getElementById('adminTable').innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Ảnh</th><th>Mã SP</th><th>Tên sản phẩm</th><th>Giá bán</th><th>ĐVT</th><th>Loại</th><th>Trạng thái</th><th>BÁN CHẠY</th><th>Thao tác</th></tr></thead>
      <tbody>${paged.map((p, i) => `
        <tr>
          <td>${(adminPage - 1) * ITEMS_PER_PAGE + i + 1}</td>
          <td>${p.image ? `<img src="${getProductImageUrl(p)}" style="width:40px;height:40px;object-fit:cover;border-radius:4px" />` : '<i class="fa-solid fa-box"></i>'}</td>
          <td><code style="font-size:.78rem;background:var(--bg);padding:2px 6px;border-radius:4px">${p.ma}</code></td>
          <td style="max-width:300px">${p.ten}</td>
          <td style="font-weight:700;color:var(--primary)">${formatPrice(p.gia)}</td>
          <td>${p.donvi || '-'}</td>
          <td><span class="badge ${p.loai === 'Hàng hóa dịch vụ' ? 'badge-green' : 'badge-blue'}">${p.loai || '-'}</span></td>
          <td><span class="badge ${p.trangthai === 'Ngừng theo dõi' ? 'badge-red' : 'badge-yellow'}">${p.trangthai || 'Đang theo dõi'}</span></td>
          <td style="text-align:center">
            <input type="checkbox" ${p.isBestSeller ? 'checked' : ''} onchange="toggleBestSeller('${p.ma.replace(/'/g, "\\'")}', this.checked)" style="width:18px;height:18px;cursor:pointer">
          </td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm btn-outline" style="color:var(--text);border-color:var(--border)" onclick="openProductModal('${p.ma.replace(/'/g, "\\'")}')"><i class="fa-solid fa-pencil"></i></button>
              <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.ma.replace(/'/g, "\\'")}')"><i class="fa-solid fa-trash"></i></button>
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
    previewImg.src = getProductImageUrl(p);
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
    reader.onload = function (e) {
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
  const loai = document.getElementById('pf_loai').value.trim();
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
      res = await adminFetch('/api/admin/products/update?ma=' + encodeURIComponent(originalMa), {
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
    const res = await adminFetch('/api/admin/products/remove?ma=' + encodeURIComponent(ma), { method: 'DELETE' });
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

async function toggleBestSeller(ma, isChecked) {
  try {
    const res = await adminFetch('/api/products/bestseller', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: ma, isBestSeller: isChecked })
    });
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast('<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Lỗi cập nhật trạng thái bán chạy'), 'error');
      renderAdminTable();
      return;
    }
    const prod = products.find(p => p.ma === ma);
    if (prod) {
      prod.isBestSeller = isChecked;
    }
    showToast('<i class="fa-solid fa-star"></i> Đã cập nhật trạng thái bán chạy', 'success');
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
    renderAdminTable();
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

// Parse đầy đủ ngày + giờ từ định dạng "HH:MM:SS DD/MM/YYYY" hoặc "HH:MM DD/MM/YYYY"
// Dùng để sắp xếp đơn hàng chính xác (kể cả cùng ngày)
function parseOrderDateTime(str) {
  if (!str) return new Date(0);
  // Khớp định dạng: "14:46:11 8/8/2026" hoặc "14:46 29/7/2026"
  const m = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const h   = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = m[3] ? parseInt(m[3], 10) : 0;
    const d   = parseInt(m[4], 10);
    const mo  = parseInt(m[5], 10) - 1;
    const y   = parseInt(m[6], 10);
    return new Date(y, mo, d, h, min, sec);
  }
  // Fallback: thử ISO hoặc định dạng khác
  const fallback = new Date(str);
  return isNaN(fallback) ? new Date(0) : fallback;
}

// Định dạng hiển thị ngày giờ đặt hàng cho dễ đọc
// Input:  "14:46:11 8/8/2026"  →  Output HTML: "14:46 | 08/08/2026"
function formatOrderDate(str) {
  if (!str) return '—';
  const m = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const time = `${m[1].padStart(2,'0')}:${m[2]}`;
    const date = `${m[4].padStart(2,'0')}/${m[5].padStart(2,'0')}/${m[6]}`;
    return `<div style="text-align:center;line-height:1.5">`
         + `<span style="font-weight:700;color:var(--text);display:block">${date}</span>`
         + `<span style="font-size:.72rem;color:var(--muted);display:block">${time}</span>`
         + `</div>`;
  }
  return str;
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
  orderPage = 1;
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

  // Sắp xếp: đơn mới nhất lên trên
  list.sort((a, b) => parseOrderDateTime(b.createdAt) - parseOrderDateTime(a.createdAt));

  // Cập nhật badge số lượng đơn hàng

  const orderCountEl = document.getElementById('orderCount');
  if (orderCountEl) {
    orderCountEl.textContent = list.length === orders.length
      ? `${list.length} đơn`
      : `${list.length}/${orders.length} đơn`;
  }

  // Hiện/ẩn nút "Xóa tất cả đã huỷ"
  const deleteAllBtn = document.getElementById('deleteAllCancelledBtn');
  if (deleteAllBtn) {
    const cancelledInList = list.filter(o => o.status === 'Đã huỷ').length;
    deleteAllBtn.style.display = cancelledInList > 0 ? 'inline-flex' : 'none';
    deleteAllBtn.title = `Xóa tất cả ${cancelledInList} đơn đã huỷ`;
  }

  if (list.length === 0) {
    document.getElementById('ordersTable').innerHTML = '<p style="color:var(--muted);font-size:.875rem;padding:16px 0">Không tìm thấy đơn hàng phù hợp.</p>';
    const orderPagEl = document.getElementById('orderPagination');
    if (orderPagEl) orderPagEl.innerHTML = '';
    return;
  }

  // Phân trang - tối đa 20 đơn / trang
  const totalOrders = list.length;
  const orderPages = Math.ceil(totalOrders / ORDERS_PER_PAGE);
  if (orderPage > orderPages) orderPage = Math.max(1, orderPages);
  const pagedOrders = list.slice((orderPage - 1) * ORDERS_PER_PAGE, orderPage * ORDERS_PER_PAGE);

  document.getElementById('ordersTable').innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Mã đơn</th><th>Khách hàng</th><th>SĐT</th><th>Địa chỉ</th><th>Sản phẩm</th><th>Tổng tiền</th><th>Ngày đặt</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>${pagedOrders.map((o, i) => `
        <tr class="order-row">
          <td style="color:var(--muted);font-size:.78rem;white-space:nowrap">${(orderPage - 1) * ORDERS_PER_PAGE + i + 1}</td>
          <td style="white-space:nowrap">${o.id}</td>
          <td>${o.customer}</td>
          <td>${o.phone}</td>
          <td style="max-width:150px;font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.address}">${o.address}</td>
          <td><span class="order-detail">${o.items.length} sản phẩm</span></td>
          <td style="font-weight:700;color:var(--primary)">${formatPrice(o.total)}</td>
          <td style="white-space:nowrap;font-size:.82rem">${formatOrderDate(o.createdAt)}</td>
          <td><span class="badge ${statusBadge(o.status)}">${o.status}</span></td>
          <td style="white-space:nowrap">
            <div style="display:grid;grid-template-columns:30px 30px 30px;gap:3px;justify-content:center;align-items:center">
              <div><button class="btn btn-sm btn-primary" title="Xem chi tiết" onclick="viewOrderDetail('${o.id}')"><i class="fa-solid fa-eye"></i></button></div>
              <div>${o.status === 'Chờ xác nhận'
                ? `<button class="btn btn-sm btn-success" title="Xác nhận đơn" onclick="updateOrderStatus('${o.id}','Đã xác nhận')"><i class="fa-solid fa-circle-check"></i></button>`
                : o.status === 'Đã xác nhận'
                  ? `<button class="btn btn-sm" style="background:#f97316;color:#fff" title="In hóa đơn" onclick="printOrderInvoice('${o.id}')"><i class="fa-solid fa-print"></i></button>`
                  : '<span></span>'}</div>
              <div>${o.status === 'Chờ xác nhận'
                ? `<button class="btn btn-sm btn-danger" title="Huỷ đơn" onclick="updateOrderStatus('${o.id}','Đã huỷ')"><i class="fa-solid fa-xmark"></i></button>`
                : o.status === 'Đã huỷ'
                  ? `<button class="btn btn-sm btn-danger" title="Xóa đơn" onclick="deleteOrder('${o.id}')"><i class="fa-solid fa-trash"></i></button>`
                  : '<span></span>'}</div>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;

  // Render phân trang đơn hàng
  renderPagination(orderPages, orderPage, 'orderPagination', (p) => { orderPage = p; renderOrdersTable(); });
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

async function deleteAllCancelledOrders() {
  const cancelledCount = orders.filter(o => o.status === 'Đã huỷ').length;
  if (cancelledCount === 0) {
    showToast('<i class="fa-solid fa-circle-info"></i> Không có đơn hàng đã huỷ nào', 'error');
    return;
  }
  if (!confirm(`Xoá vĩnh viễn TẤT CẢ ${cancelledCount} đơn hàng đã huỷ?\nHành động này không thể hoàn tác!`)) return;
  try {
    const res = await adminFetch('/api/admin/orders-cancelled/all', { method: 'DELETE' });
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast('<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Lỗi xoá đơn hàng'), 'error');
      return;
    }
    await loadOrders();
    orderPage = 1;
    renderOrdersTable();
    renderDashboard();
    showToast(`<i class="fa-solid fa-trash"></i> Đã xoá ${data.deleted} đơn hàng đã huỷ`, 'success');
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
          <div><strong>Ngày đặt:</strong> ${formatOrderDate(o.createdAt)}</div>
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
      ${o.status === 'Đã xác nhận' ? `
        <div style="display:flex;gap:10px;justify-content:center;padding-top:4px">
          <button class="btn" style="background:#f97316;color:#fff;padding:10px 28px;justify-content:center" onclick="printOrderInvoice('${o.id}')"><i class="fa-solid fa-print"></i> In hóa đơn</button>
        </div>` : ''}
    </div>
  `;
  document.getElementById('orderDetailModal').classList.add('open');
}

// ==============================
// IN HÓA ĐƠN BÁN HÀNG (A5)
// ==============================
async function printOrderInvoice(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  // Lấy thông tin cửa hàng từ settings
  let shopName = 'CỬA HÀNG HỮU TẢNH';
  let shopPhone = '';
  let shopAddress = '';
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    if (s.phone)   shopPhone   = s.phone;
    if (s.address) shopAddress = s.address;
  } catch (_) {}

  // Định dạng ngày in hóa đơn
  const now = new Date();
  const printDate = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;
  const printTime = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  const itemRows = o.items.map((item, idx) => `
    <tr class="${idx % 2 === 1 ? 'alt' : ''}">
      <td class="tc">${idx + 1}</td>
      <td class="name">${item.ten || ''}</td>
      <td class="tc">${item.qty}</td>
      <td class="tc">${item.donvi || ''}</td>
      <td class="tr">${item.gia ? (item.gia).toLocaleString('vi-VN') : 'Liên hệ'}</td>
      <td class="tr bold">${item.gia ? ((item.gia) * item.qty).toLocaleString('vi-VN') : 'Liên hệ'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Hóa đơn ${o.id}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: A5 portrait; margin: 10mm 12mm 10mm 12mm; }
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --navy: #1a2e4a; --accent: #2563eb; --light: #eff6ff; --muted: #64748b; --border: #e2e8f0; }
    body { font-family: 'Be Vietnam Pro', Arial, sans-serif; font-size: 10.5px; color: #1e293b; background: #fff; line-height: 1.5; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 3px solid var(--navy); }
    .shop-brand h1 { font-size: 18px; font-weight: 800; color: var(--navy); letter-spacing: .5px; line-height: 1.2; }
    .shop-brand .tagline { font-size: 8.5px; color: var(--muted); margin-top: 2px; }
    .shop-contact { text-align: right; font-size: 9px; color: var(--muted); line-height: 1.7; }
    .shop-contact strong { color: var(--navy); font-weight: 600; }
    .inv-title { background: var(--navy); color: #fff; text-align: center; padding: 7px 0 5px; border-radius: 5px; margin-bottom: 10px; }
    .inv-title h2 { font-size: 13px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; }
    .inv-title .inv-meta { font-size: 8.5px; opacity: .75; margin-top: 1px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; background: var(--light); border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; font-size: 9.5px; }
    .info-grid .full { grid-column: 1 / -1; }
    .info-grid .label { color: var(--muted); font-size: 8.5px; display: block; line-height: 1.2; }
    .info-grid .value { font-weight: 600; color: var(--navy); }
    .info-grid .value.mono { font-family: monospace; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-bottom: 0; }
    thead tr { background: var(--navy); color: #fff; }
    thead th { padding: 5px; font-weight: 600; font-size: 9px; letter-spacing: .3px; }
    th:first-child { border-radius: 4px 0 0 0; } th:last-child { border-radius: 0 4px 0 0; }
    tbody tr { border-bottom: 1px solid var(--border); } tbody tr.alt { background: #f8fafc; }
    tbody td { padding: 5px; vertical-align: middle; }
    td.tc { text-align: center; } td.tr { text-align: right; } td.bold { font-weight: 700; color: var(--navy); } td.name { line-height: 1.35; }
    .total-box { display: flex; justify-content: flex-end; margin-top: 8px; margin-bottom: 10px; }
    .total-inner { background: var(--navy); color: #fff; border-radius: 6px; padding: 8px 14px; display: flex; align-items: center; gap: 14px; min-width: 180px; justify-content: space-between; }
    .total-inner .lbl { font-size: 9px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; opacity: .8; }
    .total-inner .amt { font-size: 15px; font-weight: 800; color: #fbbf24; white-space: nowrap; }
    .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; font-size: 8.5px; color: var(--muted); text-align: center; }
    .sig-box { border: 1px dashed #cbd5e1; border-radius: 4px; padding: 4px 6px 28px; line-height: 1.4; }
    .sig-box strong { color: var(--navy); display: block; font-size: 9px; }
    .footer { border-top: 1px dashed #94a3b8; padding-top: 7px; text-align: center; font-size: 8.5px; color: var(--muted); line-height: 1.7; }
    .footer .thank { font-size: 10px; font-weight: 700; color: var(--navy); margin-bottom: 1px; }
    .footer strong { color: var(--navy); }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="shop-brand">
      <h1>🛍️ ${shopName}</h1>
      <div class="tagline">Chất lượng · Uy tín · Phục vụ tận tâm</div>
    </div>
    <div class="shop-contact">
      ${shopPhone   ? `<div>📞 <strong>${shopPhone}</strong></div>` : ''}
      ${shopAddress ? `<div style="max-width:160px">📍 ${shopAddress}</div>` : ''}
    </div>
  </div>
  <div class="inv-title">
    <h2>Hóa đơn bán hàng</h2>
    <div class="inv-meta">Ngày in: ${printDate} lúc ${printTime}</div>
  </div>
  <div class="info-grid">
    <div><span class="label">Mã đơn hàng</span><span class="value mono">${o.id}</span></div>
    <div><span class="label">Ngày đặt</span><span class="value">${o.createdAt || '—'}</span></div>
    <div><span class="label">Khách hàng</span><span class="value">${o.customer || 'Khách lẻ'}</span></div>
    <div><span class="label">Số điện thoại</span><span class="value">${o.phone || '—'}</span></div>
    ${o.address ? `<div class="full"><span class="label">Địa chỉ giao hàng</span><span class="value">${o.address}</span></div>` : ''}
    ${o.note    ? `<div class="full"><span class="label">Ghi chú</span><span class="value">${o.note}</span></div>`    : ''}
  </div>
  <table>
    <thead><tr>
      <th style="width:22px;text-align:center">#</th>
      <th style="text-align:left">Tên sản phẩm</th>
      <th style="width:72px">Thành tiền</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="5" style="text-align:right;padding-right:8px">TỔNG CỘNG:</td>
        <td style="text-align:right;color:#d00">${(o.total || 0).toLocaleString('vi-VN')}₫</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">
    <p>Cảm ơn quý khách đã mua hàng! 🙏</p>
    <p style="margin-top:3px">Vui lòng giữ hóa đơn để đổi/trả hàng trong vòng <strong>7 ngày</strong>.</p>
  </div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body></html>`;

  const win = window.open('', '_blank', 'width=600,height=850');
  win.document.write(html);
  win.document.close();
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
  reader.onload = async function (e) {
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
          colMap.loai = row.findIndex(c => c.includes('Loại') || c.toLowerCase().includes('loai') || c.includes('Nhóm') || c.toLowerCase().includes('nhom'));
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
          gia: colMap.gia >= 0 ? (parseInt(String(row[colMap.gia]).replace(/\D/g, '')) || 0) : 0,
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
    } catch (err) {
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
        if (/\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(file.name)) {
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
  const files = Array.from(e.target.files).filter(f => /\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(f.name));
  e.target.value = '';
  if (files.length === 0) {
    showFolderUploadResult('error', '<i class="fa-solid fa-triangle-exclamation"></i> Không tìm thấy ảnh trong thư mục được chọn.');
    return;
  }
  processImportImages(files);
}

// Chuẩn hóa mã SP trên client — phải nhất quán với normalizeProductCode() ở server.js
function normalizeCode(c) {
  if (!c) return '';
  return String(c)
    .trim()
    .toLowerCase()
    .replace(/[/:*?"<>|]/g, '_')
    .replace(/[-\s]/g, '_');
}

async function processImportImages(files) {
  if (!files || files.length === 0) {
    showFolderUploadResult('error', '<i class="fa-solid fa-triangle-exclamation"></i> Không có file ảnh nào để xử lý.');
    return;
  }

  // Giới hạn 4MB/file — Vercel Hobby chỉ cho phép body tối đa 4.5MB
  const MAX_FILE_SIZE = 4 * 1024 * 1024;
  const matchedFiles = [];
  const skippedNames = [];
  const oversizedNames = [];

  // Dùng normalizeCode() nhất quán với server để tránh lệch khi so khớp
  const normalizedCodeMap = new Map(
    products.map(p => [normalizeCode(p.ma), String(p.ma).trim()])
  );

  for (const file of files) {
    const extIdx = file.name.lastIndexOf('.');
    const codePart = extIdx >= 0 ? file.name.slice(0, extIdx).trim() : file.name.trim();
    if (!normalizedCodeMap.has(normalizeCode(codePart))) {
      skippedNames.push(file.name);
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      oversizedNames.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      continue;
    }
    matchedFiles.push(file);
  }

  if (matchedFiles.length === 0) {
    let msg = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Không khớp mã sản phẩm nào!</strong> Kiểm tra tên file phải trùng chính xác với mã sản phẩm.<br>';
    if (oversizedNames.length > 0) {
      msg += `<small style="color:var(--muted)"><i class="fa-solid fa-triangle-exclamation"></i> ${oversizedNames.length} file quá lớn (>4MB, giới hạn Vercel): ${oversizedNames.slice(0, 5).join(', ')}</small><br>`;
    }
    if (skippedNames.length > 0) {
      msg += `<small style="color:var(--muted)">File không khớp: ${skippedNames.slice(0, 10).join(', ')}${skippedNames.length > 10 ? ` và ${skippedNames.length - 10} file khác...` : ''}</small>`;
    }
    showFolderUploadResult('error', msg);
    return;
  }

  // Gửi TỪNG FILE MỘT để không vượt giới hạn 4.5MB/request của Vercel Hobby.
  const total = matchedFiles.length;
  let totalUpdated = 0;
  const failedFiles = [];   // lỗi upload thực sự từ server
  const serverSkipped = []; // server báo file nào không match (safety net)

  for (let i = 0; i < total; i++) {
    const file = matchedFiles[i];
    const fileName = getBaseFileName(file.webkitRelativePath || file.name);

    // Cập nhật progress với thanh tiến trình
    const pct = Math.round((i / total) * 100);
    showFolderUploadResult('info',
      `<i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên: <strong>${i + 1}/${total}</strong> — ${fileName}` +
      `<div style="margin-top:8px;background:#bfdbfe;border-radius:4px;height:6px">` +
      `<div style="background:#2563eb;height:6px;border-radius:4px;width:${pct}%"></div></div>`
    );

    const formData = new FormData();
    formData.append('images', file, fileName);

    try {
      const res = await adminFetch('/api/admin/products/import-images', {
        method: 'POST',
        body: formData,
      });
      if (res.status === 401) return;

      let data = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (res.status === 413 || text.includes('Payload Too Large') || text.includes('Request Entity Too Large')) {
          failedFiles.push(`${fileName} (quá lớn)`);
        } else {
          failedFiles.push(`${fileName} (HTTP ${res.status})`);
        }
        continue;
      }

      if (res.ok && data.ok) {
        totalUpdated += data.updated || 0;
        // Hiển thị chi tiết file nào lỗi upload R2 mà server báo về
        if (data.failedFiles && data.failedFiles.length > 0) {
          for (const f of data.failedFiles) {
            failedFiles.push(`${f.filename} (${f.reason || 'lỗi R2'})`);
          }
        }
      } else {
        failedFiles.push(`${fileName} (${data.message || 'lỗi không xác định'})`);
      }
    } catch (err) {
      failedFiles.push(`${fileName} (lỗi kết nối: ${err.message})`);
    }
  }

  // Reload danh sách sản phẩm sau khi cập nhật ảnh
  await loadProducts();
  renderAdminTable();
  renderDashboard();

  // Tổng hợp kết quả
  let resultMsg = `<i class="fa-solid fa-circle-check"></i> Import ảnh hoàn tất! <strong>${totalUpdated}</strong> sản phẩm đã được cập nhật ảnh.`;
  if (oversizedNames.length > 0) {
    resultMsg += `<br><small style="margin-top:6px;display:block;color:inherit;opacity:.8">` +
      `<i class="fa-solid fa-triangle-exclamation"></i> ${oversizedNames.length} file bỏ qua (quá 4MB): ${oversizedNames.slice(0, 5).join(', ')}</small>`;
  }
  if (failedFiles.length > 0) {
    resultMsg += `<br><small style="margin-top:6px;display:block;color:inherit;opacity:.8">` +
      `<i class="fa-solid fa-xmark"></i> ${failedFiles.length} file lỗi upload R2: ${failedFiles.slice(0, 5).join(', ')}</small>`;
  }
  if (skippedNames.length > 0) {
    resultMsg += `<br><small style="margin-top:6px;display:block;color:inherit;opacity:.8">` +
      `<i class="fa-solid fa-triangle-exclamation"></i> ${skippedNames.length} file bỏ qua (không khớp mã): ${skippedNames.slice(0, 10).join(', ')}${skippedNames.length > 10 ? ` và ${skippedNames.length - 10} file khác...` : ''}</small>`;
  }

  showFolderUploadResult(totalUpdated > 0 ? 'success' : 'error', resultMsg);
  if (totalUpdated > 0) {
    showToast(`<i class="fa-solid fa-circle-check"></i> Import ảnh: ${totalUpdated} sản phẩm cập nhật`, 'success');
  }

  document.getElementById('folderUploadText').textContent = 'Kéo thả thư mục chứa ảnh sản phẩm vào đây hoặc nhấn để chọn thư mục';
}

// Dọn ảnh broken: gọi cleanup-broken-images route rồi reload
async function cleanupBrokenImages() {
  const btn = document.getElementById('btnCleanupBrokenImages');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang quét...'; }
  try {
    const res = await adminFetch('/api/admin/products/cleanup-broken-images', { method: 'POST' });
    if (res.status === 401) return;
    const data = await res.json();
    if (data.ok) {
      await loadProducts();
      renderAdminTable();
      renderDashboard();
      const msg = data.cleaned > 0
        ? `Đã xoá ${data.cleaned} URL ảnh broken. Các sản phẩm đó sẽ hiện trong "Chưa có ảnh".`
        : 'Không tìm thấy URL ảnh nào bị hỏng. DB đang sạch!';
      showToast(`<i class="fa-solid fa-broom"></i> ${msg}`, data.cleaned > 0 ? 'warning' : 'success');
    } else {
      showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${data.message}`, 'error');
    }
  } catch (err) {
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi kết nối: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-broom"></i> Dọn ảnh lỗi'; }
  }
}


function getBaseFileName(name) {
  const segments = name.split(/[/\\]/);
  return segments[segments.length - 1];
}

function showFolderUploadResult(type, msg) {
  const el = document.getElementById('folderUploadResult');
  const bgMap = { success: '#d1fae5', error: '#fee2e2', info: '#dbeafe' };
  const colorMap = { success: '#065f46', error: '#991b1b', info: '#1e40af' };
  el.innerHTML = `<div class="upload-result" style="background:${bgMap[type] || '#f1f5f9'};color:${colorMap[type] || '#1e293b'};padding:14px 16px;border-radius:8px;font-size:.875rem;line-height:1.6">${msg}</div>`;
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
  document.getElementById(id).addEventListener('click', function (e) {
    if (e.target === this) this.classList.remove('open');
  });
});

// ==============================
// REALTIME UPDATES LISTENERS
// ==============================
// ==============================
// REALTIME UPDATES (POLLING)
// ==============================
let lastKnownUpdates = {};
let pollingTimer = null;

async function pollUpdates() {
  try {
    const res = await fetch('/api/updates/poll', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;

    for (const topic in data.updates) {
      const newTs = data.updates[topic];
      if (lastKnownUpdates[topic] === undefined) {
        // Lần đầu tiên: chỉ ghi nhận mốc thời gian, không trigger reload
        lastKnownUpdates[topic] = newTs;
        continue;
      }
      if (lastKnownUpdates[topic] !== newTs) {
        lastKnownUpdates[topic] = newTs;
        await handleTopicUpdate(topic);
      }
    }
  } catch (err) {
    console.warn('Lỗi khi poll cập nhật:', err);
  }
}

async function handleTopicUpdate(topic) {
  if (topic === 'products') {
    console.log('⚡ Nhận cập nhật sản phẩm...');
    await loadProducts();
    populateProductTypeFilter();
    renderAdminTable();
    renderDashboard();
  } else if (topic === 'orders') {
    console.log('⚡ Nhận cập nhật đơn hàng...');
    await loadOrders();
    renderOrdersTable();
    renderDashboard();
  } else if (topic === 'settings') {
    console.log('⚡ Nhận cập nhật cấu hình...');
    await loadSettingsForm();
  }
}

function initRealtimeUpdates() {
  pollUpdates(); // gọi ngay lần đầu để lấy mốc thời gian ban đầu
  pollingTimer = setInterval(pollUpdates, 5000); // poll mỗi 5 giây
}

initRealtimeUpdates();

// =====================================================================
// TOOLS MODULE - PARSE INVOICE PDF FRONTEND LOGIC
// =====================================================================
let selectedInvoiceFiles = [];
let parsedInvoicesList = [];

function handleInvoiceDragOver(e) {
  e.preventDefault();
  const zone = document.getElementById('invoiceUploadZone');
  if (zone) zone.style.borderColor = 'var(--primary)';
}

function handleInvoiceDragLeave(e) {
  e.preventDefault();
  const zone = document.getElementById('invoiceUploadZone');
  if (zone) zone.style.borderColor = 'var(--border)';
}

function handleInvoiceDrop(e) {
  e.preventDefault();
  const zone = document.getElementById('invoiceUploadZone');
  if (zone) zone.style.borderColor = 'var(--border)';

  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    filterAndSetInvoiceFiles(e.dataTransfer.files);
  }
}

function handleInvoiceFilesSelect(e) {
  if (e.target.files && e.target.files.length > 0) {
    filterAndSetInvoiceFiles(e.target.files);
  }
}

function filterAndSetInvoiceFiles(filesList) {
  // We append files now to allow pasting multiple times
  const listEl = document.getElementById('invoiceFilesList');
  const btnProcess = document.getElementById('btnProcessInvoices');
  const btnClear = document.getElementById('btnClearInvoices');
  const uploadText = document.getElementById('invoiceUploadText');

  for (let i = 0; i < filesList.length; i++) {
    const file = filesList[i];
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(file.name);
    
    if (isPDF || isImage) {
      if (file.size <= 5 * 1024 * 1024) {
        // Prevent duplicate files based on name and size
        if (!selectedInvoiceFiles.some(f => f.name === file.name && f.size === file.size)) {
          selectedInvoiceFiles.push(file);
        }
      } else {
        showToast(`<i class="fa-solid fa-triangle-exclamation"></i> File ${file.name} vượt quá 5MB.`, 'error');
      }
    } else {
      showToast(`<i class="fa-solid fa-triangle-exclamation"></i> File ${file.name} không phải định dạng PDF hoặc hình ảnh.`, 'error');
    }
  }

  if (selectedInvoiceFiles.length > 0) {
    uploadText.innerHTML = `Đã chọn <strong>${selectedInvoiceFiles.length} file</strong> hóa đơn`;
    listEl.style.display = 'block';
    listEl.innerHTML = '<ul style="margin: 8px 0 0 16px; padding: 0;">' +
      selectedInvoiceFiles.map(f => `<li>${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB)</li>`).join('') +
      '</ul>';
    btnProcess.removeAttribute('disabled');
    btnClear.style.display = 'inline-block';
  } else {
    clearInvoiceSelection();
  }
}

// Paste event listener for clipboard image/pdf import in invoice tab
document.addEventListener('paste', function(e) {
  const invoiceTab = document.getElementById('tools-tab-invoice');
  if (!invoiceTab || invoiceTab.style.display === 'none') {
    return;
  }
  
  if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
    e.preventDefault();
    filterAndSetInvoiceFiles(e.clipboardData.files);
  } else if (e.clipboardData && e.clipboardData.items) {
    const files = [];
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      const item = e.clipboardData.items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          const extension = item.type.split('/')[1] || 'png';
          const newFile = new File([file], `dán-hóa-đơn-${Date.now()}-${i}.${extension}`, { type: file.type });
          files.push(newFile);
        }
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      filterAndSetInvoiceFiles(files);
    }
  }
});

function clearInvoiceSelection() {
  selectedInvoiceFiles = [];
  parsedInvoicesList = [];
  document.getElementById('invoiceFileInput').value = '';
  document.getElementById('invoiceUploadText').innerHTML = 'Kéo thả file PDF, hình ảnh vào đây, hoặc nhấn để chọn file (Hỗ trợ Ctrl+V)';
  document.getElementById('invoiceFilesList').style.display = 'none';
  document.getElementById('invoiceFilesList').innerHTML = '';
  document.getElementById('btnProcessInvoices').setAttribute('disabled', 'true');
  document.getElementById('btnClearInvoices').style.display = 'none';
}

async function processInvoices() {
  if (selectedInvoiceFiles.length === 0) return;

  const btnProcess = document.getElementById('btnProcessInvoices');
  const btnClear = document.getElementById('btnClearInvoices');
  const statusEl = document.getElementById('invoiceProcessingStatus');
  const resultsContainer = document.getElementById('invoiceResultsContainer');

  // Trạng thái đang tải
  btnProcess.setAttribute('disabled', 'true');
  btnClear.style.display = 'none';
  statusEl.style.display = 'block';
  resultsContainer.innerHTML = '';

  const formData = new FormData();
  selectedInvoiceFiles.forEach(file => {
    formData.append('files', file);
  });

  try {
    const res = await adminFetch('/api/tools/parse-invoice', {
      method: 'POST',
      body: formData
    });

    if (res.status === 401) {
      statusEl.style.display = 'none';
      return;
    }

    const data = await res.json();
    statusEl.style.display = 'none';

    if (!res.ok || !data.ok) {
      showToast(`<i class="fa-solid fa-xmark"></i> ${data.message || 'Lỗi xử lý hóa đơn'}`, 'error');
      btnProcess.removeAttribute('disabled');
      btnClear.style.display = 'inline-block';
      return;
    }

    renderInvoiceResults(data.results);
    parsedInvoicesList = data.results.map(r => r.ok ? r.data : null);
    showToast('<i class="fa-solid fa-check"></i> Đã xử lý xong toàn bộ hóa đơn PDF!', 'success');
  } catch (err) {
    console.error(err);
    statusEl.style.display = 'none';
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối máy chủ.', 'error');
    btnProcess.removeAttribute('disabled');
    btnClear.style.display = 'inline-block';
  }
}

function renderInvoiceResults(results) {
  const container = document.getElementById('invoiceResultsContainer');
  container.innerHTML = '';

  if (!results || results.length === 0) {
    container.innerHTML = '<div class="admin-card"><p>Không có kết quả trả về.</p></div>';
    return;
  }

  // 1. Tạo vùng điều hướng Tab phân trang
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'invoice-tabs';
  tabsContainer.style.display = 'flex';
  tabsContainer.style.gap = '8px';
  tabsContainer.style.marginBottom = '16px';
  tabsContainer.style.flexWrap = 'wrap';

  results.forEach((res, index) => {
    const tabBtn = document.createElement('button');
    tabBtn.className = `btn btn-sm invoice-tab-btn ${index === 0 ? 'btn-primary' : 'btn-outline'}`;
    tabBtn.id = `invoice-tab-btn-${index}`;
    if (index !== 0) tabBtn.style.color = 'black';
    tabBtn.innerHTML = `<i class="fa-solid fa-file-invoice"></i> Hóa đơn ${index + 1}`;
    tabBtn.onclick = () => showInvoiceResultTab(index);
    tabsContainer.appendChild(tabBtn);
  });

  container.appendChild(tabsContainer);

  // 2. Tạo nội dung cho từng hóa đơn
  results.forEach((res, index) => {
    const contentDiv = document.createElement('div');
    contentDiv.className = 'invoice-result-content';
    contentDiv.id = `invoice-content-${index}`;
    contentDiv.style.display = index === 0 ? 'block' : 'none';

    const card = document.createElement('div');
    card.className = 'admin-card';
    card.style.marginBottom = '20px';

    if (!res.ok) {
      card.innerHTML = `
        <div style="color: var(--danger); font-weight: 600; display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-triangle-exclamation"></i> Lỗi file: ${res.fileName}
        </div>
        <p style="margin-top: 8px; font-size: 0.85rem; color: var(--muted);">${res.message || 'Lỗi không xác định.'}</p>
      `;
      contentDiv.appendChild(card);
      container.appendChild(contentDiv);
      return;
    }

    const inv = res.data;
    const dateStr = inv.invoiceDate ? `${inv.invoiceDate.date}/${inv.invoiceDate.month}/${inv.invoiceDate.year}` : 'N/A';

    // Tạo HTML bảng sản phẩm
    let tableRows = '';
    const products = inv.products || [];
    let totalAmount = 0;
    let totalAmountWithTax = 0;
    products.forEach(p => {
      const amount = Number(p.amount || 0);
      const taxRate = p.taxPercent !== undefined ? Number(p.taxPercent) : 0;
      const taxAmount = amount * taxRate / 100;
      totalAmount += amount;
      totalAmountWithTax += (amount + taxAmount);

      tableRows += `
        <tr>
          <td>${p.name || ''}</td>
          <td>${p.unit || ''}</td>
          <td style="text-align: right;">${p.quantity || 0}</td>
          <td style="text-align: right;">${(p.price || 0).toLocaleString('vi-VN')}</td>
          <td style="text-align: right; font-weight: 600;">${(p.amount || 0).toLocaleString('vi-VN')}</td>
          <td style="text-align: right; color: #16a34a; font-weight: 500;">${p.taxPercent !== undefined ? p.taxPercent + '%' : '0%'}</td>
        </tr>
      `;
    });

    // Cảnh báo nhà cung cấp chưa có trên hệ thống
    let supplierAlertHTML = '';
    if (inv.isNewSupplier) {
      supplierAlertHTML = `
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #ef4444; padding: 12px; border-radius: 6px; margin-top: 16px;">
          <strong style="color: #991b1b; font-size: 0.9rem; display: block; margin-bottom: 4px;">
            <i class="fa-solid fa-building-circle-exclamation"></i> Cảnh báo: Nhà cung cấp chưa có trên hệ thống
          </strong>
          <span style="font-size: 0.85rem; color: #7f1d1d;">${inv.sellerName || 'Không xác định'}</span>
        </div>
      `;
    }

    // Lọc các sản phẩm chưa có trên hệ thống
    const newProducts = products.filter(p => p.isNewSystemProduct);
    let alertHTML = '';
    if (newProducts.length > 0) {
      const tableRowsHTML = newProducts.map(p => `
        <tr>
          <td style="padding: 6px 10px; border-bottom: 1px solid #fef3c7; text-align: left; color: #78350f;">${p.name}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #fef3c7; text-align: left; color: #78350f; font-weight: 500; width: 80px;">${p.unit || 'N/A'}</td>
        </tr>
      `).join('');

      alertHTML = `
        <div style="background: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
            <strong style="color: #b45309; font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-circle-exclamation"></i> Cảnh báo: Sản phẩm gợi ý chưa có trên hệ thống
            </strong>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn btn-warning btn-sm btn-copy-new-products" onclick="copyNewProductsToClipboard(this, ${index})" style="background: #f59e0b; color: white; border: none; font-weight: 600;">
                <i class="fa-solid fa-copy"></i> Copy danh sách
              </button>
              <button class="btn btn-warning btn-sm btn-export-misa" onclick="exportNewProductsExcel(${index})" style="background: #d97706; color: white; border: none; font-weight: 600;">
                <i class="fa-solid fa-file-excel"></i> Xuất file tạo mới Hàng Hóa (MISA)
              </button>
            </div>
          </div>
          <div style="max-height: 200px; overflow-y: auto; background: white; border: 1px solid #fef3c7; border-radius: 4px;">
            <table id="new-products-table-${index}" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
              <thead>
                <tr style="background: #fffbeb;">
                  <th style="padding: 8px 10px; border-bottom: 1px solid #fef3c7; text-align: left; color: #b45309; font-weight: 600;">Tên sản phẩm</th>
                  <th style="padding: 8px 10px; border-bottom: 1px solid #fef3c7; text-align: left; color: #b45309; font-weight: 600;">ĐVT</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHTML}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
        <div>
          <h4 style="margin: 0; font-size: 1rem; color: var(--text);"><i class="fa-solid fa-file-invoice"></i> Hóa đơn: ${res.fileName}</h4>
          <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: var(--muted);"><strong>Đơn vị bán:</strong> ${inv.sellerName || 'N/A'}</p>
        </div>
        <div style="font-size: 0.85rem; text-align: right; color: var(--text);">
          <div><strong>Ký hiệu (Serial):</strong> ${inv.serial || 'N/A'}</div>
          <div><strong>Số hóa đơn (Số HĐ):</strong> ${inv.invoiceNumber || 'N/A'}</div>
          <div><strong>Mã thuế/Cơ quan thuế:</strong> ${inv.taxCode || 'N/A'}</div>
          <div><strong>Ngày hóa đơn:</strong> ${dateStr}</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 0.9rem; font-weight: 600; color: black;">Danh sách sản phẩm</span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-success btn-sm btn-export-invoice-excel" onclick="exportSingleInvoiceExcel(${index})">
            <i class="fa-solid fa-file-excel"></i> Xuất Excel Nhập Kho
          </button>
          <button class="btn btn-outline btn-sm btn-copy-table" style="color: black; border-color: #ccc;" onclick="copyInvoiceTableToClipboard(this, ${index})">
            <i class="fa-solid fa-copy"></i> Copy Bảng sang Excel
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table" id="invoice-table-${index}">
          <thead>
            <tr>
              <th>Tên sản phẩm</th>
              <th>ĐVT</th>
              <th style="text-align: right;">Số lượng</th>
              <th style="text-align: right;">Đơn giá</th>
              <th style="text-align: right;">Thành tiền</th>
              <th style="text-align: right;">Thuế (%)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="6" style="text-align:center;">Không có sản phẩm nào.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div style="margin-top: 14px; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 24px; font-size: 0.95rem; line-height: 1.6; color: var(--text); border-top: 1px dashed var(--border); padding-top: 12px;">
        <div><strong>Tổng thành tiền (chưa thuế):</strong> <span style="font-weight: 600; color: #b45309; margin-left: 4px;">${totalAmount.toLocaleString('vi-VN')}₫</span></div>
        <div><strong>Tổng thành tiền sau thuế:</strong> <span style="font-weight: 700; color: #16a34a; font-size: 1.05rem; margin-left: 4px;">${Math.round(totalAmountWithTax).toLocaleString('vi-VN')}₫</span></div>
      </div>

      ${supplierAlertHTML}
      ${alertHTML}
    `;

    contentDiv.appendChild(card);
    container.appendChild(contentDiv);
  });

  // Khôi phục các nút
  document.getElementById('btnProcessInvoices').removeAttribute('disabled');
  document.getElementById('btnClearInvoices').style.display = 'inline-block';
}

function showInvoiceResultTab(index) {
  // Thay đổi class hoạt động của nút tab
  document.querySelectorAll('.invoice-tab-btn').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-outline');
    btn.style.color = 'black';
  });
  const activeBtn = document.getElementById(`invoice-tab-btn-${index}`);
  if (activeBtn) {
    activeBtn.classList.remove('btn-outline');
    activeBtn.classList.add('btn-primary');
    activeBtn.style.color = '';
  }

  // Ẩn/Hiện nội dung tương ứng
  document.querySelectorAll('.invoice-result-content').forEach(content => {
    content.style.display = 'none';
  });
  const activeContent = document.getElementById(`invoice-content-${index}`);
  if (activeContent) {
    activeContent.style.display = 'block';
  }
}

function copyInvoiceTableToClipboard(btn, index) {
  const table = document.getElementById(`invoice-table-${index}`);
  if (!table) return;

  // Lấy dữ liệu từ bảng để tạo chuỗi dạng Tab-separated values (TSV)
  const rows = table.querySelectorAll('tbody tr');
  let tsvContent = "Tên sản phẩm\tĐVT\tSố lượng\tĐơn giá\tThành tiền\n";

  rows.forEach(row => {
    const cols = row.querySelectorAll('td');
    if (cols.length >= 5) {
      const name = cols[0].innerText.trim();
      const unit = cols[1].innerText.trim();
      const qty = cols[2].innerText.replace(/\./g, '').trim(); // bỏ dấu chấm phân tách hàng nghìn nếu có
      const price = cols[3].innerText.replace(/\./g, '').trim();
      const amt = cols[4].innerText.replace(/\./g, '').trim();
      tsvContent += `${name}\t${unit}\t${qty}\t${price}\t${amt}\n`;
    }
  });

  navigator.clipboard.writeText(tsvContent).then(() => {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Đã copy!';
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-success');
    btn.style.color = '';
    showToast('<i class="fa-solid fa-check"></i> Đã sao chép bảng vào Clipboard (Dạng Excel)!', 'success');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('btn-success');
      btn.classList.add('btn-outline');
      btn.style.color = 'black';
    }, 2000);
  }).catch(err => {
    console.error('Không thể copy:', err);
    showToast('<i class="fa-solid fa-xmark"></i> Không thể sao chép dữ liệu.', 'error');
  });
}

function copyNewProductsToClipboard(btn, index) {
  const table = document.getElementById(`new-products-table-${index}`);
  if (!table) return;

  const rows = table.querySelectorAll('tbody tr');
  let tsvContent = "Tên sản phẩm\tĐVT\n";

  rows.forEach(row => {
    const cols = row.querySelectorAll('td');
    if (cols.length >= 2) {
      const name = cols[0].innerText.trim();
      const unit = cols[1].innerText.trim();
      tsvContent += `${name}\t${unit}\n`;
    }
  });

  navigator.clipboard.writeText(tsvContent).then(() => {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Đã copy!';
    btn.style.background = '#16a34a';
    showToast('<i class="fa-solid fa-check"></i> Đã sao chép danh sách sản phẩm mới vào Clipboard!', 'success');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '#f59e0b';
    }, 2000);
  }).catch(err => {
    console.error('Không thể copy:', err);
    showToast('<i class="fa-solid fa-xmark"></i> Không thể sao chép dữ liệu.', 'error');
  });
}

// ==============================
// NHÀ CUNG CẤP (SUPPLIERS)
// ==============================
async function loadSuppliersList() {
  try {
    const res = await adminFetch('/api/suppliers');
    const data = await res.json();
    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 20px 0;">Chưa có dữ liệu nhà cung cấp.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(s => `
      <tr>
        <td><code style="font-size: .85rem; background: var(--bg); padding: 2px 6px; border-radius: 4px;">${s.code || ''}</code></td>
        <td style="font-weight: 500;">${s.name || ''}</td>
        <td>${s.phone || '-'}</td>
        <td><span class="badge ${s.status === 'Ngừng theo dõi' ? 'badge-red' : 'badge-green'}">${s.status || 'Đang theo dõi'}</span></td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Lỗi khi tải danh sách nhà cung cấp:', err);
    showToast('<i class="fa-solid fa-xmark"></i> Không tải được danh sách nhà cung cấp.', 'error');
  }
}

async function importSuppliersExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const btn = document.getElementById('btnImportSuppliers');
  const spinner = document.getElementById('supplierImportSpinner');

  if (btn) btn.style.display = 'none';
  if (spinner) spinner.style.display = 'inline-block';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await adminFetch('/api/suppliers/import', {
      method: 'POST',
      body: formData
    });

    const result = await res.json();
    if (result.ok) {
      showToast(`<i class="fa-solid fa-circle-check"></i> Import hoàn tất! +${result.added} mới, ${result.updated} cập nhật`, 'success');
      await loadSuppliersList();
    } else {
      showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${result.message}`, 'error');
    }
  } catch (err) {
    console.error('Lỗi import nhà cung cấp:', err);
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối khi import.', 'error');
  } finally {
    if (btn) btn.style.display = 'inline-block';
    if (spinner) spinner.style.display = 'none';
    event.target.value = ''; // Reset input
  }
}

// ==============================
// SUBTAB SWITCH & EXPORT INVENTORY
// ==============================
// ==============================
// EXPORT SINGLE INVOICE TO EXCEL
// ==============================
async function exportSingleInvoiceExcel(index) {
  const inv = parsedInvoicesList[index];
  if (!inv) {
    showToast('<i class="fa-solid fa-xmark"></i> Không tìm thấy dữ liệu hóa đơn.', 'error');
    return;
  }

  // Tìm nút xuất để tạo hiệu ứng spinner
  const btn = document.querySelector(`#invoice-content-${index} .btn-export-invoice-excel`);
  let originalHTML = '';
  if (btn) {
    originalHTML = btn.innerHTML;
    btn.setAttribute('disabled', 'true');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất...';
  }

  try {
    const res = await adminFetch('/api/tools/export-inventory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([inv]) // Gửi dưới dạng mảng có 1 hóa đơn
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Lỗi xuất file từ máy chủ.');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Tương đồng định dạng 'Số chứng từ' trên server (Số HĐ bỏ 0 + Serial)
    const invoiceNumStripped = inv.invoiceNumber ? String(inv.invoiceNumber).replace(/^0+/, '') : '';
    const serialStr = inv.serial || '';
    const documentNumber = invoiceNumStripped ? (invoiceNumStripped + serialStr) : (serialStr || 'Invoice');
    
    a.download = `Phieu_Nhap_Kho_${documentNumber}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    showToast('<i class="fa-solid fa-circle-check"></i> Đã xuất file nhập kho thành công!', 'success');
  } catch (err) {
    console.error(err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.removeAttribute('disabled');
      btn.innerHTML = originalHTML;
    }
  }
}

function exportNoImageProductsExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('<i class="fa-solid fa-xmark"></i> Thư viện xuất Excel chưa tải xong!', 'error');
    return;
  }
  const noImageList = products.filter(p => !p.image);
  if (noImageList.length === 0) {
    showToast('<i class="fa-solid fa-check"></i> Tất cả sản phẩm đều đã có ảnh!', 'success');
    return;
  }
  
  const wsData = noImageList.map((p, index) => ({
    'STT': index + 1,
    'Mã SP': p.ma,
    'Tên sản phẩm': p.ten,
    'Giá bán': p.gia,
    'ĐVT': p.donvi || '',
    'Loại': p.loai || '',
    'Trạng thái': p.trangthai || 'Đang theo dõi',
    'Bán chạy': p.isBestSeller ? 'Có' : 'Không'
  }));

  const ws = XLSX.utils.json_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SP_Chua_Anh");
  XLSX.writeFile(wb, "Danh_Sach_SP_Chua_Anh.xlsx");
}

// ==============================
// GEMINI API KEY MANAGEMENT
// ==============================
async function toggleGeminiKeySource() {
  const source = document.querySelector('input[name="geminiKeySource"]:checked').value;
  const container = document.getElementById('customApiKeyContainer');
  const hint = document.getElementById('geminiKeyHint');

  if (source === 'custom') {
    if (container) container.style.display = 'flex';
    if (hint) hint.innerHTML = 'Hệ thống sẽ sử dụng Key cá nhân do bạn nhập ở trên.';
  } else {
    if (container) container.style.display = 'none';
    if (hint) hint.innerHTML = 'Hệ thống đang sử dụng Key mặc định cấu hình trên Azure/máy chủ.';
  }

  // Tự động lưu nguồn khóa lên server khi thay đổi lựa chọn
  try {
    await adminFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiKeySource: source })
    });
  } catch (err) {
    console.error('Lỗi lưu nguồn API key:', err);
  }
}

async function loadGeminiApiKeyToInput() {
  try {
    const res = await adminFetch('/api/settings');
    const settings = await res.json();

    // Đánh dấu nguồn key hiện tại
    const source = settings.geminiKeySource || 'env';
    const radio = document.querySelector(`input[name="geminiKeySource"][value="${source}"]`);
    if (radio) {
      radio.checked = true;
    }

    const input = document.getElementById('inputGeminiApiKey');
    if (input) {
      input.value = settings.geminiApiKey || '';
    }

    // Hiển thị khung nhập nếu cần thiết
    const container = document.getElementById('customApiKeyContainer');
    const hint = document.getElementById('geminiKeyHint');
    if (source === 'custom') {
      if (container) container.style.display = 'flex';
      if (hint) hint.innerHTML = 'Hệ thống sẽ sử dụng Key cá nhân do bạn nhập ở trên.';
    } else {
      if (container) container.style.display = 'none';
      if (hint) hint.innerHTML = 'Hệ thống đang sử dụng Key mặc định cấu hình trên Azure/máy chủ.';
    }
  } catch (err) {
    console.error('Lỗi tải Gemini API Key:', err);
  }
}

async function saveGeminiApiKey() {
  const input = document.getElementById('inputGeminiApiKey');
  const key = input ? input.value.trim() : '';

  try {
    const res = await adminFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiApiKey: key })
    });
    if (res.status === 401) return;
    const data = await res.json();
    if (res.ok && data.ok) {
      showToast('<i class="fa-solid fa-circle-check"></i> Đã lưu Gemini API Key thành công!', 'success');
    } else {
      showToast('<i class="fa-solid fa-xmark"></i> Lỗi: ' + (data.message || 'Không thể lưu'), 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối mạng.', 'error');
  }
}

// ==============================
// EXPORT NEW PRODUCTS TO MISA TEMPLATE
// ==============================
async function exportNewProductsExcel(index) {
  const inv = parsedInvoicesList[index];
  if (!inv || !inv.products) {
    showToast('<i class="fa-solid fa-xmark"></i> Không tìm thấy dữ liệu hóa đơn.', 'error');
    return;
  }

  const newProducts = inv.products.filter(p => p.isNewSystemProduct);
  if (newProducts.length === 0) {
    showToast('<i class="fa-solid fa-xmark"></i> Không có sản phẩm mới nào để xuất.', 'error');
    return;
  }

  const btn = document.querySelector(`#invoice-content-${index} .btn-export-misa`);
  let originalHTML = '';
  if (btn) {
    originalHTML = btn.innerHTML;
    btn.setAttribute('disabled', 'true');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất...';
  }

  try {
    const res = await adminFetch('/api/tools/export-new-products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newProducts)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Lỗi xuất file từ máy chủ.');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Danh_sach_hang_hoa_moi.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    showToast('<i class="fa-solid fa-circle-check"></i> Đã xuất danh sách hàng hóa mới MISA thành công!', 'success');
  } catch (err) {
    console.error(err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.removeAttribute('disabled');
      btn.innerHTML = originalHTML;
    }
  }
}

async function downloadAllImagesZip(btn) {
  let originalHTML = '';
  if (btn) {
    originalHTML = btn.innerHTML;
    btn.setAttribute('disabled', 'true');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang nén file...';
  }

  try {
    const res = await adminFetch('/api/admin/tools/download-images-zip', {
      method: 'GET'
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Lỗi nén tệp tin từ máy chủ.');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'public_img.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    showToast('<i class="fa-solid fa-circle-check"></i> Đã nén và tải về file ZIP hình ảnh thành công!', 'success');
  } catch (err) {
    console.error(err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.removeAttribute('disabled');
      btn.innerHTML = originalHTML;
    }
  }
}

function switchToolsTab(tabName, btn) {
  document.querySelectorAll('.tools-tab-btn').forEach(b => {
    b.classList.remove('btn-primary');
    b.classList.add('btn-outline');
    b.style.color = 'black';
  });
  if (btn) {
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-primary');
    btn.style.color = '';
  }

  document.querySelectorAll('.tools-tab-content').forEach(content => {
    content.style.display = 'none';
  });
  const activeContent = document.getElementById(`tools-tab-${tabName}`);
  if (activeContent) {
    activeContent.style.display = 'block';
  }
}

