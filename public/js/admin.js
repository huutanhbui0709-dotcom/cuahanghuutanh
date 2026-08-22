// ==============================
// STATE
// ==============================
if (window.location.protocol === 'file:') {
  window.location.href = 'https://cuahanghuutanh.vercel.app/admin';
}

let products = [];
let orders = [];
let suppliers = [];

const ITEMS_PER_PAGE = 24;
let adminPage = 1;

let ORDERS_PER_PAGE = 10;
let orderPage = 1;

let INVENTORY_PER_PAGE = 20;
let inventoryPage = 1;

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

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'stockReceiptFormModal') {
    if (typeof srfm_hideDropdown === 'function') srfm_hideDropdown();
  }
}

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
  const toggleBtn = document.getElementById('toggleSidebarBtn');
  if (toggleBtn) toggleBtn.classList.add('hidden');
}

function showDashboard() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('adminView').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  const toggleBtn = document.getElementById('toggleSidebarBtn');
  if (toggleBtn) toggleBtn.classList.remove('hidden');
  initSidebarState();
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
  await Promise.all([loadProducts(), loadOrders(), loadSuppliers()]);
  populateProductTypeFilter();
  renderDashboard();
  renderAdminTable();
  renderOrdersTable();
}

async function loadSuppliers() {
  try {
    const res = await adminFetch('/api/suppliers');
    if (!res.ok) return;
    const data = await res.json();
    suppliers = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Không tải được nhà cung cấp:', err);
  }
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
  if (tab === 'inventory') loadInventoryHistory();
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
          <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.ten.replace(/"/g, '&quot;')}">${p.ten}</td>
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
// COMBOBOX HANDLERS (SEARCHABLE & CUSTOM-CREATABLE)
// ==============================
const COMBO_OPTIONS = {
  donvi: ["Cái", "Mét", "Bộ", "Hộp", "Kg", "Lon", "Bao", "Chiếc", "Cuộn", "Cặp", "Viên", "Thùng", "Tấm", "Khậc"],
  loai: ["Hàng hóa thường", "Hàng hóa dịch vụ", "Dụng cụ", "Vật liệu xây dựng", "Thiết bị điện", "Khác"]
};

function renderComboboxList(type, filterText = '') {
  const listEl = document.getElementById(`combo_${type}_list`);
  if (!listEl) return;
  listEl.innerHTML = '';
  
  const options = COMBO_OPTIONS[type];
  const currentValue = document.getElementById(`pf_${type}`).value;
  
  const filtered = options.filter(opt => opt.toLowerCase().includes(filterText.toLowerCase()));
  
  if (filtered.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.style.cssText = "padding: 8px 12px; font-size: 0.875rem; color: #9ca3af; font-style: italic;";
    emptyEl.textContent = "Không tìm thấy lựa chọn nào";
    listEl.appendChild(emptyEl);
    return;
  }
  
  filtered.forEach(opt => {
    const isSelected = currentValue === opt;
    const itemEl = document.createElement('div');
    
    // Style option list items: Padding px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex justify-between items-center cursor-pointer rounded-lg mx-1
    itemEl.style.cssText = "padding: 8px 12px; font-size: 0.875rem; color: #374151; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border-radius: 8px; margin: 2px 4px; transition: background 0.15s, color 0.15s;";
    
    if (isSelected) {
      // Soft blue background (bg-blue-50/70) + text-blue-600 font-medium
      itemEl.style.background = "rgba(239, 246, 255, 0.7)"; 
      itemEl.style.color = "#2563eb"; 
      itemEl.style.fontWeight = "500";
    } else {
      itemEl.onmouseover = () => { itemEl.style.background = "#f9fafb"; };
      itemEl.onmouseout = () => { itemEl.style.background = "transparent"; };
    }
    
    const textNode = document.createElement('span');
    textNode.textContent = opt;
    itemEl.appendChild(textNode);
    
    if (isSelected) {
      const checkEl = document.createElement('span');
      checkEl.textContent = "✓";
      checkEl.style.cssText = "font-weight: bold; font-size: 0.85rem; color: #2563eb;";
      itemEl.appendChild(checkEl);
    }
    
    itemEl.onclick = (e) => {
      e.stopPropagation();
      selectComboboxOption(type, opt);
    };
    
    listEl.appendChild(itemEl);
  });
}

function showComboboxDropdown(type) {
  const dropdown = document.getElementById(`combo_${type}_dropdown`);
  if (dropdown) {
    dropdown.style.display = 'block';
    const filterText = document.getElementById(`pf_${type}`).value;
    renderComboboxList(type, filterText);
  }
  
  // Focus ring styling: focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
  const input = document.getElementById(`pf_${type}`);
  if (input) {
    input.style.borderColor = "#3b82f6";
    input.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.2)";
  }
}

function hideComboboxDropdown(type) {
  const dropdown = document.getElementById(`combo_${type}_dropdown`);
  if (dropdown) {
    dropdown.style.display = 'none';
  }
  
  const input = document.getElementById(`pf_${type}`);
  if (input) {
    input.style.borderColor = "#d1d5db";
    input.style.boxShadow = "none";
  }
}

function toggleComboboxDropdown(type, event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById(`combo_${type}_dropdown`);
  if (dropdown) {
    if (dropdown.style.display === 'none' || !dropdown.style.display) {
      document.getElementById(`pf_${type}`).focus();
    } else {
      hideComboboxDropdown(type);
    }
  }
}

function filterComboboxOptions(type) {
  const filterText = document.getElementById(`pf_${type}`).value;
  renderComboboxList(type, filterText);
}

function selectComboboxOption(type, value) {
  const input = document.getElementById(`pf_${type}`);
  if (input) {
    input.value = value;
  }
  hideComboboxDropdown(type);
}

function handleComboboxKeydown(event, type) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const value = event.target.value.trim();
    if (value) {
      selectComboboxOption(type, value);
    }
  }
}

// Global click handler to close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  const comboTypes = ['donvi', 'loai'];
  comboTypes.forEach(type => {
    const container = document.getElementById(`combo_${type}_container`);
    if (container && !container.contains(e.target)) {
      hideComboboxDropdown(type);
    }
  });
});

// ==============================
// PRODUCT ADD / EDIT / DELETE
// ==============================
function openProductModal(ma) {
  const isEdit = !!ma;
  const titleEl = document.getElementById('productModalTitle');
  if (isEdit) {
    titleEl.innerHTML = `Sửa sản phẩm <span style="background:#f3f4f6;color:#374151;font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:6px;margin-left:8px;letter-spacing:.02em">${ma}</span>`;
  } else {
    titleEl.textContent = 'Thêm sản phẩm';
  }

  document.getElementById('pf_originalMa').value = ma || '';
  const p = isEdit ? products.find(x => x.ma === ma) : null;

  const maInput = document.getElementById('pf_ma');
  maInput.value = p ? p.ma : '';
  maInput.disabled = isEdit;
  maInput.style.cursor = isEdit ? 'not-allowed' : '';
  maInput.style.background = isEdit ? '#f9fafb' : '';

  document.getElementById('pf_ten').value = p ? p.ten : '';
  document.getElementById('pf_gia').value = p ? p.gia : '';

  document.getElementById('pf_donvi').value = p ? (p.donvi || 'Cái') : 'Cái';
  document.getElementById('pf_loai').value = p ? (p.loai || 'Hàng hóa thường') : 'Hàng hóa thường';

  document.getElementById('pf_trangthai').value = p ? (p.trangthai || 'Đang theo dõi') : 'Đang theo dõi';



  // Image preview
  document.getElementById('pf_image').value = '';
  const previewWrap = document.getElementById('pf_image_preview');
  const previewImg = document.getElementById('pf_image_img');
  if (p && p.image) {
    previewImg.src = getProductImageUrl(p);
    previewWrap.style.display = 'flex';
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
      previewWrap.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  } else {
    previewWrap.style.display = 'none';
  }
}

function clearProductImage() {
  document.getElementById('pf_image').value = '';
  document.getElementById('pf_image_img').src = '';
  document.getElementById('pf_image_preview').style.display = 'none';
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
  if (!donvi) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng nhập hoặc chọn đơn vị tính', 'error'); return; }
  if (!loai) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng nhập hoặc chọn loại hàng hóa', 'error'); return; }

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
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = m[3] ? parseInt(m[3], 10) : 0;
    const d = parseInt(m[4], 10);
    const mo = parseInt(m[5], 10) - 1;
    const y = parseInt(m[6], 10);
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
    const time = `${m[1].padStart(2, '0')}:${m[2]}`;
    const date = `${m[4].padStart(2, '0')}/${m[5].padStart(2, '0')}/${m[6]}`;
    return `<div style="text-align:center;line-height:1.5">`
      + `<span style="font-weight:700;color:var(--text);display:block">${date}</span>`
      + `<span style="font-size:.72rem;color:var(--muted);display:block">${time}</span>`
      + `</div>`;
  }
  return str;
}

function changeOrderPageSize(size) {
  ORDERS_PER_PAGE = parseInt(size) || 10;
  orderPage = 1;
  renderOrdersTable();
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
            <div style="display:flex;gap:8px;justify-content:flex-start;align-items:center">
              <button class="btn btn-sm btn-primary" title="Xem chi tiết" onclick="viewOrderDetail('${o.id}')"><i class="fa-solid fa-eye"></i></button>
              ${o.status === 'Chờ xác nhận' || o.status === 'Đã xác nhận'
      ? `<button class="btn btn-sm" style="background:#f97316;color:#fff" title="In hóa đơn" onclick="printOrderInvoice('${o.id}')"><i class="fa-solid fa-print"></i></button>`
      : ''
    }
              ${o.status === 'Chờ xác nhận'
      ? `<button class="btn btn-sm btn-success" title="Xác nhận đơn" onclick="updateOrderStatus('${o.id}','Đã xác nhận')"><i class="fa-solid fa-circle-check"></i></button>`
      : ''
    }
              ${o.status === 'Chờ xác nhận'
      ? `<button class="btn btn-sm btn-danger" title="Huỷ đơn" onclick="updateOrderStatus('${o.id}','Đã huỷ')"><i class="fa-solid fa-xmark"></i></button>`
      : o.status === 'Đã huỷ'
        ? `<button class="btn btn-sm btn-danger" title="Xóa đơn" onclick="deleteOrder('${o.id}')"><i class="fa-solid fa-trash"></i></button>`
        : ''
    }
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;

  // Render phân trang đơn hàng
  renderPagination(orderPages, orderPage, 'orderPagination', (p) => { orderPage = p; renderOrdersTable(); });
  const infoEl = document.getElementById('orderPaginationInfo');
  if (infoEl) {
    const from = (orderPage - 1) * ORDERS_PER_PAGE + 1;
    const to = Math.min(orderPage * ORDERS_PER_PAGE, totalOrders);
    infoEl.textContent = totalOrders > ORDERS_PER_PAGE
      ? `Trang ${orderPage}/${orderPages} · Hiển thị ${from}–${to} / ${totalOrders} đơn`
      : `Tổng ${totalOrders} đơn`;
  }
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
          <div><strong>Ngày đặt:</strong> ${(() => {
      if (!o.createdAt) return '—';
      const m = o.createdAt.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) {
        const time = `${m[1].padStart(2, '0')}:${m[2]}`;
        const date = `${m[3].padStart(2, '0')}/${m[4].padStart(2, '0')}/${m[5]}`;
        return `${date} | ${time}`;
      }
      return o.createdAt;
    })()}</div>
          <div><strong>Khách hàng:</strong> ${o.customer}</div>
          <div><strong>SĐT:</strong> ${o.phone}</div>
          <div><strong>Địa chỉ:</strong> ${o.address}</div>
          <div><strong>Trạng thái:</strong> <span class="badge ${statusBadge(o.status)}">${o.status}</span></div>
          ${o.note ? `<div style="grid-column:1/-1"><strong>Ghi chú:</strong> ${o.note}</div>` : ''}
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Sản phẩm</th><th>Mã SP</th><th>Đơn giá</th><th>SL</th><th>ĐVT</th><th>Thành tiền</th><th>Ghi chú SP</th></tr></thead>
          <tbody>${o.items.map(item => `
            <tr>
              <td style="white-space:normal;word-break:break-word;min-width:200px">${item.ten}</td>
              <td><code style="font-size:.72rem">${item.ma}</code></td>
              <td style="white-space:nowrap">${formatPrice(item.gia)}</td>
              <td style="text-align:center;font-weight:700">${item.qty}</td>
              <td>${item.donvi || '-'}</td>
              <td style="font-weight:700;color:var(--primary);white-space:nowrap">${formatPrice(item.gia * item.qty)}</td>
              <td style="white-space:normal;word-break:break-word;font-size:.78rem;color:var(--muted);font-style:italic;min-width:150px">${item.note || '—'}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="6" style="text-align:right;font-weight:700;padding:10px 14px;border-top:2px solid var(--border)">Tổng cộng:</td><td style="font-weight:800;font-size:1.1rem;color:var(--primary);padding:10px 14px;border-top:2px solid var(--border);white-space:nowrap">${formatPrice(o.total)}</td></tr></tfoot>
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
          <button class="btn btn-primary" style="padding:10px 20px;justify-content:center" onclick="createOrderFromExisting('${o.id}');closeModal('orderDetailModal')"><i class="fa-solid fa-copy"></i> Tạo đơn mới từ đơn này</button>
        </div>` : ''}
      ${o.status === 'Chờ xác nhận' ? `
        <div style="display:flex;gap:10px;justify-content:center;padding-top:4px;border-top:1px solid var(--border);margin-top:4px">
          <button class="btn btn-outline" style="padding:8px 16px;justify-content:center;color:var(--text)" onclick="createOrderFromExisting('${o.id}');closeModal('orderDetailModal')"><i class="fa-solid fa-copy"></i> Tạo đơn mới từ đơn này</button>
        </div>` : ''}
    </div>
  `;
  document.getElementById('orderDetailModal').classList.add('open');
}

// ==============================
// IN HÓA ĐƠN BÁN HÀNG (A4)
// ==============================
async function printOrderInvoice(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  // Lấy thông tin cửa hàng từ settings
  let shopName = 'CỬA HÀNG HỮU TÁNH';
  let shopPhone = '0945 592 209';
  let shopAddress = 'Thị trấn Thốt Nốt, Quận Thốt Nốt, Thành phố Cần Thơ';
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    if (s.shopName) shopName = s.shopName;
    if (s.phone) shopPhone = s.phone;
    if (s.address) shopAddress = s.address;
  } catch (_) { }

  // Định dạng ngày in hóa đơn
  const now = new Date();
  const printDateTime = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  // Tính tổng tiền hàng (trước giảm giá)
  const subtotal = (o.items || []).reduce((s, item) => s + (item.gia || 0) * (item.qty || 0), 0);
  const discount = Number(o.discount || 0);
  const shipping = Number(o.shippingFee || o.shipping || 0);
  const grandTotal = Number(o.total || (subtotal - discount + shipping));

  // Hàng hóa
  const itemRows = (o.items || []).map((item, idx) => `
    <tr>
      <td style="text-align:center;border:1px solid #000;padding:4px 3px">${idx + 1}</td>
      <td style="border:1px solid #000;padding:4px 5px">${item.ten || ''}</td>
      <td style="text-align:center;border:1px solid #000;padding:4px 3px">${item.qty}</td>
      <td style="text-align:center;border:1px solid #000;padding:4px 3px">${item.donvi || 'Cái'}</td>
      <td style="text-align:right;border:1px solid #000;padding:4px 4px">${item.gia ? item.gia.toLocaleString('vi-VN') : 'Liên hệ'}</td>
      <td style="text-align:right;font-weight:700;border:1px solid #000;padding:4px 4px">${item.gia ? (item.gia * item.qty).toLocaleString('vi-VN') : 'Liên hệ'}</td>
      <td style="border:1px solid #000;padding:4px 5px;font-size:11px">${item.note || ''}</td>
    </tr>`).join('');

  // Địa chỉ + tọa độ
  const shippingAddress = o.shippingAddress || o.address || '';
  const customerName = o.customerName || o.customer || 'Khách lẻ';

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Hóa Đơn Bán Hàng - ${o.id}</title>
  <style>
    @page { size: auto; margin: 6mm 8mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .info-box, .summary-box, .sig, .footer, tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    body {
      font-family: Arial, Helvetica, sans-serif, system-ui;
      font-size: 13px; color: #000000; background: #ffffff; line-height: 1.25;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .invoice-container {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      border: none !important;
      display: flex;
      flex-direction: column;
      min-height: calc(100vh - 12mm);
    }

    @media print {
      html, body {
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      .invoice-container {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border: none !important;
        display: flex;
        flex-direction: column;
        min-height: calc(100vh - 12mm);
      }
      table {
        width: 100% !important;
      }
    }

    /* ── HEADER ── */
    .hdr { text-align: center; padding: 0 0 6px; }
    .hdr h1 { font-size: 22px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .hdr .sub { font-size: 13px; margin-top: 1px; }
    .dash { border: none; border-top: 1.5px dashed #000000; margin: 8px 0; }

    /* ── INVOICE TITLE ── */
    .inv-title { text-align: center; margin: 12px 0 8px; }
    .inv-title h2 { font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; }
    .inv-title .print-date { font-size: 12px; margin-top: 2px; }

     /* ── INFO BOX ── */
    .info-box { border: 1.5px solid #000000; padding: 5px 8px; margin: 10px 0 12px; width: 100%; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px; }
    .info-cell { display: flex; gap: 4px; align-items: baseline; flex-wrap: wrap; }
    .info-cell.right-align { justify-content: flex-end; text-align: right; }
    .info-lbl { white-space: nowrap; }
    .info-val { font-weight: 700; }
    .addr-block { margin-top: 4px; }
    .addr-block .info-lbl { display: block; margin-bottom: 1px; }

    /* ── TABLE ── */
    table { width: 100% !important; table-layout: fixed; border-collapse: collapse; font-size: 12.5px; margin: 12px 0 0; }
    thead th {
      border: 1.5px solid #000000; padding: 4px 3px;
      text-align: center; font-weight: 700; font-size: 12.5px;
      text-transform: uppercase;
      white-space: nowrap;
    }
    tbody td { border: 1px solid #000000; padding: 4px 3px; vertical-align: middle; word-wrap: break-word; word-break: break-word; white-space: normal; }

    /* ── SUMMARY BOX ── */
    .summary-box { border: 1.5px solid #000000; padding: 5px 8px; margin-top: 14px; width: 100%; }
    .summary-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 3px 0; font-size: 12.5px;
    }
    .summary-row + .summary-row { border-top: 1px solid #000000; }
    .summary-total {
      display: flex; justify-content: space-between; align-items: center;
      padding: 5px 0; border-top: 1.5px solid #000000; margin-top: 1px;
      font-size: 15px; font-weight: 700; text-transform: uppercase;
    }

    /* ── SIGNATURE ── */
    .sig { display: grid; grid-template-columns: 1fr 1fr; text-align: center; margin-top: 20px; gap: 10px; width: 100%; }
    .sig-col strong { display: block; font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
    .sig-col .sub-label { font-size: 11px; font-style: italic; }
    .sig-space { height: 40px; }

    /* ── FOOTER ── */
    .footer { margin-top: auto; padding-top: 10px; text-align: center; width: 100%; }
    .footer p.thanks { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; margin: 12px 0 4px; }
    .footer p.note { font-size: 11px; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #000000 !important; background: #ffffff !important; }
      * { color: #000000 !important; }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- HEADER -->
    <div class="hdr">
      <h1>${shopName}</h1>
      <div class="sub">${shopPhone ? `ĐT: ${shopPhone}` : ''}</div>
      ${shopAddress ? `<div class="sub">Địa chỉ: ${shopAddress}</div>` : ''}
    </div>
    <hr class="dash">

    <!-- INVOICE TITLE -->
    <div class="inv-title">
      <h2>Hóa Đơn Bán Hàng</h2>
      <div class="print-date">Ngày in: ${printDateTime}</div>
    </div>

    <!-- ORDER INFO BOX -->
    <div class="info-box">
      <div class="info-grid">
        <div class="info-cell"><span class="info-lbl">Mã đơn hàng:</span><span class="info-val">${o.id}</span></div>
        <div class="info-cell right-align"><span class="info-lbl">Ngày đặt:</span><span class="info-val">${o.createdAt || '—'}</span></div>
        <div class="info-cell"><span class="info-lbl">Khách hàng:</span><span class="info-val">${customerName}</span></div>
        <div class="info-cell right-align"><span class="info-lbl">Số điện thoại:</span><span class="info-val">${o.phone || '—'}</span></div>
      </div>
      ${shippingAddress ? `
      <div class="addr-block" style="margin-top: 4px; font-size: 12.5px; line-height: 1.35;">
        <span class="info-lbl" style="font-weight: normal; white-space: nowrap; display: inline;">Địa chỉ giao hàng:</span>
        <span style="font-weight: 700; word-break: break-word; white-space: normal; display: inline; margin-left: 4px;">${shippingAddress}</span>
        ${o.coordinates || o.coords || o.lat ? `
        <div style="font-size: 11px; font-style: italic; margin-top: 2px; font-weight: normal;">
          (Tọa độ: ${o.coordinates || o.coords || `${o.lat}, ${o.lng}`})
        </div>` : ''}
      </div>` : ''}
      ${o.note ? `<div class="addr-block"><span class="info-lbl">Ghi chú đơn hàng:</span><div style="margin-top:2px;font-weight:600">${o.note}</div></div>` : ''}
    </div>

    <!-- PRODUCT TABLE -->
    <table>
      <thead>
        <tr>
          <th style="width:35px">STT</th>
          <th style="text-align:center">Tên sản phẩm</th>
          <th style="width:32px">SL</th>
          <th style="width:42px">ĐVT</th>
          <th style="width:85px;text-align:center">Đơn giá</th>
          <th style="width:105px;text-align:center">Thành tiền</th>
          <th style="width:90px;text-align:center">Ghi chú</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <!-- FINANCIAL SUMMARY BOX -->
    <div class="summary-box">
      <div class="summary-row">
        <span>Tổng tiền hàng:</span>
        <strong>${subtotal.toLocaleString('vi-VN')}</strong>
      </div>
      <div class="summary-row">
        <span>Giảm giá:</span>
        <strong>${discount.toLocaleString('vi-VN')}</strong>
      </div>
      <div class="summary-row">
        <span>Phí vận chuyển:</span>
        <strong>${shipping.toLocaleString('vi-VN')}</strong>
      </div>
      <div class="summary-total">
        <span>Tổng cộng:</span>
        <span>${grandTotal.toLocaleString('vi-VN')} đ</span>
      </div>
    </div>

    <!-- SIGNATURE SECTION -->
    <div class="sig">
      <div class="sig-col">
        <strong>Người mua hàng</strong>
        <span class="sub-label">(Ký, ghi rõ họ tên)</span>
        <div class="sig-space"></div>
      </div>
      <div class="sig-col">
        <strong>Người bán hàng</strong>
        <span class="sub-label">(Ký, ghi rõ họ tên)</span>
        <div class="sig-space"></div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <hr class="dash">
      <p class="thanks">Cảm ơn quý khách đã tin tưởng và mua hàng!</p>
      <p class="note">Vui lòng giữ hóa đơn để đổi/trả hàng trong vòng <strong>7 ngày</strong> kể từ ngày mua.</p>
    </div>
  </div>

  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body></html>`;

  const win = window.open('', '_blank', 'width=860,height=1100');
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
document.addEventListener('paste', function (e) {
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

    const invoiceNumStripped = inv.invoiceNumber ? String(inv.invoiceNumber).replace(/^0+/, '') : '';
    const serialStr = inv.serial || '';
    const documentNumber = invoiceNumStripped ? (invoiceNumStripped + serialStr) : (serialStr || 'Invoice');

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
          <div><strong>Số chứng từ nhập kho:</strong> <code style="font-weight: 700; color: #dc2626; font-size: 0.9rem;">${documentNumber}</code></div>
          <div><strong>Ký hiệu (Serial):</strong> ${inv.serial || 'N/A'}</div>
          <div><strong>Số hóa đơn (Số HĐ):</strong> ${inv.invoiceNumber || 'N/A'}</div>
          <div><strong>Mã thuế/Cơ quan thuế:</strong> ${inv.taxCode || 'N/A'}</div>
          <div><strong>Ngày hóa đơn:</strong> ${dateStr}</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 0.9rem; font-weight: 600; color: black;">Danh sách sản phẩm</span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary btn-sm btn-save-invoice-db" onclick="saveInvoiceToInventory(this, ${index})">
            <i class="fa-solid fa-download"></i> Lưu vào Nhập kho
          </button>
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
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 20px 0;">Chưa có dữ liệu nhà cung cấp.</td></tr>`;
      return;
    }

    suppliers = data; // Store globally

    tbody.innerHTML = data.map(s => `
      <tr>
        <td><code style="font-size: .85rem; background: var(--bg); padding: 2px 6px; border-radius: 4px;">${s.code || ''}</code></td>
        <td style="font-weight: 500;">${s.name || ''}</td>
        <td>${s.phone || '-'}</td>
        <td><span class="badge ${s.status === 'Ngỳnh theo dõi' || s.status === 'Ngừng theo dõi' ? 'badge-red' : 'badge-green'}">${s.status || 'Đang theo dõi'}</span></td>
        <td style="text-align:center;">
          <button class="p-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors bg-white cursor-pointer" onclick="openEditSupplierModal('${(s.code||'').replace(/'/g,"\\'")}')" title="Sửa thông tin">
            <i class="fa-solid fa-pen"></i>
          </button>
        </td>
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

async function saveInvoiceToInventory(btn, index) {
  const inv = parsedInvoicesList[index];
  if (!inv) {
    showToast('<i class="fa-solid fa-xmark"></i> Không tìm thấy dữ liệu hóa đơn.', 'error');
    return;
  }

  const originalHTML = btn.innerHTML;
  btn.setAttribute('disabled', 'true');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

  try {
    const res = await adminFetch('/api/admin/inventory/save-from-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ invoiceData: inv })
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 409 || data.isDuplicate) {
      showToast('<i class="fa-solid fa-triangle-exclamation"></i> Hóa đơn đã tồn tại trong hệ thống, không thể lưu trùng!', 'error');
      btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Đã tồn tại (Không thể lưu trùng)';
      btn.setAttribute('disabled', 'true');
      btn.style.backgroundColor = '#ef4444';
      btn.style.borderColor = '#ef4444';
      btn.style.color = '#ffffff';
      return;
    }

    if (!res.ok || !(data.ok || data.success)) {
      throw new Error(data.message || 'Lỗi lưu phiếu nhập kho từ hóa đơn.');
    }

    showToast('<i class="fa-solid fa-circle-check"></i> Lưu phiếu nhập kho thành công! <a href="#" onclick="openInventoryReceiptDetail(' + data.receiptId + '); return false;" style="color: #60a5fa; text-decoration: underline; margin-left: 8px; font-weight: bold;">Xem chi tiết</a>', 'success');
    btn.innerHTML = '<i class="fa-solid fa-eye"></i> Xem chi tiết phiếu';
    btn.removeAttribute('disabled');
    btn.onclick = () => openInventoryReceiptDetail(data.receiptId);
    btn.style.backgroundColor = '#10b981';
    btn.style.borderColor = '#10b981';
    btn.style.color = '#ffffff';
  } catch (err) {
    console.error(err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
    btn.removeAttribute('disabled');
    btn.innerHTML = originalHTML;
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

  if (tabName === 'footer-settings') {
    loadSettingsForm();
  }
}

// =====================================================================
// INVENTORY STOCK INFLOW FRONTEND LOGIC
// =====================================================================

function switchProductSubTab(tabName, btn) {
  document.querySelectorAll('.product-sub-tab-btn').forEach(b => {
    b.classList.remove('btn-primary');
    b.classList.add('btn-outline');
    b.style.color = 'black';
  });
  if (btn) {
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-primary');
    btn.style.color = '';
  }

  ['list', 'import'].forEach(name => {
    const el = document.getElementById(`product-sub-tab-${name}`);
    if (el) el.style.display = name === tabName ? 'block' : 'none';
  });
}

let currentParsedReceipt = null;

function switchInventoryTab(tabName, btn) {
  document.querySelectorAll('.inventory-tab-btn').forEach(b => {
    b.classList.remove('btn-primary');
    b.classList.add('btn-outline');
    b.style.color = 'black';
  });
  if (btn) {
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-primary');
    btn.style.color = '';
  }

  document.querySelectorAll('.inventory-tab-content').forEach(content => {
    content.style.display = 'none';
  });
  const activeContent = document.getElementById(`inventory-tab-${tabName}`);
  if (activeContent) {
    activeContent.style.display = 'block';
  }
}

let allInventoryReceipts = [];

async function loadInventoryHistory() {
  const tbody = document.getElementById('inventoryHistoryTableBody');
  tbody.innerHTML = `
    <tr>
      <td colspan="8" style="text-align: center; color: var(--muted); padding: 20px 0;">
        <i class="fa-solid fa-spinner fa-spin"></i> Đang tải lịch sử nhập kho...
      </td>
    </tr>
  `;

  try {
    const res = await adminFetch('/api/admin/inventory/receipts');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allInventoryReceipts = await res.json();

    filterInventoryHistory();

  } catch (err) {
    console.error('Lỗi khi tải lịch sử nhập kho:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--danger); padding: 20px 0;">
          <i class="fa-solid fa-circle-exclamation"></i> Không thể tải dữ liệu: ${err.message}
        </td>
      </tr>
    `;
  }
}

function handleTimePresetChange() {
  inventoryPage = 1;
  const preset = document.getElementById('inventoryTimePresetFilter').value;
  const customEl = document.getElementById('inventoryCustomDateRange');
  if (customEl) {
    customEl.style.display = preset === 'custom' ? 'flex' : 'none';
  }
  filterInventoryHistory();
}

let selectedInventoryIds = [];

function toggleSelectAllInventoryReceipts(selectAllCheckbox) {
  const rowCheckboxes = document.querySelectorAll('.inventory-row-checkbox');
  rowCheckboxes.forEach(cb => {
    cb.checked = selectAllCheckbox.checked;
    const id = parseInt(cb.value);
    if (selectAllCheckbox.checked) {
      if (!selectedInventoryIds.includes(id)) {
        selectedInventoryIds.push(id);
      }
    } else {
      selectedInventoryIds = selectedInventoryIds.filter(item => item !== id);
    }
  });
  updateSelectedInventoryCount();
}

function updateSelectedInventoryCount() {
  const allRowCheckboxes = document.querySelectorAll('.inventory-row-checkbox');
  
  const selectAllCheckbox = document.getElementById('inventorySelectAllCheckbox');
  if (selectAllCheckbox) {
    const checkedCount = Array.from(allRowCheckboxes).filter(cb => cb.checked).length;
    selectAllCheckbox.checked = allRowCheckboxes.length > 0 && checkedCount === allRowCheckboxes.length;
  }
  
  allRowCheckboxes.forEach(cb => {
    const id = parseInt(cb.value);
    if (cb.checked) {
      if (!selectedInventoryIds.includes(id)) selectedInventoryIds.push(id);
    } else {
      selectedInventoryIds = selectedInventoryIds.filter(item => item !== id);
    }
  });
  
  const selectedCountSpan = document.getElementById('inventorySelectedCount');
  if (selectedCountSpan) {
    selectedCountSpan.textContent = selectedInventoryIds.length;
  }
  
  const bulkDeleteBtn = document.getElementById('inventoryBulkDeleteBtn');
  if (bulkDeleteBtn) {
    if (selectedInventoryIds.length > 0) {
      bulkDeleteBtn.removeAttribute('disabled');
      bulkDeleteBtn.style.opacity = '1';
      bulkDeleteBtn.style.cursor = 'pointer';
    } else {
      bulkDeleteBtn.setAttribute('disabled', 'true');
      bulkDeleteBtn.style.opacity = '0.5';
      bulkDeleteBtn.style.cursor = 'not-allowed';
    }
  }
}

async function deleteSelectedInventoryReceipts() {
  if (selectedInventoryIds.length === 0) return;
  if (!confirm(`Bạn có chắc chắn muốn xóa ${selectedInventoryIds.length} chứng từ đã chọn? Hành động này không thể hoàn tác.`)) {
    return;
  }
  
  const bulkDeleteBtn = document.getElementById('inventoryBulkDeleteBtn');
  const originalHTML = bulkDeleteBtn.innerHTML;
  bulkDeleteBtn.disabled = true;
  bulkDeleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';
  
  let deletedCount = 0;
  let errorCount = 0;
  
  try {
    for (const id of selectedInventoryIds) {
      try {
        const res = await adminFetch(`/api/admin/inventory/receipts/${id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          deletedCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
      }
    }
    
    if (deletedCount > 0) {
      showToast(`<i class="fa-solid fa-circle-check"></i> Đã xóa ${deletedCount} chứng từ thành công!`, 'success');
    }
    if (errorCount > 0) {
      showToast(`<i class="fa-solid fa-xmark"></i> Lỗi khi xóa ${errorCount} chứng từ.`, 'error');
    }
    
    selectedInventoryIds = [];
    loadInventoryHistory();
  } catch (err) {
    console.error('Lỗi khi xóa hàng loạt:', err);
    showToast('<i class="fa-solid fa-xmark"></i> Có lỗi xảy ra trong quá trình xóa.', 'error');
  } finally {
    bulkDeleteBtn.disabled = false;
    bulkDeleteBtn.innerHTML = originalHTML;
    updateSelectedInventoryCount();
  }
}

function changeInventoryPageSize(size) {
  INVENTORY_PER_PAGE = parseInt(size) || 20;
  inventoryPage = 1;
  filterInventoryHistory();
}

function resetInventorySummary() {
  const tfoot = document.getElementById('inventoryHistoryTableFoot');
  if (tfoot) {
    tfoot.innerHTML = `
      <tr style="background: var(--bg); border-top: 2px solid var(--border);">
        <td colspan="5" style="padding: 10px 12px; font-weight: 600; font-size: .875rem;">
          <i class="fa-solid fa-sigma"></i> Tổng cộng (0 phiếu)
        </td>
        <td colspan="3" style="padding: 10px 12px; font-weight: 700; color: var(--danger); font-size: 1rem;">0₫</td>
      </tr>
    `;
  }
  const countElTop = document.getElementById('inventorySummaryCountTop');
  const totalElTop = document.getElementById('inventorySummaryTotalTop');
  if (countElTop && totalElTop) {
    countElTop.textContent = '0';
    totalElTop.textContent = '0₫';
  }
  
  selectedInventoryIds = [];
  const selectAllCheckbox = document.getElementById('inventorySelectAllCheckbox');
  if (selectAllCheckbox) selectAllCheckbox.checked = false;
  const selectedCountSpan = document.getElementById('inventorySelectedCount');
  if (selectedCountSpan) selectedCountSpan.textContent = '0';
  const totalCountSpan = document.getElementById('inventoryTotalCount');
  if (totalCountSpan) totalCountSpan.textContent = '0';
  const bulkDeleteBtn = document.getElementById('inventoryBulkDeleteBtn');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.setAttribute('disabled', 'true');
    bulkDeleteBtn.style.opacity = '0.5';
    bulkDeleteBtn.style.cursor = 'not-allowed';
  }
}

function filterInventoryHistory() {
  const tbody = document.getElementById('inventoryHistoryTableBody');
  if (!allInventoryReceipts || allInventoryReceipts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--muted); padding: 20px 0;">
          Chưa có chứng từ nhập kho nào được lưu.
        </td>
      </tr>
    `;
    const pagEl = document.getElementById('inventoryPagination');
    if (pagEl) pagEl.innerHTML = '';
    const infoEl = document.getElementById('inventoryPaginationInfo');
    if (infoEl) infoEl.innerHTML = '';
    resetInventorySummary();
    return;
  }

  // Parse receipt date helper
  const getReceiptDate = (r) => {
    const parts = String(r.import_date || '').split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
    return r.created_at ? new Date(r.created_at) : new Date(0);
  };

  const preset = document.getElementById('inventoryTimePresetFilter').value;
  const query = document.getElementById('inventorySearchFilter').value.toLowerCase().trim();

  let startLimit = null;
  let endLimit = null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (preset === 'today') {
    startLimit = todayStart;
    endLimit = todayEnd;
  } else if (preset === 'yesterday') {
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    startLimit = yesterday;
    const yesterdayEnd = new Date(todayEnd);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    endLimit = yesterdayEnd;
  } else if (preset === '7days') {
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    startLimit = sevenDaysAgo;
    endLimit = todayEnd;
  } else if (preset === '30days') {
    const thirtyDaysAgo = new Date(todayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    startLimit = thirtyDaysAgo;
    endLimit = todayEnd;
  } else if (preset === 'thisMonth') {
    startLimit = new Date(now.getFullYear(), now.getMonth(), 1);
    endLimit = todayEnd;
  } else if (preset === 'lastMonth') {
    startLimit = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endLimit = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (preset === 'thisYear') {
    startLimit = new Date(now.getFullYear(), 0, 1);
    endLimit = todayEnd;
  } else if (preset === 'custom') {
    const startVal = document.getElementById('inventoryStartDate').value;
    const endVal = document.getElementById('inventoryEndDate').value;
    if (startVal) startLimit = new Date(startVal + 'T00:00:00');
    if (endVal) endLimit = new Date(endVal + 'T23:59:59.999');
  }

  const filtered = allInventoryReceipts.filter(r => {
    const matchQuery = !query ||
      String(r.receipt_code || '').toLowerCase().includes(query) ||
      String(r.supplier_name || '').toLowerCase().includes(query) ||
      String(r.note || '').toLowerCase().includes(query);

    if (!matchQuery) return false;

    if (preset === 'all') return true;

    const rDate = getReceiptDate(r);
    const matchDate = (!startLimit || rDate >= startLimit) && (!endLimit || rDate <= endLimit);
    return matchDate;
  });

  filtered.sort((a, b) => getReceiptDate(b) - getReceiptDate(a));

  const total = filtered.length;
  const pages = Math.ceil(total / INVENTORY_PER_PAGE);
  if (inventoryPage > pages) inventoryPage = Math.max(1, pages);
  const paged = filtered.slice((inventoryPage - 1) * INVENTORY_PER_PAGE, inventoryPage * INVENTORY_PER_PAGE);

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--muted); padding: 20px 0;">
          Không tìm thấy chứng từ nhập kho nào khớp với bộ lọc.
        </td>
      </tr>
    `;
    const pagEl = document.getElementById('inventoryPagination');
    if (pagEl) pagEl.innerHTML = '';
    const infoEl = document.getElementById('inventoryPaginationInfo');
    if (infoEl) infoEl.innerHTML = '';
    resetInventorySummary();
    return;
  }

  // Clear selections for new page/filter render
  selectedInventoryIds = [];
  const selectAllCheckbox = document.getElementById('inventorySelectAllCheckbox');
  if (selectAllCheckbox) selectAllCheckbox.checked = false;
  const selectedCountSpan = document.getElementById('inventorySelectedCount');
  if (selectedCountSpan) selectedCountSpan.textContent = '0';
  const totalCountSpan = document.getElementById('inventoryTotalCount');
  if (totalCountSpan) totalCountSpan.textContent = total;
  const bulkDeleteBtn = document.getElementById('inventoryBulkDeleteBtn');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.setAttribute('disabled', 'true');
    bulkDeleteBtn.style.opacity = '0.5';
    bulkDeleteBtn.style.cursor = 'not-allowed';
  }

  tbody.innerHTML = paged.map(r => {
    const formattedDate = r.import_date || (r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : 'N/A');
    return `
      <tr class="hover:bg-gray-50 border-b border-gray-100">
        <td class="w-12 px-4 py-3 text-center">
          <input type="checkbox" class="inventory-row-checkbox w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" value="${r.id}" onchange="updateSelectedInventoryCount()" />
        </td>
        <td class="py-3 px-4 font-medium text-gray-900">${r.receipt_code}</td>
        <td class="py-3 px-4 text-gray-600">${formattedDate}</td>
        <td class="py-3 px-4 text-sm font-normal text-gray-800 uppercase">${r.supplier_name || 'N/A'}</td>
        <td class="py-3 px-4 text-gray-600">${r.warehouse_name || 'N/A'}</td>
        <td class="py-3 px-4"><span class="text-red-600 font-semibold">${formatPrice(r.total_amount)}</span></td>
        <td class="py-3 px-4"><span class="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full text-xs font-semibold inline-block">${r.item_count} mặt hàng</span></td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-1.5">
            <button class="p-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors bg-white cursor-pointer" onclick="openInventoryReceiptDetail(${r.id})" title="Xem chi tiết">
              <i class="fa-solid fa-eye text-xs"></i>
            </button>
            <button class="p-1.5 border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-50 transition-colors bg-white cursor-pointer" onclick="editStockReceipt(${r.id})" title="Sửa chứng từ">
              <i class="fa-solid fa-pen text-xs"></i>
            </button>
            <button class="p-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors bg-white cursor-pointer" onclick="deleteInventoryReceipt(${r.id})" title="Xóa chứng từ">
              <i class="fa-solid fa-trash text-xs"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const grandTotal = filtered.reduce((sum, r) => sum + (r.total_amount || 0), 0);
  const tfoot = document.getElementById('inventoryHistoryTableFoot');
  if (tfoot) {
    tfoot.innerHTML = `
      <tr style="background: var(--bg); border-top: 2px solid var(--border);">
        <td colspan="5" style="padding: 12px; font-weight: 600; font-size: .875rem; text-align: left; color: var(--text);">
          <i class="fa-solid fa-sigma"></i> Tổng cộng (${total} phiếu)
        </td>
        <td colspan="3" style="padding: 12px; font-weight: 700; color: var(--danger); font-size: 1.05rem; text-align: left;">
          ${formatPrice(grandTotal)}
        </td>
      </tr>
    `;
  }

  const countElTop = document.getElementById('inventorySummaryCountTop');
  const totalElTop = document.getElementById('inventorySummaryTotalTop');
  if (countElTop && totalElTop) {
    countElTop.textContent = total;
    totalElTop.textContent = formatPrice(grandTotal);
  }

  // Render pagination
  renderPagination(pages, inventoryPage, 'inventoryPagination', (p) => { inventoryPage = p; filterInventoryHistory(); });

  const infoEl = document.getElementById('inventoryPaginationInfo');
  if (infoEl && total > 0) {
    const start = (inventoryPage - 1) * INVENTORY_PER_PAGE + 1;
    const end = Math.min(inventoryPage * INVENTORY_PER_PAGE, total);
    infoEl.innerHTML = `Hiển thị <strong>${start} – ${end}</strong> của <strong>${total}</strong> phiếu`;
  } else if (infoEl) {
    infoEl.innerHTML = '';
  }
}

async function openInventoryReceiptDetail(id) {
  const detailBody = document.getElementById('inventoryReceiptDetailBody');
  detailBody.innerHTML = `
    <div style="text-align: center; padding: 40px 0; color: var(--muted);">
      <i class="fa-solid fa-spinner fa-spin fa-2x"></i> <br> Đang tải thông tin chi tiết...
    </div>
  `;
  document.getElementById('inventoryReceiptModal').classList.add('open');

  try {
    const res = await adminFetch(`/api/admin/inventory/receipts/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.ok || !data.receipt) {
      throw new Error(data.message || 'Không có dữ liệu');
    }

    const { receipt, items } = data;
    const fileDate = receipt.import_date || 'N/A';
    const systemDate = receipt.created_at ? new Date(receipt.created_at).toLocaleString('vi-VN') : 'N/A';

    // Tính tổng tiền hàng (chưa thuế), tổng thuế, tổng thanh toán (có thuế)
    let totalBeforeTax = 0;
    let totalTax = 0;
    items.forEach(item => {
      const amount = Number(item.total_price || 0);
      const taxRate = Number(item.tax_rate || 0);
      totalBeforeTax += amount;
      totalTax += Math.round(amount * taxRate / 100);
    });
    const totalWithTax = totalBeforeTax + totalTax;

    let itemsHtml = items.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><code>${item.product_sku}</code></td>
        <td style="white-space: normal; min-width: 220px; max-width: 450px; word-break: break-word;">${item.product_name}</td>
        <td><span class="badge">${item.unit || 'Cái'}</span></td>
        <td style="text-align: right;">${item.quantity.toLocaleString('vi-VN')}</td>
        <td style="text-align: right;">${formatPrice(item.unit_price)}</td>
        <td style="text-align: right;">${item.tax_rate}%</td>
        <td style="text-align: right;"><strong style="color: var(--text);">${formatPrice(item.total_price)}</strong></td>
      </tr>
    `).join('');

    detailBody.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; padding: 16px; background: var(--bg); border-radius: 8px; border: 1px solid var(--border);">
        <div><strong>Mã chứng từ:</strong> <span>${receipt.receipt_code}</span></div>
        <div><strong>Ngày nhập:</strong> <span>${fileDate}</span></div>
        <div><strong>Ngày tạo (hệ thống):</strong> <span>${systemDate}</span></div>
        <div><strong>Nhà cung cấp:</strong> <span>${receipt.supplier_name || 'N/A'}</span></div>
        <div><strong>Kho nhập:</strong> <span>${receipt.warehouse_name || 'N/A'}</span></div>
        <div>
          <div style="font-size: 0.82rem; color: var(--muted); margin-bottom: 2px;">Tổng tiền hàng (chưa thuế): <strong>${formatPrice(totalBeforeTax)}</strong></div>
          <div style="font-size: 0.82rem; color: var(--muted); margin-bottom: 4px;">Tổng thuế GTGT: <strong>${formatPrice(totalTax)}</strong></div>
          <div><strong>Tổng tiền thanh toán:</strong> <strong style="color: var(--danger);">${formatPrice(totalWithTax)}</strong></div>
        </div>
        <div style="grid-column: 1 / -1;"><strong>Diễn giải:</strong> <span>${receipt.note || 'N/A'}</span></div>
      </div>

      <h4 style="margin-bottom: 12px; font-size: 1rem;"><i class="fa-solid fa-boxes-stacked"></i> Danh sách mặt hàng</h4>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã SKU</th>
              <th>Tên hàng hóa</th>
              <th>ĐVT</th>
              <th style="text-align: right;">Số lượng</th>
              <th style="text-align: right;">Đơn giá</th>
              <th style="text-align: right;">Thuế suất</th>
              <th style="text-align: right;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr style="background: var(--bg);">
              <td colspan="7" style="text-align: right; padding: 8px 10px; font-size: 0.85rem; color: var(--muted);">Tổng tiền hàng (chưa thuế):</td>
              <td style="text-align: right; padding: 8px 10px; font-size: 0.85rem; font-weight: 600;">${formatPrice(totalBeforeTax)}</td>
            </tr>
            <tr style="background: var(--bg);">
              <td colspan="7" style="text-align: right; padding: 4px 10px; font-size: 0.85rem; color: var(--muted);">Tổng thuế GTGT:</td>
              <td style="text-align: right; padding: 4px 10px; font-size: 0.85rem; font-weight: 600;">${formatPrice(totalTax)}</td>
            </tr>
            <tr style="border-top: 2px solid var(--border);">
              <td colspan="7" style="text-align: right; padding: 10px; font-weight: 700; color: var(--danger);">Tổng tiền thanh toán (gồm thuế):</td>
              <td style="text-align: right; padding: 10px; font-weight: 700; color: var(--danger); font-size: 1.05rem;">${formatPrice(totalWithTax)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

  } catch (err) {
    console.error('Lỗi khi tải chi tiết phiếu nhập:', err);
    detailBody.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--danger);">
        <i class="fa-solid fa-triangle-exclamation fa-2x"></i> <br>
        Không thể tải chi tiết phiếu nhập: ${err.message}
      </div>
    `;
  }
}

// Drag & drop handlers for inventory import
function handleInventoryDragOver(e) {
  e.preventDefault();
  document.getElementById('inventoryUploadZone').classList.add('dragover');
}

function handleInventoryDragLeave(e) {
  e.preventDefault();
  document.getElementById('inventoryUploadZone').classList.remove('dragover');
}

function handleInventoryDrop(e) {
  e.preventDefault();
  document.getElementById('inventoryUploadZone').classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files && files[0]) {
    uploadInventoryExcel(files[0]);
  }
}

function handleInventoryFileSelect(e) {
  const files = e.target.files;
  if (files && files[0]) {
    uploadInventoryExcel(files[0]);
  }
}

async function uploadInventoryExcel(file) {
  const statusDiv = document.getElementById('inventoryUploadStatus');
  const statusText = document.getElementById('inventoryStatusText');
  const previewContainer = document.getElementById('inventoryPreviewContainer');

  statusDiv.style.display = 'block';
  statusText.innerHTML = `Đang phân tích file <code>${file.name}</code>...`;
  previewContainer.style.display = 'none';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await adminFetch('/api/admin/inventory/import-receipt', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'Lỗi không rõ khi xử lý file.');
    }

    currentParsedReceipt = data;
    renderStockReceiptPreview(data);
    showToast('<i class="fa-solid fa-circle-check"></i> Đọc dữ liệu file Excel thành công!', 'success');

  } catch (err) {
    console.error('Lỗi upload/parse Excel:', err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
  } finally {
    statusDiv.style.display = 'none';
    document.getElementById('inventoryExcelInput').value = '';
  }
}

function renderStockReceiptPreview(data) {
  const receipts = data.receipts || [{ receipt: data.receipt, items: data.items, sheet_name: '' }];
  const multiSheet = receipts.length > 1;

  // Update header card (first sheet preview metadata)
  const first = receipts[0];
  document.getElementById('prevReceiptCode').textContent = multiSheet
    ? `${first.receipt.receipt_code} (+${receipts.length - 1} phiếu khác)`
    : first.receipt.receipt_code;
  document.getElementById('prevImportDate').textContent = first.receipt.import_date;
  document.getElementById('prevSupplierName').textContent = first.receipt.supplier_name;
  document.getElementById('prevWarehouseName').textContent = first.receipt.warehouse_name;
  document.getElementById('prevTotalAmount').textContent = formatPrice(
    receipts.reduce((sum, r) => sum + (r.receipt.total_amount || 0), 0)
  );
  document.getElementById('prevNote').textContent = first.receipt.note || '(Trống)';

  // Render items — all sheets combined into one table, with sheet separator rows
  const tbody = document.getElementById('inventoryPreviewTableBody');
  let allRows = '';
  for (const parsed of receipts) {
    if (multiSheet) {
      allRows += `
        <tr style="background: var(--bg); border-top: 2px solid var(--border);">
          <td colspan="8" style="padding: 8px 12px; font-weight: 600; color: var(--primary); font-size: .85rem;">
            <i class="fa-solid fa-table-columns"></i>
            Sheet: <code>${parsed.sheet_name}</code>
            &mdash; Mã chứng từ: <code>${parsed.receipt.receipt_code}</code>
            &mdash; Ngày: ${parsed.receipt.import_date}
            &mdash; Tổng: <strong style="color:var(--danger)">${formatPrice(parsed.receipt.total_amount)}</strong>
          </td>
        </tr>
      `;
    }
    for (const item of parsed.items) {
      let statusBadge = item.system_match
        ? `<span class="badge badge-green" style="font-size: 0.75rem;">Khớp hệ thống (Tồn: ${item.current_stock}, Giá vốn: ${formatPrice(item.current_cost)})</span>`
        : `<span class="badge badge-yellow" style="font-size: 0.75rem;">Sản phẩm mới (Không khớp SKU)</span>`;
      allRows += `
        <tr>
          <td><code>${item.product_sku || 'N/A'}</code></td>
          <td><strong>${item.product_name}</strong></td>
          <td><span class="badge">${item.unit || 'Cái'}</span></td>
          <td>${item.quantity.toLocaleString('vi-VN')}</td>
          <td>${formatPrice(item.unit_price)}</td>
          <td>${item.tax_rate}%</td>
          <td><strong style="color: var(--text);">${formatPrice(item.total_price)}</strong></td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }
  }
  tbody.innerHTML = allRows;

  document.getElementById('inventoryPreviewContainer').style.display = 'block';
}

async function saveStockReceipt() {
  if (!currentParsedReceipt) return;

  const btn = document.querySelector('#inventoryPreviewContainer button');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

  const receiptsToSave = currentParsedReceipt.receipts
    || [{ receipt: currentParsedReceipt.receipt, items: currentParsedReceipt.items }];

  let savedCount = 0;
  let lastSavedReceiptId = null;
  const skippedDuplicates = [];
  const errors = [];

  try {
    for (const parsed of receiptsToSave) {
      try {
        const res = await adminFetch('/api/admin/inventory/save-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receipt: parsed.receipt, items: parsed.items })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          if (data.message && data.message.includes('đã tồn tại')) {
            skippedDuplicates.push(parsed.receipt.receipt_code);
          } else {
            errors.push(`${parsed.receipt.receipt_code}: ${data.message}`);
          }
        } else {
          savedCount++;
          lastSavedReceiptId = data.receiptId;
        }
      } catch (innerErr) {
        errors.push(`${parsed.receipt.receipt_code}: ${innerErr.message}`);
      }
    }

    if (savedCount > 0) {
      let msg = `<i class="fa-solid fa-circle-check"></i> Đã lưu ${savedCount} phiếu nhập kho thành công!`;
      if (savedCount === 1 && lastSavedReceiptId) {
        msg += ` <a href="#" onclick="openInventoryReceiptDetail(${lastSavedReceiptId}); return false;" style="color: #60a5fa; text-decoration: underline; margin-left: 8px; font-weight: bold;">Xem chi tiết</a>`;
      }
      if (skippedDuplicates.length > 0) msg += ` (Bỏ qua ${skippedDuplicates.length} mã trùng: ${skippedDuplicates.join(', ')})`;
      showToast(msg, 'success');
    } else if (skippedDuplicates.length > 0 && errors.length === 0) {
      showToast(`<i class="fa-solid fa-triangle-exclamation"></i> Tất cả phiếu đã tồn tại: ${skippedDuplicates.join(', ')}`, 'error');
    } else {
      throw new Error(errors[0] || 'Lỗi không xác định');
    }

    // Clear preview and switch to history
    currentParsedReceipt = null;
    document.getElementById('inventoryPreviewContainer').style.display = 'none';

    switchInventoryTab('history', document.querySelector('.inventory-tab-btn'));
    loadInventoryHistory();

    // Refresh products list in dashboard / product manager
    await loadProducts();
    if (typeof renderAdminTable === 'function') renderAdminTable();

  } catch (err) {
    console.error('Lỗi khi lưu phiếu nhập kho:', err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function deleteInventoryReceipt(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa chứng từ nhập kho này? Hành động này không thể hoàn tác.')) {
    return;
  }

  try {
    const res = await adminFetch(`/api/admin/inventory/receipts/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'Lỗi khi xóa chứng từ.');
    }

    showToast('<i class="fa-solid fa-circle-check"></i> Đã xóa chứng từ nhập kho thành công!', 'success');
    loadInventoryHistory();

  } catch (err) {
    console.error('Lỗi khi xóa chứng từ:', err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
  }
}

function toggleSidebar() {
  const layout = document.querySelector('.admin-layout');
  if (!layout) return;
  const isCollapsed = layout.classList.toggle('sidebar-collapsed');
  localStorage.setItem('adminSidebarCollapsed', isCollapsed ? 'true' : 'false');
}

function initSidebarState() {
  const layout = document.querySelector('.admin-layout');
  if (!layout) return;
  const isCollapsed = localStorage.getItem('adminSidebarCollapsed') === 'true';
  if (isCollapsed) {
    layout.classList.add('sidebar-collapsed');
  } else {
    layout.classList.remove('sidebar-collapsed');
  }
}

// =====================================================================
// ADMIN MANUAL ORDER CREATION LOGIC
// =====================================================================
let manualOrderItems = [];
let ocCatalogPage = 1;
const ocCatalogPageSize = 12;

function createOrderFromExisting(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  // Pre-fill customer info from the old order
  document.getElementById('oc_customer').value = o.customer || '';
  document.getElementById('oc_phone').value = o.phone || '';
  document.getElementById('oc_address').value = o.address || '';
  document.getElementById('oc_note').value = o.note || '';
  document.getElementById('oc_productSearch').value = '';
  document.getElementById('oc_shippingFee').value = o.shippingFee || o.shipping || '0';
  document.getElementById('oc_status').value = 'Đã xác nhận';

  // Pre-fill items from old order, preserving notes
  manualOrderItems = (o.items || []).map(item => ({
    ma: item.ma,
    ten: item.ten,
    donvi: item.donvi || 'Cái',
    qty: Number(item.qty) || 1,
    gia: Number(item.gia) || 0,
    image: item.image,
    note: item.note || ''
  }));

  ocCatalogPage = 1;

  const catSelect = document.getElementById('oc_categoryFilter');
  if (catSelect) {
    catSelect.innerHTML = '<option value="">Danh mục</option>';
    const categories = [...new Set(products.map(p => p.loai).filter(Boolean))];
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      catSelect.appendChild(opt);
    });
  }

  const stockSelect = document.getElementById('oc_stockFilter');
  if (stockSelect) stockSelect.value = '';

  searchProductsForOrderCreation('');
  renderManualOrderItems();

  document.getElementById('orderCreateModal').classList.add('open');
}

function showCreateOrderModal() {
  document.getElementById('oc_customer').value = '';
  document.getElementById('oc_phone').value = '';
  document.getElementById('oc_address').value = '';
  document.getElementById('oc_note').value = '';
  document.getElementById('oc_productSearch').value = '';
  document.getElementById('oc_shippingFee').value = '0';
  document.getElementById('oc_status').value = 'Đã xác nhận';
  manualOrderItems = [];
  ocCatalogPage = 1;

  // Populate Category filter dropdown dynamically
  const catSelect = document.getElementById('oc_categoryFilter');
  if (catSelect) {
    catSelect.innerHTML = '<option value="">Danh mục</option>';
    const categories = [...new Set(products.map(p => p.loai).filter(Boolean))];
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      catSelect.appendChild(opt);
    });
  }

  // Reset stock filter dropdown
  const stockSelect = document.getElementById('oc_stockFilter');
  if (stockSelect) stockSelect.value = '';

  // Hiển thị catalog sản phẩm đầy đủ ban đầu
  searchProductsForOrderCreation('');
  renderManualOrderItems();

  document.getElementById('orderCreateModal').classList.add('open');
}

function filterCatalogForOrderCreation() {
  ocCatalogPage = 1;
  const query = document.getElementById('oc_productSearch').value;
  searchProductsForOrderCreation(query);
}

function searchProductsForOrderCreation(query) {
  const catalogGrid = document.getElementById('oc_catalogGrid');
  const q = String(query || '').trim().toLowerCase();

  const catFilter = document.getElementById('oc_categoryFilter')?.value || '';
  const stockFilter = document.getElementById('oc_stockFilter')?.value || '';

  let matches = products.filter(p => p.trangthai !== 'Ngừng theo dõi');

  if (catFilter) {
    matches = matches.filter(p => p.loai === catFilter);
  }

  if (stockFilter) {
    if (stockFilter === 'in_stock') {
      matches = matches.filter(p => p.stock !== undefined && p.stock !== null && parseFloat(p.stock) > 0);
    } else if (stockFilter === 'out_of_stock') {
      matches = matches.filter(p => p.stock === undefined || p.stock === null || parseFloat(p.stock) <= 0);
    }
  }

  if (q) {
    matches = matches.filter(p => {
      const ma = String(p.ma || '').toLowerCase();
      const ten = String(p.ten || '').toLowerCase();
      return ma.includes(q) || ten.includes(q);
    });
  }

  // Pagination
  const totalPages = Math.ceil(matches.length / ocCatalogPageSize) || 1;
  if (ocCatalogPage > totalPages) ocCatalogPage = totalPages;
  if (ocCatalogPage < 1) ocCatalogPage = 1;

  const startIdx = (ocCatalogPage - 1) * ocCatalogPageSize;
  const displayList = matches.slice(startIdx, startIdx + ocCatalogPageSize);

  if (displayList.length === 0) {
    catalogGrid.innerHTML = `
      <div style="grid-column: span 2; text-align: center; color: var(--muted); padding: 40px; font-size: 0.85rem;">
        <i class="fa-solid fa-box-open fa-2x" style="margin-bottom: 8px; display: block; color: #cbd5e1;"></i>
        Không tìm thấy sản phẩm nào phù hợp
      </div>
    `;
    renderCatalogPagination(totalPages);
    return;
  }

  catalogGrid.innerHTML = displayList.map(p => {
    const isOutOfStock = (p.stock === undefined || p.stock === null || parseFloat(p.stock) <= 0);
    const hasImage = !!p.image;

    return `
      <div class="oc-catalog-card" style="border: 1px solid var(--border); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: box-shadow 0.2s;">
        <!-- Product Image -->
        <div style="height: 90px; background: #f8fafc; border-radius: 6px; border: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
          ${hasImage
        ? `<img src="${getProductImageUrl(p)}" style="width: 100%; height: 100%; object-fit: contain; padding: 4px;" onerror="this.parentNode.innerHTML='<i class=\\'fa-solid fa-box fa-xl\\' style=\\'color:#cbd5e1;\\'></i>'" />`
        : `<i class="fa-solid fa-box fa-xl" style="color: #cbd5e1;"></i>`
      }
        </div>
        
        <!-- SKU Code -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.65rem; color: var(--muted); font-family: monospace; background: var(--bg); padding: 1px 6px; border-radius: 4px; display: inline-block;">${p.ma}</span>
        </div>
        
        <!-- Title -->
        <h5 style="margin: 0; font-size: 0.78rem; font-weight: 600; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; height: 32px;" title="${p.ten}">${p.ten}</h5>
        
        <!-- Unit and Stock -->
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem;">
          <span style="color: var(--muted);">ĐVT: <strong style="color: var(--text);">${p.donvi || 'Cái'}</strong></span>
          <span style="color: ${isOutOfStock ? 'var(--danger)' : 'var(--success)'}; font-weight: 600;">
            ${isOutOfStock ? 'Hết hàng' : `Tồn: ${p.stock}`}
          </span>
        </div>
        
        <!-- Price and Action -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; border-top: 1px solid #f1f5f9; padding-top: 6px;">
          <span style="font-weight: 700; color: var(--primary); font-size: 0.85rem;">${formatPrice(p.gia)}</span>
          <button class="btn btn-primary btn-sm" onclick="addProdToManualOrder('${p.ma}')" style="padding: 2px 8px; font-size: 0.72rem; border-radius: 6px; height: 24px; display: inline-flex; align-items: center; gap: 4px;">
            <i class="fa-solid fa-plus"></i> Thêm
          </button>
        </div>
      </div>
    `;
  }).join('');

  renderCatalogPagination(totalPages);
}

function renderCatalogPagination(totalPages) {
  const container = document.getElementById('oc_catalogPagination');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  // Back button
  html += `<button onclick="changeCatalogPage(${ocCatalogPage - 1})" class="page-btn" ${ocCatalogPage === 1 ? 'disabled' : ''} style="padding: 4px 8px; font-size: 0.75rem;"><i class="fa-solid fa-chevron-left"></i></button>`;

  // Page numbers
  const maxVisiblePages = 5;
  let startPage = Math.max(1, ocCatalogPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  if (startPage > 1) {
    html += `<button onclick="changeCatalogPage(1)" class="page-btn ${ocCatalogPage === 1 ? 'active' : ''}" style="padding: 4px 8px; font-size: 0.75rem;">1</button>`;
    if (startPage > 2) {
      html += `<span style="color: var(--muted); font-size: 0.75rem; padding: 0 4px;">...</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button onclick="changeCatalogPage(${i})" class="page-btn ${ocCatalogPage === i ? 'active' : ''}" style="padding: 4px 8px; font-size: 0.75rem;">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      html += `<span style="color: var(--muted); font-size: 0.75rem; padding: 0 4px;">...</span>`;
    }
    html += `<button onclick="changeCatalogPage(${totalPages})" class="page-btn ${ocCatalogPage === totalPages ? 'active' : ''}" style="padding: 4px 8px; font-size: 0.75rem;">${totalPages}</button>`;
  }

  // Next button
  html += `<button onclick="changeCatalogPage(${ocCatalogPage + 1})" class="page-btn" ${ocCatalogPage === totalPages ? 'disabled' : ''} style="padding: 4px 8px; font-size: 0.75rem;"><i class="fa-solid fa-chevron-right"></i></button>`;

  container.innerHTML = html;
}

function changeCatalogPage(page) {
  ocCatalogPage = page;
  const query = document.getElementById('oc_productSearch').value;
  searchProductsForOrderCreation(query);
}

function addProdToManualOrder(ma) {
  const product = products.find(p => p.ma === ma);
  if (!product) return;

  const existing = manualOrderItems.find(item => item.ma === ma);
  if (existing) {
    existing.qty += 1;
  } else {
    manualOrderItems.push({
      ma: product.ma,
      ten: product.ten,
      donvi: product.donvi || 'Cái',
      qty: 1,
      gia: product.gia || 0,
      image: product.image,
      note: ''
    });
  }

  renderManualOrderItems();
}

function clearAllManualOrderItems() {
  if (manualOrderItems.length === 0) return;
  if (confirm('Bạn có chắc chắn muốn xóa toàn bộ sản phẩm trong giỏ hàng của đơn?')) {
    manualOrderItems = [];
    renderManualOrderItems();
  }
}

function focusCatalogSearch() {
  const searchInput = document.getElementById('oc_productSearch');
  if (searchInput) {
    searchInput.focus();
    searchInput.select();
  }
}

function renderManualOrderItems() {
  const tbody = document.getElementById('oc_itemsTableBody');
  const countBadge = document.getElementById('oc_cartCountBadge');

  if (countBadge) {
    countBadge.textContent = `(${manualOrderItems.length} sản phẩm)`;
  }

  if (manualOrderItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--muted); padding: 40px; font-size: 0.85rem;">
          <i class="fa-solid fa-cart-shopping fa-2x" style="margin-bottom: 8px; display: block; color: #cbd5e1;"></i>
          Chưa có sản phẩm nào trong giỏ hàng của đơn.
        </td>
      </tr>
    `;
    calculateManualGrandTotal();
    return;
  }

  tbody.innerHTML = manualOrderItems.map((item, idx) => `
    <tr class="oc-table-row" style="border-bottom: 1px solid #e5e7eb; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
      <!-- STT -->
      <td style="padding: 8px 4px; text-align: center; font-weight: 500; color: #64748b;">${idx + 1}</td>
      
      <!-- SẢN PHẨM (Thumbnail + Tên + SKU + Note) -->
      <td style="padding: 8px; max-width: 250px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <!-- Thumbnail -->
          <div style="width: 36px; height: 36px; background: #f8fafc; border-radius: 6px; border: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
            ${item.image
      ? `<img src="${getProductImageUrl(item)}" style="width: 100%; height: 100%; object-fit: contain; padding: 2px;" />`
      : `<i class="fa-solid fa-box text-slate-300"></i>`
    }
          </div>
          <!-- Title & SKU -->
          <div style="min-width: 0; flex: 1;">
            <div style="font-weight: 600; font-size: 0.8rem; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.ten}">${item.ten}</div>
            <div style="font-size: 0.65rem; color: #64748b; font-family: monospace;">SKU: ${item.ma}</div>
          </div>
        </div>
        
        <!-- Note Input under the name -->
        <input type="text" value="${item.note || ''}"
               placeholder="Ghi chú sản phẩm (VD: Hàng loại A, giao gấp...)"
               oninput="updateManualOrderItemNote('${item.ma}', this.value)"
               style="height: 24px; font-size: 0.72rem; padding: 0 8px; background-color: rgba(249, 250, 251, 0.5); border: 1px dashed #d1d5db; border-radius: 4px; outline: none; transition: background-color 0.15s; width: 100%; margin-top: 4px;"
               onfocus="this.style.backgroundColor='#fff'; this.style.borderStyle='solid'; this.style.borderColor='#3b82f6';"
               onblur="this.style.backgroundColor='rgba(249, 250, 251, 0.5)'; this.style.borderStyle='dashed';" />
      </td>
      
      <!-- ĐVT -->
      <td style="padding: 8px 4px; text-align: center; color: #475569;">${item.donvi || 'Cái'}</td>
      
      <!-- ĐƠN GIÁ (input field) -->
      <td style="padding: 8px 6px; text-align: right;">
        <input type="number" value="${item.gia}" min="0"
               oninput="updateManualOrderItemPrice('${item.ma}', this.value)"
               style="width: 85px; height: 26px; font-size: 0.78rem; text-align: right; padding: 0 6px; border-radius: 4px; border: 1px solid #d1d5db; outline: none;"
               onfocus="this.style.borderColor='#3b82f6'"
               onblur="this.style.borderColor='#d1d5db'" />
      </td>
      
      <!-- SỐ LƯỢNG -->
      <td style="padding: 8px 4px; text-align: center;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
          <button onclick="adjustManualOrderItemQty('${item.ma}', -1)" style="width: 22px; height: 22px; border: 1px solid #d1d5db; border-radius: 4px; background: #f1f5f9; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; font-weight: 700;">−</button>
          <span style="font-weight: 600; font-size: 0.82rem; min-width: 18px; text-align: center;">${item.qty}</span>
          <button onclick="adjustManualOrderItemQty('${item.ma}', 1)" style="width: 22px; height: 22px; border: 1px solid #d1d5db; border-radius: 4px; background: #f1f5f9; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; font-weight: 700;">+</button>
        </div>
      </td>
      
      <!-- THÀNH TIỀN -->
      <td style="padding: 8px 6px; text-align: right; font-weight: 600; color: #1e293b; font-size: 0.82rem;">
        <span class="oc-item-subtotal">
          ${(item.gia * item.qty).toLocaleString('vi-VN')}₫
        </span>
      </td>
      
      <!-- THAO TÁC -->
      <td style="padding: 8px 4px; text-align: center;">
        <button onclick="removeManualOrderItem('${item.ma}')" 
                style="background: none; border: none; color: #9ca3af; cursor: pointer; padding: 6px; border-radius: 6px; transition: all 0.15s; display: inline-flex; align-items: center; justify-content: center;"
                onmouseover="this.style.color='#ef4444'; this.style.background='#fee2e2';"
                onmouseout="this.style.color='#9ca3af'; this.style.background='transparent';">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    </tr>
  `).join('');

  calculateManualGrandTotal();
}

function adjustManualOrderItemQty(ma, delta) {
  const item = manualOrderItems.find(i => i.ma === ma);
  if (item) {
    const newQty = item.qty + delta;
    if (newQty >= 1) {
      item.qty = newQty;
      renderManualOrderItems();
    }
  }
}

function updateManualOrderItemPrice(ma, val) {
  const price = parseFloat(val);
  const item = manualOrderItems.find(i => i.ma === ma);
  if (item && !isNaN(price) && price >= 0) {
    item.gia = price;
    calculateManualGrandTotalOnly();
  }
}

function updateManualOrderItemNote(ma, val) {
  const item = manualOrderItems.find(i => i.ma === ma);
  if (item) {
    item.note = String(val || '');
  }
}

function calculateManualGrandTotalOnly() {
  const itemsTotal = manualOrderItems.reduce((sum, item) => sum + (item.gia * item.qty), 0);
  const shippingFee = parseFloat(document.getElementById('oc_shippingFee').value || 0);
  const grandTotal = itemsTotal + (isNaN(shippingFee) ? 0 : shippingFee);

  document.getElementById('oc_itemsTotal').textContent = itemsTotal.toLocaleString('vi-VN') + '₫';
  document.getElementById('oc_totalAmount').textContent = grandTotal.toLocaleString('vi-VN') + '₫';

  // Cập nhật lại cột Thành tiền của từng dòng card mà không render lại toàn bộ
  const tbody = document.getElementById('oc_itemsTableBody');
  if (tbody) {
    const rows = tbody.querySelectorAll('.oc-table-row');
    manualOrderItems.forEach((item, idx) => {
      if (rows[idx]) {
        const subtotalSpan = rows[idx].querySelector('.oc-item-subtotal');
        if (subtotalSpan) {
          subtotalSpan.textContent = (item.gia * item.qty).toLocaleString('vi-VN') + '₫';
        }
      }
    });
  }
}

function calculateManualGrandTotal() {
  const itemsTotal = manualOrderItems.reduce((sum, item) => sum + (item.gia * item.qty), 0);
  const shippingFee = parseFloat(document.getElementById('oc_shippingFee').value || 0);
  const grandTotal = itemsTotal + (isNaN(shippingFee) ? 0 : shippingFee);

  document.getElementById('oc_itemsTotal').textContent = itemsTotal.toLocaleString('vi-VN') + '₫';
  document.getElementById('oc_totalAmount').textContent = grandTotal.toLocaleString('vi-VN') + '₫';
}

function removeManualOrderItem(ma) {
  manualOrderItems = manualOrderItems.filter(i => i.ma !== ma);
  renderManualOrderItems();
}

async function submitManualOrder() {
  const customer = document.getElementById('oc_customer').value.trim();
  const phone = document.getElementById('oc_phone').value.trim();
  const address = document.getElementById('oc_address').value.trim();
  const note = document.getElementById('oc_note').value.trim();
  const shippingFee = parseFloat(document.getElementById('oc_shippingFee').value || 0);
  const status = document.getElementById('oc_status').value;

  if (!customer) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Tên khách hàng không được để trống.', 'error');
    return;
  }
  if (!phone) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Số điện thoại không được để trống.', 'error');
    return;
  }
  if (!address) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Địa chỉ giao hàng không được để trống.', 'error');
    return;
  }
  if (manualOrderItems.length === 0) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng chọn ít nhất 1 sản phẩm cho đơn hàng.', 'error');
    return;
  }

  const saveBtn = document.querySelector('#orderCreateModal .modal-footer .btn-primary');
  const originalHTML = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

  // Chuyển đổi định dạng payload gửi lên API theo chuẩn mới
  const payloadItems = manualOrderItems.map(item => ({
    productId: item.ma,
    sku: item.ma,
    name: item.ten,
    quantity: Number(item.qty),
    unitPrice: Number(item.gia),
    note: item.note || '',

    // Giữ tương thích ngược
    ma: item.ma,
    ten: item.ten,
    qty: Number(item.qty),
    gia: Number(item.gia),
    donvi: item.donvi
  }));

  try {
    const res = await adminFetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customer,
        phone,
        address,
        note,
        items: payloadItems,
        shippingFee: isNaN(shippingFee) ? 0 : shippingFee,
        status
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'Lỗi lưu đơn hàng.');
    }

    showToast('<i class="fa-solid fa-circle-check"></i> Tạo đơn hàng thủ công thành công! <a href="#" onclick="viewOrderDetail(\'' + data.orderId + '\'); return false;" style="color: #60a5fa; text-decoration: underline; margin-left: 8px; font-weight: bold;">Xem chi tiết</a>', 'success');
    closeModal('orderCreateModal');

    await loadOrders();
    renderOrdersTable();
    await loadProducts();
    if (typeof renderAdminTable === 'function') renderAdminTable();

  } catch (err) {
    console.error('Lỗi khi lưu đơn hàng:', err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalHTML;
  }
}

// ============================================================
// STOCK RECEIPT FORM MODAL (THÊM / SỬA PHIẾU NHẬP KHO)
// ============================================================
let srfm_rowIndex = 0;
let srfm_editingReceiptId = null;

/**
 * Tự động sinh mã chứng từ theo định dạng: PN{YYYYMMDD}{NN}
 * Ví dụ: PN2026220801 (ngày 22/08/2026, phiếu thứ 1 trong ngày)
 */
function srfm_generateReceiptCode() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  // Format ngày: YYYYDDMM => ví dụ 20262208 (2026 + ngày 22 + tháng 08)
  const datePart = `${yyyy}${dd}${mm}`;
  const prefix = `PN${datePart}`;

  // Đếm số phiếu đã có trong ngày hôm nay từ allInventoryReceipts
  const existingToday = (allInventoryReceipts || []).filter(r => {
    const code = (r.receipt_code || '');
    return code.startsWith(prefix);
  });

  // Lấy số thứ tự lớn nhất đã dùng trong ngày
  let maxSeq = 0;
  existingToday.forEach(r => {
    const suffix = (r.receipt_code || '').slice(prefix.length);
    const seq = parseInt(suffix, 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  });

  const nextSeq = String(maxSeq + 1).padStart(2, '0');
  return `${prefix}${nextSeq}`;
}

function openStockReceiptFormModal() {
  srfm_editingReceiptId = null;
  srfm_rowIndex = 0;
  
  const deleteBtn = document.getElementById('srfm_deleteBtn');
  if (deleteBtn) deleteBtn.style.display = 'none';

  const saveBtn = document.getElementById('srfm_saveBtn');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu phiếu nhập';
  }
  
  document.getElementById('srfm_title').textContent = 'Thêm phiếu nhập kho';
  const badge = document.getElementById('srfm_codeBadge');
  badge.style.display = 'none';
  badge.textContent = '';

  const codeInput = document.getElementById('srfm_receiptCode');
  // Tự động sinh mã chứng từ, vẫn cho phép chỉnh sửa
  codeInput.value = srfm_generateReceiptCode();
  codeInput.disabled = false;
  codeInput.style.background = '';
  codeInput.style.cursor = '';

  // Set today's date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('srfm_importDate').value = today;
  document.getElementById('srfm_supplierName').value = '';
  document.getElementById('srfm_warehouseName').value = 'Kho chính';
  // Khởi tạo diễn giải tự động với mã và ngày (NCC chưa chọn nên chỉ có "Nhập kho từ - Số: ... Ngày ...")
  document.getElementById('srfm_note').value = '';

  // Clear table
  const tbody = document.getElementById('srfm_tableBody');
  tbody.innerHTML = `
    <tr id="srfm_emptyRow">
      <td colspan="9" style="text-align:center;padding:28px 0;color:#9ca3af;font-size:.83rem;">
        <i class="fa-solid fa-inbox" style="font-size:1.4rem;margin-bottom:6px;display:block;"></i>
        Chưa có hàng hóa — nhấn <strong>Thêm dòng</strong> để bắt đầu
      </td>
    </tr>`;
  srfm_updateTotals();
  srfm_updateItemCount();

  document.getElementById('stockReceiptFormModal').classList.add('open');
  // Auto-focus supplier field for better UX (mã đã có sẵn)
  setTimeout(() => document.getElementById('srfm_supplierName').focus(), 120);
}

function srfm_addRow(data) {
  // Hide empty row
  const emptyRow = document.getElementById('srfm_emptyRow');
  if (emptyRow) emptyRow.style.display = 'none';

  const idx = srfm_rowIndex++;
  const tbody = document.getElementById('srfm_tableBody');

  const d = data || {};
  const tr = document.createElement('tr');
  tr.id = `srfm_row_${idx}`;
  tr.style.cssText = 'border-bottom:1px solid #f1f5f9;transition:background .1s;';
  tr.onmouseover = () => tr.style.background = '#f8fafc';
  tr.onmouseout = () => tr.style.background = '';

  const inputStyle = `width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:5px 7px;font-size:.82rem;color:#111827;outline:none;box-sizing:border-box;background:#fff;transition:border .12s,box-shadow .12s;`;
  const focusEvents = `onfocus="this.style.borderColor='#3b82f6';this.style.boxShadow='0 0 0 2px rgba(59,130,246,.15)'" onblur="this.style.borderColor='#e5e7eb';this.style.boxShadow='none'"`;

  tr.innerHTML = `
    <td style="padding:6px 6px;text-align:center;color:#9ca3af;font-size:.78rem;font-weight:600;vertical-align:middle;">${idx + 1}</td>
    <td style="padding:6px 8px;vertical-align:middle;position:relative;">
      <input type="text" id="srfm_sku_${idx}" placeholder="Mã SKU..." value="${d.product_sku || ''}"
        style="${inputStyle}" ${focusEvents}
        oninput="srfm_onSkuInput(this, ${idx})"
        onkeydown="srfm_skuKeydown(event, ${idx})" />
    </td>
    <td style="padding:6px 8px;vertical-align:middle;position:relative;">
      <input type="text" id="srfm_name_${idx}" placeholder="Tên hàng hóa..." value="${d.product_name || ''}"
        style="${inputStyle}" ${focusEvents}
        oninput="srfm_onNameInput(this, ${idx})"
        onkeydown="srfm_skuKeydown(event, ${idx})" />
    </td>
    <td style="padding:6px 8px;vertical-align:middle;">
      <input type="text" id="srfm_unit_${idx}" placeholder="Cái" value="${d.unit || ''}"
        style="${inputStyle}text-align:center;" ${focusEvents} />
    </td>
    <td style="padding:6px 8px;vertical-align:middle;">
      <input type="number" id="srfm_qty_${idx}" placeholder="0" value="${d.quantity || ''}" min="0" step="any"
        style="${inputStyle}text-align:right;" ${focusEvents}
        oninput="srfm_calcRow(${idx})" />
    </td>
    <td style="padding:6px 8px;vertical-align:middle;">
      <input type="number" id="srfm_price_${idx}" placeholder="0" value="${d.unit_price || ''}" min="0" step="any"
        style="${inputStyle}text-align:right;" ${focusEvents}
        oninput="srfm_calcRow(${idx})" />
    </td>
    <td style="padding:6px 8px;vertical-align:middle;">
      <input type="number" id="srfm_tax_${idx}" placeholder="0" value="${d.tax_rate !== undefined ? d.tax_rate : ''}" min="0" max="100" step="any"
        style="${inputStyle}text-align:right;" ${focusEvents}
        oninput="srfm_calcRow(${idx})" />
    </td>
    <td style="padding:6px 8px;vertical-align:middle;text-align:right;">
      <span id="srfm_rowTotal_${idx}" style="font-weight:700;color:#111827;font-size:.83rem;">0₫</span>
      <input type="hidden" id="srfm_rowTotalVal_${idx}" value="0" />
    </td>
    <td style="padding:6px 6px;text-align:center;vertical-align:middle;">
      <button onclick="srfm_removeRow(${idx})"
        style="background:none;border:none;color:#d1d5db;cursor:pointer;padding:3px 6px;border-radius:5px;font-size:.9rem;transition:color .12s;"
        onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#d1d5db'"
        title="Xóa dòng">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </td>`;

  tbody.appendChild(tr);
  srfm_calcRow(idx);
  srfm_updateItemCount();
  // Focus SKU input of new row if we aren't batch populating
  if (!data) {
    setTimeout(() => { const el = document.getElementById(`srfm_sku_${idx}`); if (el) el.focus(); }, 50);
  }
}

function srfm_removeRow(idx) {
  const row = document.getElementById(`srfm_row_${idx}`);
  if (row) row.remove();
  // Show empty state if no data rows
  const tbody = document.getElementById('srfm_tableBody');
  const dataRows = tbody.querySelectorAll('tr[id^="srfm_row_"]');
  if (dataRows.length === 0) {
    let emptyRow = document.getElementById('srfm_emptyRow');
    if (!emptyRow) {
      emptyRow = document.createElement('tr');
      emptyRow.id = 'srfm_emptyRow';
      emptyRow.innerHTML = `<td colspan="9" style="text-align:center;padding:28px 0;color:#9ca3af;font-size:.83rem;">
        <i class="fa-solid fa-inbox" style="font-size:1.4rem;margin-bottom:6px;display:block;"></i>
        Chưa có hàng hóa — nhấn <strong>Thêm dòng</strong> để bắt đầu
      </td>`;
      tbody.appendChild(emptyRow);
    } else {
      emptyRow.style.display = '';
    }
  }
  srfm_updateTotals();
  srfm_updateItemCount();
}

function srfm_calcRow(idx) {
  const qty = parseFloat(document.getElementById(`srfm_qty_${idx}`)?.value || 0) || 0;
  const price = parseFloat(document.getElementById(`srfm_price_${idx}`)?.value || 0) || 0;
  const tax = parseFloat(document.getElementById(`srfm_tax_${idx}`)?.value || 0) || 0;
  const subtotal = qty * price;
  const total = Math.round(subtotal * (1 + tax / 100));
  const totalEl = document.getElementById(`srfm_rowTotal_${idx}`);
  const totalValEl = document.getElementById(`srfm_rowTotalVal_${idx}`);
  if (totalEl) totalEl.textContent = total.toLocaleString('vi-VN') + '₫';
  if (totalValEl) totalValEl.value = total;
  srfm_updateTotals();
}

function srfm_updateTotals() {
  let subtotal = 0, tax = 0;
  document.querySelectorAll('[id^="srfm_row_"]').forEach(row => {
    const idx = row.id.replace('srfm_row_', '');
    const qty = parseFloat(document.getElementById(`srfm_qty_${idx}`)?.value || 0) || 0;
    const price = parseFloat(document.getElementById(`srfm_price_${idx}`)?.value || 0) || 0;
    const taxRate = parseFloat(document.getElementById(`srfm_tax_${idx}`)?.value || 0) || 0;
    const rowSubtotal = qty * price;
    subtotal += rowSubtotal;
    tax += Math.round(rowSubtotal * taxRate / 100);
  });
  const total = subtotal + tax;
  const el_sub = document.getElementById('srfm_subtotal');
  const el_tax = document.getElementById('srfm_tax');
  const el_tot = document.getElementById('srfm_total');
  if (el_sub) el_sub.textContent = Math.round(subtotal).toLocaleString('vi-VN') + '₫';
  if (el_tax) el_tax.textContent = Math.round(tax).toLocaleString('vi-VN') + '₫';
  if (el_tot) el_tot.textContent = Math.round(total).toLocaleString('vi-VN') + '₫';
}

function srfm_updateItemCount() {
  const count = document.querySelectorAll('[id^="srfm_row_"]').length;
  const el = document.getElementById('srfm_itemCount');
  if (el) el.textContent = count + ' dòng';
  srfm_checkDuplicates();
}

/**
 * Highlight đỏ toàn bộ dòng có SKU trùng lặp
 */
function srfm_checkDuplicates() {
  const rows = document.querySelectorAll('[id^="srfm_row_"]');
  // Thu thập tất cả SKU (không rỗng)
  const skuMap = {}; // sku -> count
  rows.forEach(row => {
    const idx = row.id.replace('srfm_row_', '');
    const sku = (document.getElementById(`srfm_sku_${idx}`)?.value || '').trim().toUpperCase();
    if (sku) {
      skuMap[sku] = (skuMap[sku] || 0) + 1;
    }
  });

  // Áp dụng style bằng class CSS để tránh xung đột với style mặc định
  rows.forEach(row => {
    const idx = row.id.replace('srfm_row_', '');
    const sku = (document.getElementById(`srfm_sku_${idx}`)?.value || '').trim().toUpperCase();
    const isDup = sku && skuMap[sku] > 1;

    if (isDup) {
      row.classList.add('srfm-dup-row');
    } else {
      row.classList.remove('srfm-dup-row');
    }

    // Thiết lập tooltip cho ô SKU khi bị trùng
    const skuEl = document.getElementById(`srfm_sku_${idx}`);
    if (skuEl) {
      skuEl.title = isDup ? `⚠ SKU "${sku}" bị trùng!` : '';
    }
  });
}

// Shared product autocomplete dropdown helper functions
let srfm_activeDropdownInput = null;

function srfm_getSharedDropdown() {
  let drop = document.getElementById('srfm_sharedDropdown');
  if (!drop) {
    drop = document.createElement('div');
    drop.id = 'srfm_sharedDropdown';
    drop.style.cssText = 'display:none;position:absolute;z-index:999999;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.15);max-height:220px;overflow-y:auto;box-sizing:border-box;margin-top:2px;';
    document.body.appendChild(drop);
  }
  return drop;
}

function srfm_positionDropdown(input, drop) {
  const rect = input.getBoundingClientRect();
  drop.style.width = rect.width + 'px';
  drop.style.left = (rect.left + window.scrollX) + 'px';
  drop.style.top = (rect.bottom + window.scrollY) + 'px';
  drop.style.display = 'block';
  srfm_activeDropdownInput = input;
}

function srfm_hideDropdown() {
  const drop = document.getElementById('srfm_sharedDropdown');
  if (drop) drop.style.display = 'none';
  srfm_activeDropdownInput = null;
}

// SKU autocomplete
function srfm_onSkuInput(input, idx) {
  srfm_checkDuplicates(); // Kiểm tra trùng mỗi khi gõ SKU
  const val = input.value.trim().toLowerCase();
  const drop = srfm_getSharedDropdown();
  if (!val || val.length < 1) { srfm_hideDropdown(); return; }

  const matches = (products || []).filter(p =>
    (p.ma || '').toLowerCase().includes(val) ||
    (p.ten || '').toLowerCase().includes(val)
  ).slice(0, 12);

  if (matches.length === 0) { srfm_hideDropdown(); return; }

  drop.innerHTML = matches.map(p => `
    <div onclick="srfm_selectSku(${idx}, '${(p.ma||'').replace(/'/g,"\\'")}', '${(p.ten||'').replace(/'/g,"\\'")}', '${(p.donvi||'Cái').replace(/'/g,"\\'")}', ${p.cost_price || p.gia || 0}); srfm_hideDropdown();"
      style="padding:7px 12px;cursor:pointer;font-size:.82rem;border-bottom:1px solid #f1f5f9;transition:background .1s;"
      onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background=''">
      <span style="font-weight:700;color:#2563eb;">${p.ma || ''}</span>
      <span style="color:#374151;margin-left:8px;">${p.ten || ''}</span>
      ${p.donvi ? `<span style="color:#9ca3af;margin-left:6px;font-size:.75rem;">${p.donvi}</span>` : ''}
    </div>`).join('');
  
  srfm_positionDropdown(input, drop);
}

function srfm_onNameInput(input, idx) {
  const val = input.value.trim().toLowerCase();
  const drop = srfm_getSharedDropdown();
  if (!val || val.length < 1) { srfm_hideDropdown(); return; }

  const matches = (products || []).filter(p =>
    (p.ten || '').toLowerCase().includes(val) ||
    (p.ma || '').toLowerCase().includes(val)
  ).slice(0, 12);

  if (matches.length === 0) { srfm_hideDropdown(); return; }

  drop.innerHTML = matches.map(p => `
    <div onclick="srfm_selectSku(${idx}, '${(p.ma||'').replace(/'/g,"\\'")}', '${(p.ten||'').replace(/'/g,"\\'")}', '${(p.donvi||'Cái').replace(/'/g,"\\'")}', ${p.cost_price || p.gia || 0}); srfm_hideDropdown();"
      style="padding:7px 12px;cursor:pointer;font-size:.82rem;border-bottom:1px solid #f1f5f9;transition:background .1s;"
      onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background=''">
      <span style="font-weight:700;color:#2563eb;">${p.ma || ''}</span>
      <span style="color:#374151;margin-left:8px;">${p.ten || ''}</span>
      ${p.donvi ? `<span style="color:#9ca3af;margin-left:6px;font-size:.75rem;">${p.donvi}</span>` : ''}
    </div>`).join('');
  
  srfm_positionDropdown(input, drop);
}

function srfm_selectSku(idx, sku, name, unit, price) {
  const skuEl = document.getElementById(`srfm_sku_${idx}`);
  const nameEl = document.getElementById(`srfm_name_${idx}`);
  const unitEl = document.getElementById(`srfm_unit_${idx}`);
  const priceEl = document.getElementById(`srfm_price_${idx}`);
  if (skuEl) skuEl.value = sku;
  if (nameEl) nameEl.value = name;
  if (unitEl) unitEl.value = unit;
  if (priceEl && !priceEl.value) priceEl.value = price || '';
  srfm_calcRow(idx);
  srfm_checkDuplicates(); // Kiểm tra trùng sau khi chọn sản phẩm
  // Focus qty
  const qtyEl = document.getElementById(`srfm_qty_${idx}`);
  if (qtyEl) { qtyEl.focus(); qtyEl.select(); }
}

function srfm_skuKeydown(event, idx) {
  if (event.key === 'Escape') {
    srfm_hideDropdown();
  }
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  const sharedDrop = document.getElementById('srfm_sharedDropdown');
  if (sharedDrop && !sharedDrop.contains(e.target) && e.target !== srfm_activeDropdownInput) {
    srfm_hideDropdown();
  }
  const supplierDrop = document.getElementById('srfm_supplierDrop');
  const supplierWrap = document.getElementById('srfm_supplierWrap');
  if (supplierDrop && supplierWrap && !supplierWrap.contains(e.target)) {
    supplierDrop.style.display = 'none';
  }
});

// Close product suggestion dropdown on scroll (e.g. scroll of table or modal)
window.addEventListener('scroll', function(e) {
  const sharedDrop = document.getElementById('srfm_sharedDropdown');
  // Allow scrolling the dropdown list itself
  if (sharedDrop && sharedDrop.contains(e.target)) return;
  srfm_hideDropdown();
}, true);

// ── Supplier combobox ─────────────────────────────────────────
function srfm_onSupplierInput(input) {
  const val = input.value.trim().toLowerCase();
  const drop = document.getElementById('srfm_supplierDrop');
  if (!val || val.length < 1) { drop.style.display = 'none'; return; }

  const matches = (suppliers || []).filter(s =>
    (s.name || '').toLowerCase().includes(val) ||
    (s.code || '').toLowerCase().includes(val)
  ).slice(0, 10);

  if (matches.length === 0) { drop.style.display = 'none'; return; }

  drop.innerHTML = matches.map(s => `
    <div onclick="srfm_selectSupplier('${(s.name||'').replace(/'/g,"\\'")}', '${(s.phone||'').replace(/'/g,"\\'")}')"
      style="padding:8px 12px;cursor:pointer;font-size:.82rem;border-bottom:1px solid #f1f5f9;transition:background .1s;"
      onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background=''">
      <div style="font-weight:700;color:#2563eb;font-size:.8rem;">${s.name || ''}</div>
      ${s.phone ? `<div style="color:#6b7280;font-size:.73rem;margin-top:1px;"><i class="fa-solid fa-phone" style="font-size:.65rem;margin-right:3px;"></i>${s.phone}</div>` : ''}
    </div>`).join('');
  drop.style.display = 'block';
}

/**
 * Xây dựng chuỗi diễn giải tự động:
 * "Nhập kho từ {TÊN NCC} - Số: {MÃ CT} Ngày {DD/MM/YYYY}"
 */
function srfm_buildAutoNote() {
  const supplier = (document.getElementById('srfm_supplierName')?.value || '').trim();
  const code     = (document.getElementById('srfm_receiptCode')?.value || '').trim();
  const dateVal  = (document.getElementById('srfm_importDate')?.value || '').trim(); // YYYY-MM-DD

  let dateStr = '';
  if (dateVal) {
    const [y, m, d] = dateVal.split('-');
    dateStr = `${d}/${m}/${y}`;
  }

  const parts = ['Nhập kho từ'];
  if (supplier) parts.push(supplier);
  if (code)     parts.push(`- Số: ${code}`);
  if (dateStr)  parts.push(`Ngày ${dateStr}`);

  return parts.join(' ');
}

/**
 * Cập nhật ô Diễn giải nếu nó đang chứa nội dung tự sinh
 * (trống hoặc bắt đầu bằng "Nhập kho từ")
 */
function srfm_syncAutoNote() {
  const noteEl = document.getElementById('srfm_note');
  if (!noteEl) return;
  const cur = noteEl.value.trim();
  if (!cur || cur.startsWith('Nhập kho từ')) {
    noteEl.value = srfm_buildAutoNote();
  }
}

function srfm_selectSupplier(name, phone) {
  const input = document.getElementById('srfm_supplierName');
  if (input) input.value = name;
  document.getElementById('srfm_supplierDrop').style.display = 'none';
  // Cập nhật diễn giải nếu đang là nội dung tự sinh
  srfm_syncAutoNote();
}

function srfm_supplierKeydown(event) {
  if (event.key === 'Escape') {
    document.getElementById('srfm_supplierDrop').style.display = 'none';
  }
}

function srfm_toggleSupplierDrop(forceOpen) {
  const input = document.getElementById('srfm_supplierName');
  const drop = document.getElementById('srfm_supplierDrop');
  if (!forceOpen && drop.style.display !== 'none') { drop.style.display = 'none'; return; }
  // Show all suppliers or filter by current input value
  const val = (input.value || '').trim().toLowerCase();
  const list = val
    ? (suppliers || []).filter(s => (s.name||'').toLowerCase().includes(val) || (s.code||'').toLowerCase().includes(val))
    : (suppliers || []).slice(0, 20);
  if (list.length === 0) return;
  drop.innerHTML = list.map(s => `
    <div onclick="srfm_selectSupplier('${(s.name||'').replace(/'/g,"\\'")}', '${(s.phone||'').replace(/'/g,"\\'")}')"
      style="padding:8px 12px;cursor:pointer;font-size:.82rem;border-bottom:1px solid #f1f5f9;transition:background .1s;"
      onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background=''">
      <div style="font-weight:700;color:#2563eb;font-size:.8rem;">${s.name || ''}</div>
      ${s.phone ? `<div style="color:#6b7280;font-size:.73rem;margin-top:1px;"><i class="fa-solid fa-phone" style="font-size:.65rem;margin-right:3px;"></i>${s.phone}</div>` : ''}
    </div>`).join('');
  drop.style.display = 'block';
  if (!forceOpen) input.focus();
}

async function srfm_saveReceipt(btn) {
  const receiptCode = document.getElementById('srfm_receiptCode').value.trim();
  const importDate = document.getElementById('srfm_importDate').value;
  const supplierName = document.getElementById('srfm_supplierName').value.trim();
  const warehouseName = document.getElementById('srfm_warehouseName').value.trim();
  const note = document.getElementById('srfm_note').value.trim();

  if (!receiptCode) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng nhập Mã chứng từ!', 'error');
    document.getElementById('srfm_receiptCode').focus();
    return;
  }
  if (!importDate) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng chọn Ngày nhập!', 'error');
    document.getElementById('srfm_importDate').focus();
    return;
  }

  // Collect items
  const items = [];
  let hasError = false;
  document.querySelectorAll('[id^="srfm_row_"]').forEach(row => {
    const idx = row.id.replace('srfm_row_', '');
    const sku = (document.getElementById(`srfm_sku_${idx}`)?.value || '').trim();
    const name = (document.getElementById(`srfm_name_${idx}`)?.value || '').trim();
    const unit = (document.getElementById(`srfm_unit_${idx}`)?.value || 'Cái').trim();
    const qty = parseFloat(document.getElementById(`srfm_qty_${idx}`)?.value || 0) || 0;
    const price = parseFloat(document.getElementById(`srfm_price_${idx}`)?.value || 0) || 0;
    const taxRate = parseFloat(document.getElementById(`srfm_tax_${idx}`)?.value || 0) || 0;
    if (!sku) return; // skip blank rows
    if (qty <= 0) { hasError = true; showToast('<i class="fa-solid fa-triangle-exclamation"></i> Số lượng phải lớn hơn 0!', 'error'); return; }
    const subtotal = qty * price;
    const taxAmt = Math.round(subtotal * taxRate / 100);
    const total = subtotal + taxAmt;
    items.push({
      product_sku: sku,
      product_name: name,
      unit,
      quantity: qty,
      unit_price: price,
      tax_rate: taxRate,
      total_price: Math.round(total),
      import_cost: price
    });
  });

  if (hasError) return;
  if (items.length === 0) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng thêm ít nhất một mặt hàng!', 'error');
    return;
  }

  const totalAmount = items.reduce((s, i) => s + i.total_price, 0);

  // Convert date format from YYYY-MM-DD to DD/MM/YYYY for MISA database consistency
  let formattedImportDate = importDate;
  if (importDate.includes('-')) {
    const parts = importDate.split('-');
    if (parts.length === 3) {
      formattedImportDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

  try {
    const res = await adminFetch('/api/admin/inventory/save-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receipt: { id: srfm_editingReceiptId, receipt_code: receiptCode, import_date: formattedImportDate, supplier_name: supplierName, warehouse_name: warehouseName, note, total_amount: totalAmount },
        items
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'Lỗi lưu phiếu nhập kho.');
    }
    showToast(`<i class="fa-solid fa-circle-check"></i> Lưu phiếu nhập kho thành công! <a href="#" onclick="openInventoryReceiptDetail(${data.receiptId}); return false;" style="color:#60a5fa;text-decoration:underline;margin-left:8px;font-weight:bold;">Xem chi tiết</a>`, 'success');
    closeModal('stockReceiptFormModal');
    loadInventoryHistory();
  } catch (err) {
    console.error(err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

async function editStockReceipt(id) {
  const deleteBtn = document.getElementById('srfm_deleteBtn');
  if (deleteBtn) {
    deleteBtn.style.display = 'inline-block';
    deleteBtn.disabled = false;
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Xóa phiếu nhập';
  }

  const saveBtn = document.getElementById('srfm_saveBtn');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu phiếu nhập';
  }
  try {
    const res = await adminFetch(`/api/admin/inventory/receipts/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok || !data.receipt) throw new Error(data.message || 'Không có dữ liệu');

    const { receipt, items } = data;

    srfm_editingReceiptId = receipt.id;
    srfm_rowIndex = 0;

    document.getElementById('srfm_title').textContent = 'Sửa phiếu nhập kho';
    const badge = document.getElementById('srfm_codeBadge');
    badge.style.display = 'inline-block';
    badge.textContent = receipt.receipt_code;

    const codeInput = document.getElementById('srfm_receiptCode');
    codeInput.value = receipt.receipt_code;
    codeInput.disabled = true;
    codeInput.style.background = '#f9fafb';
    codeInput.style.cursor = 'not-allowed';

    // Parse DD/MM/YYYY into YYYY-MM-DD for date input element
    let dateInputVal = receipt.import_date || '';
    if (dateInputVal.includes('/')) {
      const parts = dateInputVal.split('/');
      if (parts.length === 3) {
        dateInputVal = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    document.getElementById('srfm_importDate').value = dateInputVal;
    
    document.getElementById('srfm_supplierName').value = receipt.supplier_name || '';
    document.getElementById('srfm_warehouseName').value = receipt.warehouse_name || 'Kho chính';
    document.getElementById('srfm_note').value = receipt.note || '';

    const tbody = document.getElementById('srfm_tableBody');
    tbody.innerHTML = ''; // Clear empty row/previous rows

    if (items && items.length > 0) {
      items.forEach(item => srfm_addRow(item));
    } else {
      tbody.innerHTML = `
        <tr id="srfm_emptyRow">
          <td colspan="9" style="text-align:center;padding:28px 0;color:#9ca3af;font-size:.83rem;">
            <i class="fa-solid fa-inbox" style="font-size:1.4rem;margin-bottom:6px;display:block;"></i>
            Chưa có hàng hóa — nhấn <strong>Thêm dòng</strong> để bắt đầu
          </td>
        </tr>`;
    }

    srfm_updateTotals();
    srfm_updateItemCount();

    document.getElementById('stockReceiptFormModal').classList.add('open');
  } catch (err) {
    console.error(err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi khi tải thông tin phiếu: ${err.message}`, 'error');
  }
}

// ============================================================
// SUPPLIER FORM MODAL (THÊM / SỬA NHÀ CUNG CẤP)
// ============================================================
function sup_updateNoteCounter(el) {
  const len = el.value.length;
  document.getElementById('sup_noteCounter').textContent = `${len}/255`;
}

function openAddSupplierModal() {
  document.getElementById('sup_modalTitle').textContent = 'Thêm nhà cung cấp';
  document.getElementById('sup_modalSubtitle').textContent = 'Nhập thông tin nhà cung cấp. Mã nhà cung cấp sẽ được tạo tự động sau khi lưu.';
  
  const badge = document.getElementById('sup_modalBadge');
  badge.style.display = 'none';
  badge.textContent = '';

  // Reset inputs
  document.getElementById('sup_code').value = '';
  document.getElementById('sup_name').value = '';
  document.getElementById('sup_phone').value = '';
  document.getElementById('sup_email').value = '';
  document.getElementById('sup_taxCode').value = '';
  document.getElementById('sup_contactPerson').value = '';
  document.getElementById('sup_contactTitle').value = '';
  document.getElementById('sup_note').value = '';
  document.getElementById('sup_address').value = '';

  // Reset note counter
  document.getElementById('sup_noteCounter').textContent = '0/255';

  // Set default status radio option
  const radios = document.getElementsByName('sup_status');
  radios.forEach(r => {
    r.checked = (r.value === 'Đang theo dõi');
  });

  // Hide delete button
  document.getElementById('sup_deleteBtn').style.display = 'none';
  
  // Set save button text
  document.getElementById('sup_saveBtnText').textContent = 'Lưu nhà cung cấp';

  const saveBtn = document.getElementById('sup_saveBtn');
  saveBtn.disabled = false;
  saveBtn.style.background = '#2563eb';

  // Open modal
  document.getElementById('supplierFormModal').classList.add('open');
  setTimeout(() => document.getElementById('sup_name').focus(), 150);
}

function openEditSupplierModal(code) {
  const s = (suppliers || []).find(x => x.code === code);
  if (!s) {
    showToast('<i class="fa-solid fa-xmark"></i> Không tìm thấy thông tin nhà cung cấp.', 'error');
    return;
  }

  document.getElementById('sup_modalTitle').textContent = 'Sửa thông tin nhà cung cấp';
  document.getElementById('sup_modalSubtitle').textContent = 'Cập nhật thông tin nhà cung cấp.';

  const badge = document.getElementById('sup_modalBadge');
  badge.style.display = 'inline-block';
  badge.textContent = s.code;

  // Fill inputs
  document.getElementById('sup_code').value = s.code;
  document.getElementById('sup_name').value = s.name || '';
  document.getElementById('sup_phone').value = s.phone || '';
  document.getElementById('sup_email').value = s.email || '';
  document.getElementById('sup_taxCode').value = s.tax_code || '';
  document.getElementById('sup_contactPerson').value = s.contact_person || '';
  document.getElementById('sup_contactTitle').value = s.contact_title || '';
  document.getElementById('sup_address').value = s.address || '';
  
  const noteVal = s.note || '';
  document.getElementById('sup_note').value = noteVal;
  document.getElementById('sup_noteCounter').textContent = `${noteVal.length}/255`;

  // Set status radio option
  const statusVal = s.status || 'Đang theo dõi';
  const radios = document.getElementsByName('sup_status');
  radios.forEach(r => {
    r.checked = (r.value === statusVal);
  });

  // Show delete button (reset state to avoid stale "Đang xoá..." from previous attempt)
  const deleteBtn = document.getElementById('sup_deleteBtn');
  deleteBtn.style.display = 'inline-block';
  deleteBtn.disabled = false;
  deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Xóa nhà cung cấp';
  
  // Set save button text
  document.getElementById('sup_saveBtnText').textContent = 'Lưu thay đổi';

  const saveBtn = document.getElementById('sup_saveBtn');
  saveBtn.disabled = false;
  saveBtn.style.background = '#2563eb';

  // Open modal
  document.getElementById('supplierFormModal').classList.add('open');
  setTimeout(() => document.getElementById('sup_name').focus(), 150);
}

async function sup_saveSupplier(btn) {
  const code = document.getElementById('sup_code').value;
  const name = document.getElementById('sup_name').value.trim();
  const phone = document.getElementById('sup_phone').value.trim();
  const email = document.getElementById('sup_email').value.trim();
  const tax_code = document.getElementById('sup_taxCode').value.trim();
  const contact_person = document.getElementById('sup_contactPerson').value.trim();
  const contact_title = document.getElementById('sup_contactTitle').value.trim();
  const note = document.getElementById('sup_note').value.trim();
  const address = document.getElementById('sup_address').value.trim();

  let status = 'Đang theo dõi';
  const radios = document.getElementsByName('sup_status');
  radios.forEach(r => {
    if (r.checked) status = r.value;
  });

  if (!name) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng nhập tên nhà cung cấp!', 'error');
    document.getElementById('sup_name').focus();
    return;
  }

  const isEdit = !!code;
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

  try {
    const url = isEdit ? `/api/admin/suppliers/${encodeURIComponent(code)}` : '/api/admin/suppliers';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await adminFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, tax_code, contact_person, contact_title, note, address, status })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'Lỗi lưu thông tin nhà cung cấp.');
    }

    showToast(`<i class="fa-solid fa-circle-check"></i> ${isEdit ? 'Cập nhật' : 'Thêm'} nhà cung cấp thành công!`, 'success');
    closeModal('supplierFormModal');
    
    // Refresh the list
    await loadSuppliersList();
    
    // If global loadAllData is available, fetch suppliers list into memory again
    if (typeof loadSuppliers === 'function') {
      await loadSuppliers();
    }
  } catch (err) {
    console.error(err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

async function sup_deleteSupplier() {
  const code = document.getElementById('sup_code').value;
  if (!code) return;

  if (!confirm(`Bạn có chắc chắn muốn xoá vĩnh viễn nhà cung cấp ${code}?`)) return;

  const btn = document.getElementById('sup_deleteBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xoá...';

  try {
    const res = await adminFetch(`/api/admin/suppliers/${encodeURIComponent(code)}`, {
      method: 'DELETE'
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'Lỗi khi xoá nhà cung cấp.');
    }

    showToast('<i class="fa-solid fa-circle-check"></i> Xoá nhà cung cấp thành công!', 'success');
    closeModal('supplierFormModal');
    
    // Refresh lists
    await loadSuppliersList();
    if (typeof loadSuppliers === 'function') {
      await loadSuppliers();
    }
  } catch (err) {
    console.error(err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

async function srfm_deleteReceipt() {
  if (!srfm_editingReceiptId) return;
  
  if (!confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn phiếu nhập kho này? Hành động này không thể hoàn tác và sẽ khôi phục lại số lượng tồn kho của các sản phẩm tương ứng.`)) return;

  const btn = document.getElementById('srfm_deleteBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';

  try {
    const res = await adminFetch(`/api/admin/inventory/receipts/${srfm_editingReceiptId}`, {
      method: 'DELETE'
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'Lỗi khi xóa phiếu nhập kho.');
    }

    showToast('<i class="fa-solid fa-circle-check"></i> Xóa phiếu nhập kho thành công!', 'success');
    closeModal('stockReceiptFormModal');
    
    // Tải lại lịch sử nhập kho và danh sách sản phẩm (vì số lượng tồn kho thay đổi)
    if (typeof loadInventoryHistory === 'function') {
      await loadInventoryHistory();
    }
    if (typeof loadProducts === 'function') {
      await loadProducts();
    }
    if (typeof renderAdminTable === 'function') {
      renderAdminTable();
    }
  } catch (err) {
    console.error(err);
    showToast(`<i class="fa-solid fa-xmark"></i> Lỗi: ${err.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}



