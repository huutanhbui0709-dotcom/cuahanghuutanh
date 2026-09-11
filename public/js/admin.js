// ==============================
// STATE
// ==============================
if (window.location.protocol === 'file:') {
  window.location.href = 'https://cuahanghuutanh.vercel.app/admin';
}

let products = [];
let orders = [];
let suppliers = [];
let allInventoryReceipts = [];
let orderReturns = [];

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

function formatPriceInput(input) {
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  const originalLength = input.value.length;
  
  // Clean all non-digits
  let val = input.value.replace(/\D/g, '');
  if (val) {
    val = parseInt(val, 10).toLocaleString('vi-VN');
  }
  input.value = val;
  
  // Adjust cursor position
  const newLength = input.value.length;
  const diff = newLength - originalLength;
  input.setSelectionRange(selectionStart + diff, selectionEnd + diff);
}

function parseFormattedFloat(val) {
  if (!val) return 0;
  const clean = String(val).replace(/\./g, '');
  return parseFloat(clean) || 0;
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

// ==============================
// STITCH-DESIGNED DELETE CONFIRMATION MODAL
// ==============================
let _deleteConfirmResolver = null;

function showDeleteConfirmModal({
  title = 'Xác nhận xoá vĩnh viễn',
  target = '',
  desc = 'Bạn có chắc chắn muốn thực hiện thao tác này? Dữ liệu sẽ bị xóa vĩnh viễn và không thể hoàn tác.',
  confirmText = 'Xác nhận xoá',
  cancelText = 'Hủy bỏ',
  icon = 'fa-trash-can'
} = {}) {
  return new Promise((resolve) => {
    if (_deleteConfirmResolver) {
      _deleteConfirmResolver(false);
    }
    _deleteConfirmResolver = resolve;

    const modal = document.getElementById('deleteConfirmModal');
    const card = document.getElementById('deleteConfirmCard');
    const titleEl = document.getElementById('delConfirmTitle');
    const targetBox = document.getElementById('delConfirmTargetBox');
    const targetEl = document.getElementById('delConfirmTargetName');
    const descEl = document.getElementById('delConfirmDesc');
    const confirmBtnText = document.getElementById('delConfirmBtnText');
    const cancelBtn = document.getElementById('delConfirmCancelBtn');
    const iconEl = document.getElementById('delConfirmIcon');

    if (!modal) {
      const promptText = `${title}${target ? `\n[ ${target} ]` : ''}\n${desc}`;
      resolve(window.confirm(promptText));
      _deleteConfirmResolver = null;
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (targetEl && target) {
      targetEl.textContent = target;
      targetBox?.classList.remove('hidden');
    } else {
      targetBox?.classList.add('hidden');
    }
    if (descEl) descEl.textContent = desc;
    if (confirmBtnText) confirmBtnText.textContent = confirmText;
    if (cancelBtn) cancelBtn.textContent = cancelText;
    if (iconEl) {
      iconEl.className = `fa-solid ${icon}`;
    }

    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100');
    if (card) {
      card.classList.remove('scale-95');
      card.classList.add('scale-100');
    }

    setTimeout(() => {
      document.getElementById('delConfirmCancelBtn')?.focus();
    }, 50);
  });
}

function closeDeleteConfirmModal(isConfirmed = false) {
  const modal = document.getElementById('deleteConfirmModal');
  const card = document.getElementById('deleteConfirmCard');

  if (modal) {
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0', 'pointer-events-none');
    if (card) {
      card.classList.remove('scale-100');
      card.classList.add('scale-95');
    }
  }

  if (typeof _deleteConfirmResolver === 'function') {
    const resolve = _deleteConfirmResolver;
    _deleteConfirmResolver = null;
    resolve(!!isConfirmed);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _deleteConfirmResolver) {
    closeDeleteConfirmModal(false);
  }
});


// ==============================
// THEME (DARK / LIGHT)
// ==============================
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeUI(isDark);
  if (typeof renderDashboard === 'function' && document.getElementById('tab-dashboard')?.classList.contains('active')) {
    renderDashboard();
  }
}

function updateThemeUI(isDark) {
  if (isDark === undefined) {
    isDark = document.documentElement.classList.contains('dark');
  }
  const icon = document.getElementById('themeToggleIcon');
  const text = document.getElementById('themeToggleText');
  if (icon) {
    icon.className = isDark ? 'fa-solid fa-sun text-amber-400' : 'fa-solid fa-moon text-slate-300';
  }
  if (text) {
    text.textContent = isDark ? 'Sáng' : 'Tối';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateThemeUI();
});


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
  // 1. Render immediate skeleton state so the UI is responsive in 0ms without blank gaps
  renderDashboard(true);

  // 2. Concurrently fetch all datasets in parallel
  await Promise.allSettled([
    loadProducts(),
    loadOrders(),
    loadSuppliers(),
    loadReturns(),
    loadInventoryHistory()
  ]);

  // 3. Render fully loaded data once
  populateProductTypeFilter();
  renderDashboard(false);
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
  
  if (el) {
    el.classList.add('active');
  } else {
    // If no element passed, try to find the corresponding sidebar item and make it active
    const sidebarItem = document.querySelector(`.admin-sidebar-item[onclick*="adminTab('${tab}'"]`);
    if (sidebarItem) sidebarItem.classList.add('active');
  }

  if (tab === 'products') renderAdminTable();
  if (tab === 'orders') renderOrdersTable();
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'settings') loadSettingsForm();
  if (tab === 'slides') loadAdminSlides();
  if (tab === 'suppliers') loadSuppliersList();
  if (tab === 'returns') loadReturns();
  if (tab === 'tools') loadGeminiApiKeyToInput();
  if (tab === 'inventory') {
    loadInventoryHistory();
    Promise.all([loadProducts(), loadOrders()]).then(() => {
      if (typeof sk_filterAndRender === 'function') sk_filterAndRender();
    }).catch(() => {});
  }
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
  listEl.innerHTML = '<p class="text-slate-400 dark:text-slate-500 text-sm py-4">Đang tải...</p>';
  try {
    const res = await fetch('/api/slides');
    const slides = await res.json();
    if (slides.length === 0) {
      listEl.innerHTML = '<p class="text-slate-400 dark:text-slate-500 text-sm italic col-span-full py-8 text-center">Chưa có ảnh Hero Banner nào. Hãy tải lên ảnh mới.</p>';
      return;
    }
    listEl.innerHTML = slides.map(url => `
      <div class="slide-card-admin bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 flex flex-col group">
        <div class="h-32 bg-slate-100 dark:bg-slate-950 bg-cover bg-center border-b border-slate-100 dark:border-slate-800" style="background-image:url('${url}');"></div>
        <div class="p-3.5 flex flex-col gap-2.5 flex-1 justify-between bg-white dark:bg-slate-900">
          <code class="text-[11px] text-slate-600 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-800 overflow-hidden text-ellipsis whitespace-nowrap block" title="${url}">
            <i class="fa-regular fa-image text-slate-400 mr-1 text-[10px]"></i>${url.split('/').pop()}
          </code>
          <button class="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-500 text-rose-600 hover:text-white dark:bg-rose-950/40 dark:hover:bg-rose-600 dark:text-rose-400 dark:hover:text-white border border-rose-200/80 dark:border-rose-800/60 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-xs" onclick="deleteSlide('${url}')">
            <i class="fa-solid fa-trash-can text-[11px]"></i> Xóa Banner
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = '<p class="text-rose-500 text-sm col-span-full py-4 text-center"><i class="fa-solid fa-xmark"></i> Lỗi khi tải danh sách Hero Banner.</p>';
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
      showToast('<i class="fa-solid fa-xmark"></i> Tải lên banner thất bại', 'error');
      return;
    }
    statusEl.textContent = 'Chưa chọn file nào';
    event.target.value = '';
    await loadAdminSlides();
    showToast('<i class="fa-solid fa-circle-check"></i> Đã thêm ảnh Hero Banner mới', 'success');
  } catch (err) {
    statusEl.textContent = '<i class="fa-solid fa-xmark"></i> Lỗi kết nối.';
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
  }
}

async function deleteSlide(url) {
  const confirmed = await showDeleteConfirmModal({
    title: 'Xóa Hero Banner',
    target: 'Banner trình chiếu trang chủ',
    desc: 'Bạn có chắc chắn muốn xóa banner này? Hình ảnh sẽ không còn xuất hiện trên trang chủ và thao tác này không thể hoàn tác.',
    confirmText: 'Xóa banner'
  });
  if (!confirmed) return;
  try {
    const res = await adminFetch('/api/admin/slides', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast('<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Lỗi khi xóa banner'), 'error');
      return;
    }
    await loadAdminSlides();
    showToast('<i class="fa-solid fa-trash"></i> Đã xóa banner thành công', 'success');
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

let _dashLineChart = null;
let _dashDonutChart = null;
let _dashQuarterChart = null;

// ==============================
// DASHBOARD FILTER STATE & CONTROLLERS
// ==============================
let _currentDashboardFilter = {
  mode: 'days', // 'days' | 'quarter' | 'year'
  days: 30,
  year: new Date().getFullYear(),
  quarter: Math.floor(new Date().getMonth() / 3) + 1 // 1..4 or 'year'
};

const _customYearsSet = new Set();

function _getAllAvailableYears(selectedYear) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const yearSet = new Set();

  // 1. Broad standard range: past 10 years to future 5 years (e.g. 2016 to 2031)
  for (let y = currentYear + 5; y >= currentYear - 10; y--) {
    yearSet.add(y);
  }

  // 2. All years found in receipts
  (allInventoryReceipts || []).forEach(r => {
    const d = _parseReceiptDate(r);
    if (d) yearSet.add(d.getFullYear());
  });

  // 3. Any custom years entered by user
  _customYearsSet.forEach(y => yearSet.add(y));
  if (selectedYear && !isNaN(Number(selectedYear))) {
    yearSet.add(Number(selectedYear));
  }

  return Array.from(yearSet).sort((a, b) => b - a);
}

function initDashboardFilterBar(isLoading = false) {
  const yearSelect = document.getElementById('dashFilterYear');
  if (!yearSelect) return;

  const activeYear = _currentDashboardFilter.year || new Date().getFullYear();
  const sortedYears = _getAllAvailableYears(activeYear);

  yearSelect.innerHTML = sortedYears.map(y => `<option value="${y}">Năm ${y}</option>`).join('') +
    `<option value="custom">✏️ Nhập năm khác...</option>`;
  yearSelect.value = String(activeYear);

  _updateDashboardFilterUI(isLoading);
}

function _updateDashboardFilterUI(isLoading = false) {
  const filter = _getDashboardTimeFilterRange();
  const receipts = _getDashboardFilteredReceipts();
  const hasData = receipts.length > 0;

  // 1. Update active text label
  const labelEl = document.getElementById('dashFilterActiveLabel');
  if (labelEl) {
    if (isLoading && !hasData) {
      labelEl.innerHTML = `${filter.label} <span class="text-indigo-500 dark:text-indigo-400 font-medium ml-1"><i class="fa-solid fa-spinner fa-spin text-[10px]"></i> Đang tải...</span>`;
    } else if (!hasData) {
      labelEl.innerHTML = `${filter.label} <span class="text-amber-500 dark:text-amber-400 font-bold ml-1">(Chưa có dữ liệu)</span>`;
    } else {
      labelEl.textContent = filter.label;
    }
  }

  // 2. Update Quick buttons active styles
  document.querySelectorAll('#dashQuickPills .dash-quick-btn').forEach(btn => {
    const days = parseInt(btn.getAttribute('data-days'), 10);
    const isActive = _currentDashboardFilter.mode === 'days' && _currentDashboardFilter.days === days;
    if (isActive) {
      btn.className = 'dash-quick-btn px-2.5 sm:px-3 py-1 rounded-lg text-xs font-black bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700 cursor-pointer';
    } else {
      btn.className = 'dash-quick-btn px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer';
    }
  });

  // 3. Update Quarter buttons active styles
  document.querySelectorAll('#dashQuarterPills .dash-q-btn').forEach(btn => {
    const qAttr = btn.getAttribute('data-q');
    let isActive = false;
    if (_currentDashboardFilter.mode === 'year' && qAttr === 'year') {
      isActive = true;
    } else if (_currentDashboardFilter.mode === 'quarter' && String(_currentDashboardFilter.quarter) === qAttr) {
      isActive = true;
    }

    if (isActive) {
      btn.className = 'dash-q-btn px-2.5 sm:px-3 py-1 rounded-lg text-xs font-black bg-indigo-600 text-white shadow-2xs cursor-pointer';
    } else {
      btn.className = 'dash-q-btn px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer';
    }
  });

  // 4. Sync Year select
  const yearSelect = document.getElementById('dashFilterYear');
  if (yearSelect && _currentDashboardFilter.year) {
    yearSelect.value = String(_currentDashboardFilter.year);
  }
}

function setDashboardFilter(type, val) {
  if (type === 'days') {
    _currentDashboardFilter.mode = 'days';
    _currentDashboardFilter.days = Number(val);
    // Scroll to the daily KPI section after a short delay to let rendering finish
    setTimeout(() => {
      const kpiGrid = document.getElementById('dashboardKpiGrid');
      if (kpiGrid) {
        kpiGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  } else if (type === 'Q') {
    const yearSelect = document.getElementById('dashFilterYear');
    const selectedYear = yearSelect ? parseInt(yearSelect.value, 10) : _currentDashboardFilter.year;
    _currentDashboardFilter.year = selectedYear;

    if (val === 'year') {
      _currentDashboardFilter.mode = 'year';
      _currentDashboardFilter.quarter = 'year';
    } else {
      _currentDashboardFilter.mode = 'quarter';
      _currentDashboardFilter.quarter = parseInt(val, 10);
    }

    // Synchronize the Year in the lower Quarterly section
    const qYearSelect = document.getElementById('quarterYearSelect');
    if (qYearSelect && qYearSelect.value !== String(selectedYear)) {
      qYearSelect.value = String(selectedYear);
    }
  }

  _updateDashboardFilterUI();
  renderDashboard();
}

function onDashboardYearChange() {
  const yearSelect = document.getElementById('dashFilterYear');
  if (!yearSelect) return;

  if (yearSelect.value === 'custom') {
    const cur = _currentDashboardFilter.year || new Date().getFullYear();
    const input = prompt('Nhập năm bạn muốn xem (VD: 2012, 2035):', String(cur));
    if (input) {
      const parsedYear = parseInt(input.trim(), 10);
      if (!isNaN(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100) {
        _customYearsSet.add(parsedYear);
        _currentDashboardFilter.year = parsedYear;
        initDashboardFilterBar();
        setDashboardFilter('Q', _currentDashboardFilter.quarter || 1);
        return;
      } else {
        showToast('Năm không hợp lệ (hỗ trợ 1900 - 2100)', 'error');
      }
    }
    yearSelect.value = String(_currentDashboardFilter.year);
    return;
  }

  const newYear = parseInt(yearSelect.value, 10);
  _currentDashboardFilter.year = newYear;

  // If user changes year while in 'days' mode, default to Q1 or keep quarter
  if (_currentDashboardFilter.mode === 'days') {
    _currentDashboardFilter.mode = 'quarter';
    _currentDashboardFilter.quarter = 1;
  }

  setDashboardFilter('Q', _currentDashboardFilter.quarter || 1);
}

function stepDashboardYear(delta) {
  const cur = _currentDashboardFilter.year || new Date().getFullYear();
  const nextYear = cur + delta;
  if (nextYear < 1900 || nextYear > 2100) return;

  _customYearsSet.add(nextYear);
  _currentDashboardFilter.year = nextYear;

  if (_currentDashboardFilter.mode === 'days') {
    _currentDashboardFilter.mode = 'quarter';
    _currentDashboardFilter.quarter = 1;
  }

  initDashboardFilterBar();
  setDashboardFilter('Q', _currentDashboardFilter.quarter || 1);
}

function onQuarterYearSelectChange() {
  const qSelect = document.getElementById('quarterYearSelect');
  if (!qSelect) return;

  if (qSelect.value === 'custom') {
    const cur = _currentDashboardFilter.year || new Date().getFullYear();
    const input = prompt('Nhập năm thống kê bạn muốn xem (VD: 2012, 2035):', String(cur));
    if (input) {
      const parsedYear = parseInt(input.trim(), 10);
      if (!isNaN(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100) {
        _customYearsSet.add(parsedYear);
        _currentDashboardFilter.year = parsedYear;
        initDashboardFilterBar();
        renderQuarterSection();
        return;
      } else {
        showToast('Năm không hợp lệ (hỗ trợ 1900 - 2100)', 'error');
      }
    }
    qSelect.value = String(_currentDashboardFilter.year);
    return;
  }

  const newYear = parseInt(qSelect.value, 10);
  _currentDashboardFilter.year = newYear;

  const topYear = document.getElementById('dashFilterYear');
  if (topYear) topYear.value = String(newYear);

  renderQuarterSection();
}

function stepQuarterYear(delta) {
  const qSelect = document.getElementById('quarterYearSelect');
  const cur = parseInt(qSelect?.value || _currentDashboardFilter.year || new Date().getFullYear(), 10);
  const nextYear = cur + delta;
  if (nextYear < 1900 || nextYear > 2100) return;

  _customYearsSet.add(nextYear);
  _currentDashboardFilter.year = nextYear;

  initDashboardFilterBar();
  renderQuarterSection();
}

function _getDashboardTimeFilterRange() {
  if (_currentDashboardFilter.mode === 'quarter') {
    const q = _currentDashboardFilter.quarter;
    const y = _currentDashboardFilter.year;
    const startMonth = (q - 1) * 3;
    const endMonth = q * 3;
    const startDate = new Date(y, startMonth, 1, 0, 0, 0, 0);
    const endDate = new Date(y, endMonth, 0, 23, 59, 59, 999);
    const qMonths = q === 1 ? '01/01 - 31/03' : q === 2 ? '01/04 - 30/06' : q === 3 ? '01/07 - 30/09' : '01/10 - 31/12';
    return {
      type: 'quarter',
      quarter: q,
      year: y,
      label: `Quý ${q}/${y} (${qMonths})`,
      shortLabel: `Quý ${q}/${y}`,
      startDate,
      endDate
    };
  }

  if (_currentDashboardFilter.mode === 'year') {
    const y = _currentDashboardFilter.year;
    const startDate = new Date(y, 0, 1, 0, 0, 0, 0);
    const endDate = new Date(y, 11, 31, 23, 59, 59, 999);
    return {
      type: 'year',
      year: y,
      label: `Cả năm ${y}`,
      shortLabel: `Năm ${y}`,
      startDate,
      endDate
    };
  }

  // mode === 'days'
  const days = _currentDashboardFilter.days;
  if (days === 0) {
    return { type: 'all', label: 'Toàn bộ thời gian', shortLabel: 'Toàn thời gian', startDate: null, endDate: null };
  }

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  const label = days === 7 ? '7 ngày gần nhất' : days === 30 ? '30 ngày gần nhất' : days === 90 ? '3 tháng gần nhất' : '12 tháng gần nhất';
  return {
    type: 'days',
    days,
    label,
    shortLabel: label,
    startDate: cutoff,
    endDate: new Date()
  };
}

function renderDashboard(isLoading = false) {
  initDashboardFilterBar(isLoading);
  _renderDashboardKpis(isLoading);
  _renderDashboardCharts(isLoading);
  renderQuarterSection(isLoading);
  _renderDashboardTopSuppliers(isLoading);
  _renderDashboardReturns(isLoading);
}

function _parseReceiptDate(r) {
  if (r.import_date) {
    const raw = String(r.import_date).trim();
    const parts = raw.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (!isNaN(d.getTime())) return d;
      } else {
        // DD/MM/YYYY
        const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  if (r.created_at) {
    const d = new Date(r.created_at);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function _getDashboardFilteredReceipts() {
  if (!allInventoryReceipts || allInventoryReceipts.length === 0) return [];
  const filter = _getDashboardTimeFilterRange();

  if (filter.type === 'all') return allInventoryReceipts;

  return allInventoryReceipts.filter(r => {
    const d = _parseReceiptDate(r);
    if (!d) return false;
    if (filter.startDate && d < filter.startDate) return false;
    if (filter.endDate && d > filter.endDate) return false;
    return true;
  });
}

function _renderDashboardKpis(isLoading = false) {
  const grid = document.getElementById('dashboardKpiGrid');
  if (!grid) return;

  if (isLoading && (!allInventoryReceipts || allInventoryReceipts.length === 0)) {
    grid.innerHTML = Array.from({ length: 6 }).map(() => `
      <div class="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 animate-pulse">
        <div class="flex justify-between items-center mb-3">
          <div class="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div>
          <div class="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800"></div>
        </div>
        <div class="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded mb-1.5"></div>
        <div class="h-3 w-14 bg-slate-200 dark:bg-slate-800 rounded"></div>
      </div>
    `).join('');
    return;
  }

  const receipts = _getDashboardFilteredReceipts();
  const totalReceipts = receipts.length;
  const totalQty = receipts.reduce((s, r) => s + (Number(r.total_quantity) || Number(r.item_count) || 0), 0);
  const totalValue = receipts.reduce((s, r) => s + (Number(r.total_amount) || Number(r.total_cost) || 0), 0);
  const pendingOrders = orders.filter(o => o.status === 'Chờ xác nhận').length;
  const suppCount = suppliers.length;

  // Low stock count (stock <= 5 that are tracked)
  const lowStock = (typeof sk_filteredList !== 'undefined' && sk_filteredList.length > 0)
    ? sk_filteredList.filter(p => (p.stock !== undefined && p.stock <= 5 && p.status !== 'Ngừng theo dõi')).length
    : products.filter(p => (p.ton !== undefined && p.ton <= 5 && p.trangthai !== 'Ngừng theo dõi')).length;

  const kpiDefs = [
    {
      icon: 'fa-building', iconBg: '#eff6ff', iconColor: '#2563eb',
      label: 'Nhà cung cấp', value: suppCount.toLocaleString('vi-VN'),
      sub: 'Đang hợp tác', subColor: '#64748b',
      onclick: "adminTab('suppliers',null)"
    },
    {
      icon: 'fa-file-invoice', iconBg: '#f0fdf4', iconColor: '#16a34a',
      label: 'Số phiếu nhập kho', value: totalReceipts.toLocaleString('vi-VN'),
      sub: 'Kỳ: ' + _getDashboardTimeFilterRange().shortLabel, subColor: '#64748b',
      onclick: "adminTab('inventory',null)"
    },
    {
      icon: 'fa-boxes-stacked', iconBg: '#fdf4ff', iconColor: '#9333ea',
      label: 'Số lượng nhập', value: totalQty.toLocaleString('vi-VN'),
      sub: 'Tổng số lượng', subColor: '#64748b',
      onclick: ''
    },
    {
      icon: 'fa-sack-dollar', iconBg: '#fff7ed', iconColor: '#ea580c',
      label: 'Số tiền nhập kho', value: totalValue >= 1e9
        ? (totalValue / 1e9).toFixed(2) + ' tỷ'
        : totalValue >= 1e6
          ? (totalValue / 1e6).toFixed(1) + ' tr'
          : totalValue.toLocaleString('vi-VN') + '₫',
      sub: totalValue >= 1e6 ? totalValue.toLocaleString('vi-VN') + '₫' : '',
      subColor: '#64748b',
      onclick: ''
    },
    {
      icon: 'fa-clipboard-list', iconBg: '#fefce8', iconColor: '#ca8a04',
      label: 'Đơn hàng mới', value: pendingOrders.toLocaleString('vi-VN'),
      sub: 'Chờ xác nhận', subColor: pendingOrders > 0 ? '#dc2626' : '#64748b',
      onclick: "adminTab('orders',null)"
    },
    {
      icon: 'fa-triangle-exclamation', iconBg: '#fef2f2', iconColor: '#dc2626',
      label: 'Cảnh báo hàng tồn', value: lowStock.toLocaleString('vi-VN'),
      sub: 'Sắp hết hàng (≤5)', subColor: lowStock > 0 ? '#dc2626' : '#64748b',
      onclick: "adminTab('inventory',null)"
    }
  ];

  grid.innerHTML = kpiDefs.map(k => `
    <div onclick="${k.onclick ? k.onclick + ';' : ''}" class="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 ${k.onclick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-amber-400/40' : 'cursor-default'} transition-all duration-150 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate max-w-[80%]">${k.label}</span>
        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background:${k.iconBg};">
          <i class="fa-solid ${k.icon} text-xs" style="color:${k.iconColor};"></i>
        </div>
      </div>
      <div>
        <div class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">${k.value}</div>
        ${k.sub ? `<div class="text-[11px] font-medium mt-1 truncate" style="color:${k.subColor};" title="${k.sub}">${k.sub}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function _renderDashboardCharts(isLoading = false) {
  const receipts = _getDashboardFilteredReceipts();
  const filter = _getDashboardTimeFilterRange();

  const lineTitleEl = document.getElementById('dashLineChartTitle');
  if (lineTitleEl) {
    lineTitleEl.textContent = `Giá trị nhập kho (${filter.shortLabel})`;
  }
  const donutTitleEl = document.getElementById('dashDonutChartTitle');
  if (donutTitleEl) {
    donutTitleEl.textContent = `Cơ cấu giá trị theo NCC (${filter.shortLabel})`;
  }

  // Nếu đang loading và chưa có data receipts thì hiển thị placeholder nhẹ nhàng
  if (isLoading && (!allInventoryReceipts || allInventoryReceipts.length === 0)) {
    const lineEmptyEl = document.getElementById('dashboardLineEmptyState');
    const lineEmptyText = document.getElementById('dashboardLineEmptyText');
    if (lineEmptyEl) {
      if (lineEmptyText) lineEmptyText.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Đang tổng hợp dữ liệu biểu đồ...`;
      lineEmptyEl.classList.remove('hidden');
    }
    const centerEl = document.getElementById('dashboardDonutCenter');
    if (centerEl) {
      centerEl.innerHTML = `<div style="font-size:0.7rem;color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang tải...</div>`;
    }
    return;
  }

  // ─── Line Chart ───────────────────────────────────────────────────────
  const dailyMap = {};
  receipts.forEach(r => {
    const d = _parseReceiptDate(r);
    if (d) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const amount = Number(r.total_amount) || Number(r.total_cost) || 0;
      dailyMap[key] = (dailyMap[key] || 0) + amount;
    }
  });

  const sortedDays = Object.keys(dailyMap).sort();
  const lineLabels = sortedDays.map(d => {
    const [y, m, day] = d.split('-');
    return `${day}/${m}`;
  });
  const lineData = sortedDays.map(d => dailyMap[d]);

  const lineCtx = document.getElementById('dashboardLineChart');
  const lineEmptyEl = document.getElementById('dashboardLineEmptyState');
  const lineEmptyText = document.getElementById('dashboardLineEmptyText');

  if (lineData.length === 0) {
    if (_dashLineChart) { _dashLineChart.destroy(); _dashLineChart = null; }
    if (lineEmptyEl) {
      if (lineEmptyText) lineEmptyText.textContent = `Không có dữ liệu nhập kho trong ${filter.shortLabel}`;
      lineEmptyEl.classList.remove('hidden');
    }
  } else {
    if (lineEmptyEl) lineEmptyEl.classList.add('hidden');
    if (lineCtx) {
      if (_dashLineChart) { _dashLineChart.destroy(); _dashLineChart = null; }
      if (typeof Chart !== 'undefined') {
        try {
          const isDark = document.documentElement.classList.contains('dark');
          const gridColor = isDark ? 'rgba(255, 255, 255, 0.07)' : '#f1f5f9';
          const textColor = isDark ? '#94a3b8' : '#64748b';

          _dashLineChart = new Chart(lineCtx, {
            type: 'line',
            data: {
              labels: lineLabels,
              datasets: [{
                label: 'Giá trị nhập (₫)',
                data: lineData,
                borderColor: '#2563eb',
                backgroundColor: isDark ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.08)',
                borderWidth: 2,
                pointRadius: lineData.length <= 30 ? 3 : 0,
                pointHoverRadius: 5,
                tension: 0.35,
                fill: true,
              }]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              animation: { duration: 300 },
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: ctx => ' ' + Number(ctx.raw).toLocaleString('vi-VN') + '₫'
                  }
                }
              },
              scales: {
                x: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 }, maxTicksLimit: 10 } },
                y: {
                  grid: { color: gridColor },
                  ticks: {
                    color: textColor,
                    font: { size: 10 },
                    callback: v => v >= 1e9 ? (v/1e9).toFixed(1)+' tỷ' : v >= 1e6 ? (v/1e6).toFixed(0)+' tr' : v
                  }
                }
              }
            }
          });
        } catch (err) {
          console.warn('Lỗi vẽ biểu đồ line:', err);
        }
      }
    }
  }

  // ─── Donut Chart ─────────────────────────────────────────────────────
  const suppMap = {};
  receipts.forEach(r => {
    const name = (r.supplier_name || r.supplier_code || 'Khác').trim();
    const amount = Number(r.total_amount) || Number(r.total_cost) || 0;
    suppMap[name] = (suppMap[name] || 0) + amount;
  });

  const suppEntries = Object.entries(suppMap).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
  const TOP_N = 5;
  let donutLabels = [], donutData = [];
  if (suppEntries.length <= TOP_N) {
    donutLabels = suppEntries.map(e => e[0]);
    donutData = suppEntries.map(e => e[1]);
  } else {
    const top = suppEntries.slice(0, TOP_N);
    const othersTotal = suppEntries.slice(TOP_N).reduce((s, e) => s + e[1], 0);
    donutLabels = [...top.map(e => e[0]), 'Khác'];
    donutData = [...top.map(e => e[1]), othersTotal];
  }

  const COLORS = ['#2563eb','#7c3aed','#0891b2','#16a34a','#ea580c','#94a3b8'];
  const totalDonut = donutData.reduce((s, v) => s + v, 0);

  const donutCtx = document.getElementById('dashboardDonutChart');
  if (donutCtx) {
    if (_dashDonutChart) { _dashDonutChart.destroy(); _dashDonutChart = null; }
    if (donutData.length > 0 && totalDonut > 0 && typeof Chart !== 'undefined') {
      try {
        _dashDonutChart = new Chart(donutCtx, {
          type: 'doughnut',
          data: {
            labels: donutLabels,
            datasets: [{ data: donutData, backgroundColor: COLORS.slice(0, donutLabels.length), borderWidth: 2, borderColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#fff', hoverOffset: 4 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '65%',
            animation: { duration: 300 },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    const pct = totalDonut > 0 ? ((ctx.raw / totalDonut) * 100).toFixed(1) : 0;
                    return ` ${Number(ctx.raw).toLocaleString('vi-VN')}₫ (${pct}%)`;
                  }
                }
              }
            }
          }
        });
      } catch (err) {
        console.warn('Lỗi vẽ biểu đồ donut:', err);
      }
    }

    // Center label
    const centerEl = document.getElementById('dashboardDonutCenter');
    if (centerEl) {
      const isDark = document.documentElement.classList.contains('dark');
      const totalFmt = totalDonut >= 1e9
        ? (totalDonut / 1e9).toFixed(2) + ' tỷ'
        : totalDonut >= 1e6
          ? (totalDonut / 1e6).toFixed(1) + ' tr'
          : totalDonut.toLocaleString('vi-VN') + '₫';
      centerEl.innerHTML = totalDonut > 0
        ? `<div style="font-size:0.65rem;color:${isDark ? '#94a3b8' : '#64748b'};font-weight:500;">Tổng tiền</div><div style="font-size:0.95rem;font-weight:800;color:${isDark ? '#ffffff' : '#0f172a'};line-height:1.2;">${totalFmt}</div>`
        : `<div style="font-size:0.7rem;color:#94a3b8;">Không có dữ liệu</div>`;
    }

    // Legend
    const legendEl = document.getElementById('dashboardDonutLegend');
    if (legendEl) {
      const isDark = document.documentElement.classList.contains('dark');
      if (donutLabels.length === 0 || totalDonut === 0) {
        legendEl.innerHTML = `<div style="color:#94a3b8;font-size:0.8rem;">Chưa có dữ liệu nhà cung cấp</div>`;
      } else {
        legendEl.innerHTML = donutLabels.map((label, i) => {
          const pct = totalDonut > 0 ? ((donutData[i] / totalDonut) * 100).toFixed(1) : 0;
          const valFmt = donutData[i] >= 1e9
            ? (donutData[i] / 1e9).toFixed(2) + ' tỷ'
            : donutData[i] >= 1e6
              ? (donutData[i] / 1e6).toFixed(1) + ' tr'
              : donutData[i].toLocaleString('vi-VN') + '₫';
          return `
            <div style="display:flex;align-items:center;gap:6px;overflow:hidden;">
              <span style="width:10px;height:10px;min-width:10px;border-radius:50%;background:${COLORS[i] || '#94a3b8'};"></span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;color:${isDark ? '#cbd5e1' : '#374151'};" title="${label}">${label}</span>
              <span style="font-weight:700;color:${isDark ? '#f8fafc' : '#0f172a'};white-space:nowrap;">${valFmt}</span>
              <span style="color:#94a3b8;white-space:nowrap;">(${pct}%)</span>
            </div>
          `;
        }).join('');
      }
    }
  }
}

function filterDashboardByQuarter(year, quarter) {
  _currentDashboardFilter.year = parseInt(year, 10);
  const yearSelect = document.getElementById('dashFilterYear');
  if (yearSelect) yearSelect.value = String(year);

  setDashboardFilter('Q', quarter);

  const target = document.getElementById('dashboardKpiGrid') || document.getElementById('tab-dashboard');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  showToast(`<i class="fa-solid fa-filter"></i> Đang hiển thị chi tiết Quý ${quarter}/${year}`, 'success');
}

function renderQuarterSection(isLoading = false) {
  const container = document.getElementById('dashboardQuarterSection');
  if (!container) return;

  const yearSelect = document.getElementById('quarterYearSelect');
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  const selectedYear = parseInt(yearSelect?.value || _currentDashboardFilter.year || currentYear, 10);

  // 1. Populate all available years
  if (yearSelect) {
    const sortedYears = _getAllAvailableYears(selectedYear);
    yearSelect.innerHTML = sortedYears.map(y => `<option value="${y}">Năm ${y}</option>`).join('') +
      `<option value="custom">✏️ Nhập năm khác...</option>`;
    yearSelect.value = String(selectedYear);
  }

  const yearBadge = document.getElementById('quarterYearBadge');
  if (yearBadge) yearBadge.textContent = `Năm ${selectedYear}`;

  if (isLoading && (!allInventoryReceipts || allInventoryReceipts.length === 0)) {
    const cardsGrid = document.getElementById('quarterCardsGrid');
    if (cardsGrid) {
      cardsGrid.innerHTML = [1, 2, 3, 4].map(() => `
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 animate-pulse flex flex-col justify-between h-[180px]">
          <div>
            <div class="flex items-center justify-between gap-2 mb-3">
              <div class="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
              <div class="h-4 w-14 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
            </div>
            <div class="h-7 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg mb-2"></div>
            <div class="h-3 w-36 bg-slate-200 dark:bg-slate-800 rounded mb-3"></div>
            <div class="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full"></div>
          </div>
          <div class="h-8 w-full bg-slate-200 dark:bg-slate-800 rounded-xl mt-3"></div>
        </div>
      `).join('');
    }
    const chartSubtext = document.getElementById('quarterChartSubtext');
    if (chartSubtext) chartSubtext.innerHTML = `<span class="text-slate-400 font-medium"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang tải dữ liệu năm ${selectedYear}...</span>`;
    return;
  }

  // 2. Compute metrics for each quarter of selectedYear
  const quarterData = [1, 2, 3, 4].map(q => {
    const start = new Date(selectedYear, (q - 1) * 3, 1, 0, 0, 0, 0);
    const end = new Date(selectedYear, q * 3, 0, 23, 59, 59, 999);

    const qReceipts = (allInventoryReceipts || []).filter(r => {
      const d = _parseReceiptDate(r);
      return d && d >= start && d <= end;
    });

    const totalAmount = qReceipts.reduce((sum, r) => sum + (Number(r.total_amount) || Number(r.total_cost) || 0), 0);
    const totalQuantity = qReceipts.reduce((sum, r) => sum + (Number(r.total_quantity) || Number(r.item_count) || 0), 0);
    const receiptCount = qReceipts.length;

    let statusText = 'Đã kết thúc';
    let statusClass = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60';
    if (receiptCount === 0) {
      statusText = (selectedYear > currentYear || (selectedYear === currentYear && q > currentQuarter))
        ? 'Chưa tới'
        : 'Chưa có dữ liệu';
      statusClass = 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border border-slate-200/40 dark:border-slate-800';
    } else if (selectedYear === currentYear) {
      if (q === currentQuarter) {
        statusText = 'Đang diễn ra';
        statusClass = 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 font-extrabold';
      } else if (q > currentQuarter) {
        statusText = 'Chưa tới';
        statusClass = 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border border-slate-200/40 dark:border-slate-800';
      }
    } else if (selectedYear > currentYear) {
      statusText = 'Chưa tới';
      statusClass = 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border border-slate-200/40 dark:border-slate-800';
    }

    return {
      quarter: q,
      monthsShort: q === 1 ? 'Tháng 1 - 3' : q === 2 ? 'Tháng 4 - 6' : q === 3 ? 'Tháng 7 - 9' : 'Tháng 10 - 12',
      receiptCount,
      totalAmount,
      totalQuantity,
      statusText,
      statusClass
    };
  });

  const yearTotalAmount = quarterData.reduce((sum, q) => sum + q.totalAmount, 0);
  const yearTotalReceipts = quarterData.reduce((sum, q) => sum + q.receiptCount, 0);

  // QoQ Growth compared to preceding quarter
  const prevYearQ4Start = new Date(selectedYear - 1, 9, 1, 0, 0, 0, 0);
  const prevYearQ4End = new Date(selectedYear - 1, 12, 0, 23, 59, 59, 999);
  const prevYearQ4Receipts = (allInventoryReceipts || []).filter(r => {
    const d = _parseReceiptDate(r);
    return d && d >= prevYearQ4Start && d <= prevYearQ4End;
  });
  const prevYearQ4Amount = prevYearQ4Receipts.reduce((sum, r) => sum + (Number(r.total_amount) || Number(r.total_cost) || 0), 0);

  quarterData.forEach((qObj, index) => {
    const prevAmount = index === 0 ? prevYearQ4Amount : quarterData[index - 1].totalAmount;
    if (qObj.receiptCount === 0) {
      qObj.growthRate = 0;
      qObj.growthText = 'Chưa có dữ liệu';
      qObj.growthColor = 'text-slate-400 dark:text-slate-500';
      qObj.growthIcon = 'fa-minus';
    } else if (prevAmount > 0) {
      const rate = ((qObj.totalAmount - prevAmount) / prevAmount) * 100;
      qObj.growthRate = rate;
      qObj.growthText = (rate >= 0 ? `+${rate.toFixed(1)}%` : `${rate.toFixed(1)}%`) + ' so với quý trước';
      qObj.growthColor = rate > 0 ? 'text-emerald-600 dark:text-emerald-400' : rate < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400';
      qObj.growthIcon = rate > 0 ? 'fa-arrow-trend-up' : rate < 0 ? 'fa-arrow-trend-down' : 'fa-minus';
    } else if (qObj.totalAmount > 0) {
      qObj.growthRate = 100;
      qObj.growthText = '+100% tăng trưởng';
      qObj.growthColor = 'text-emerald-600 dark:text-emerald-400';
      qObj.growthIcon = 'fa-arrow-trend-up';
    } else {
      qObj.growthRate = 0;
      qObj.growthText = index === 0 ? 'Quý khởi đầu năm' : 'Không đổi';
      qObj.growthColor = 'text-slate-400 dark:text-slate-500';
      qObj.growthIcon = 'fa-minus';
    }
    qObj.percentage = yearTotalAmount > 0 ? Math.round((qObj.totalAmount / yearTotalAmount) * 100) : 0;
  });

  // 3. Render 4 Quarter Cards
  const cardsGrid = document.getElementById('quarterCardsGrid');
  if (cardsGrid) {
    cardsGrid.innerHTML = quarterData.map(q => {
      const isFilterActive = (_currentDashboardFilter.mode === 'quarter' &&
                              _currentDashboardFilter.year === selectedYear &&
                              _currentDashboardFilter.quarter === q.quarter);
      const amountFmt = q.totalAmount >= 1e9
        ? (q.totalAmount / 1e9).toFixed(2) + ' tỷ'
        : q.totalAmount >= 1e6
          ? (q.totalAmount / 1e6).toFixed(1) + ' tr'
          : q.totalAmount.toLocaleString('vi-VN') + '₫';

      return `
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border ${isFilterActive ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md' : 'border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/60'} transition-all shadow-xs flex flex-col justify-between group">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-black shrink-0">
                  Q${q.quarter}
                </span>
                <span class="text-xs font-extrabold text-slate-800 dark:text-slate-100">Quý ${q.quarter}</span>
                <span class="text-[10px] text-slate-400 font-medium truncate">(${q.monthsShort})</span>
              </div>
              <span class="text-[10px] px-2 py-0.5 rounded-full ${q.statusClass} shrink-0">
                ${q.statusText}
              </span>
            </div>

            <div class="mt-2.5">
              <div class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">${amountFmt}</div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                ${q.receiptCount > 0 ? `${q.receiptCount.toLocaleString('vi-VN')} phiếu · ${q.totalQuantity.toLocaleString('vi-VN')} sản phẩm` : 'Chưa có phát sinh nhập kho'}
              </div>
            </div>

            <div class="mt-3">
              <div class="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-semibold mb-1">
                <span>Tỷ trọng năm</span>
                <span class="font-bold text-slate-700 dark:text-slate-300">${q.percentage}%</span>
              </div>
              <div class="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div class="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500" style="width:${q.percentage}%"></div>
              </div>
            </div>

            <div class="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold ${q.growthColor}">
              <i class="fa-solid ${q.growthIcon} text-[10px]"></i>
              <span class="truncate">${q.growthText}</span>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <button type="button" onclick="filterDashboardByQuarter(${selectedYear}, ${q.quarter})"
              class="w-full py-2 px-3 rounded-xl border ${isFilterActive ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-400'} font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95">
              <i class="fa-solid ${isFilterActive ? 'fa-check' : 'fa-filter'} text-[11px]"></i>
              <span>${isFilterActive ? 'Đang lọc Quý này' : `Xem Dashboard Quý ${q.quarter}`}</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // 4. Render Chart
  const chartSubtext = document.getElementById('quarterChartSubtext');
  if (chartSubtext) {
    if (yearTotalReceipts === 0) {
      chartSubtext.innerHTML = `<span class="text-amber-500 dark:text-amber-400 font-bold"><i class="fa-solid fa-circle-exclamation text-[10px]"></i> Năm ${selectedYear}: Chưa có dữ liệu phát sinh</span>`;
    } else {
      const yearFmt = yearTotalAmount >= 1e9
        ? (yearTotalAmount / 1e9).toFixed(2) + ' tỷ'
        : (yearTotalAmount / 1e6).toFixed(1) + ' tr';
      chartSubtext.textContent = `Tổng năm ${selectedYear}: ${yearFmt} (${yearTotalReceipts} phiếu)`;
    }
  }

  const chartEmptyEl = document.getElementById('quarterChartEmptyState');
  const chartEmptyText = document.getElementById('quarterChartEmptyText');
  if (yearTotalReceipts === 0) {
    if (chartEmptyEl) {
      if (chartEmptyText) chartEmptyText.textContent = `Năm ${selectedYear} chưa có dữ liệu giao dịch nhập kho`;
      chartEmptyEl.classList.remove('hidden');
    }
  } else {
    if (chartEmptyEl) chartEmptyEl.classList.add('hidden');
  }

  const chartCanvas = document.getElementById('quarterComparisonChart');
  if (chartCanvas) {
    if (_dashQuarterChart) {
      _dashQuarterChart.destroy();
      _dashQuarterChart = null;
    }

    if (typeof Chart !== 'undefined') {
      try {
        const isDark = document.documentElement.classList.contains('dark');
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.07)' : '#f1f5f9';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        _dashQuarterChart = new Chart(chartCanvas, {
          data: {
            labels: ['Quý 1 (T1-T3)', 'Quý 2 (T4-T6)', 'Quý 3 (T7-T9)', 'Quý 4 (T10-T12)'],
            datasets: [
              {
                type: 'bar',
                label: 'Giá trị nhập (₫)',
                data: quarterData.map(q => q.totalAmount),
                backgroundColor: [
                  'rgba(79, 70, 229, 0.85)',
                  'rgba(14, 165, 233, 0.85)',
                  'rgba(16, 185, 129, 0.85)',
                  'rgba(245, 158, 11, 0.85)'
                ],
                borderRadius: 8,
                borderSkipped: false,
                yAxisID: 'y',
                order: 2
              },
              {
                type: 'line',
                label: 'Số phiếu nhập',
                data: quarterData.map(q => q.receiptCount),
                borderColor: '#ea580c',
                backgroundColor: '#ea580c',
                borderWidth: 2.5,
                pointBackgroundColor: '#ea580c',
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.25,
                yAxisID: 'y1',
                order: 1
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: {
                  boxWidth: 12,
                  font: { size: 11, weight: 'bold', family: '"Plus Jakarta Sans", sans-serif' },
                  color: textColor
                }
              },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    if (ctx.dataset.yAxisID === 'y') {
                      return ` Giá trị nhập: ${Number(ctx.raw).toLocaleString('vi-VN')}₫`;
                    } else {
                      return ` Số phiếu nhập: ${ctx.raw} phiếu`;
                    }
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: textColor, font: { size: 10, weight: '600' } }
              },
              y: {
                position: 'left',
                grid: { color: gridColor },
                ticks: {
                  color: textColor,
                  font: { size: 10 },
                  callback: v => v >= 1e9 ? (v/1e9).toFixed(1)+' tỷ' : v >= 1e6 ? (v/1e6).toFixed(0)+' tr' : v
                }
              },
              y1: {
                position: 'right',
                grid: { display: false },
                ticks: {
                  color: '#ea580c',
                  font: { size: 10 },
                  stepSize: 1,
                  callback: v => v + ' phiếu'
                }
              }
            }
          }
        });
      } catch (err) {
        console.warn('Lỗi vẽ biểu đồ so sánh quý:', err);
      }
    }
  }

  // 5. Render Insights
  const insightsContainer = document.getElementById('quarterInsightsContainer');
  if (insightsContainer) {
    if (yearTotalReceipts === 0) {
      insightsContainer.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-slate-500 my-auto">
          <div class="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-400 text-xl mb-3 border border-slate-200/60 dark:border-slate-700/60 shadow-2xs">
            <i class="fa-solid fa-folder-open"></i>
          </div>
          <p class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Năm ${selectedYear} chưa có dữ liệu</p>
          <p class="text-[11px] text-slate-400 max-w-[220px] leading-relaxed">Không tìm thấy chứng từ hoặc phiếu nhập kho nào trong năm ${selectedYear}.</p>
        </div>
      `;
    } else {
      const sortedByAmount = [...quarterData].sort((a, b) => b.totalAmount - a.totalAmount);
      const peakQuarter = sortedByAmount[0];
      const avgPerQuarter = yearTotalAmount / 4;

      const avgFmt = avgPerQuarter >= 1e9
        ? (avgPerQuarter / 1e9).toFixed(2) + ' tỷ'
        : avgPerQuarter >= 1e6
          ? (avgPerQuarter / 1e6).toFixed(1) + ' tr'
          : avgPerQuarter.toLocaleString('vi-VN') + '₫';

      const peakFmt = peakQuarter.totalAmount >= 1e9
        ? (peakQuarter.totalAmount / 1e9).toFixed(2) + ' tỷ'
        : peakQuarter.totalAmount >= 1e6
          ? (peakQuarter.totalAmount / 1e6).toFixed(1) + ' tr'
          : peakQuarter.totalAmount.toLocaleString('vi-VN') + '₫';

      const yearSuppMap = {};
      (allInventoryReceipts || []).forEach(r => {
        const d = _parseReceiptDate(r);
        if (d && d.getFullYear() === selectedYear) {
          const name = (r.supplier_name || 'Khác').trim();
          yearSuppMap[name] = (yearSuppMap[name] || 0) + (Number(r.total_amount) || Number(r.total_cost) || 0);
        }
      });
      const topYearSupp = Object.entries(yearSuppMap).sort((a, b) => b[1] - a[1])[0] || null;

      insightsContainer.innerHTML = `
        <div>
          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <i class="fa-solid fa-lightbulb text-amber-500"></i> Đánh giá hoạt động năm ${selectedYear}
            </span>
          </div>

          <div class="space-y-3 text-xs">
            <div class="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <div class="flex items-center justify-between mb-1">
                <span class="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                  <i class="fa-solid fa-crown text-amber-500 text-[10px]"></i> Quý cao điểm nhất
                </span>
                <span class="font-extrabold text-indigo-600 dark:text-indigo-400">Quý ${peakQuarter.quarter}</span>
              </div>
              <div class="text-sm font-black text-slate-900 dark:text-white">${peakFmt}</div>
              <div class="text-[10px] text-slate-400 mt-0.5">${peakQuarter.receiptCount} phiếu nhập (${peakQuarter.percentage}% tổng cả năm)</div>
            </div>

            <div class="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <div class="flex items-center justify-between mb-1">
                <span class="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                  <i class="fa-solid fa-calculator text-blue-500 text-[10px]"></i> Trung bình mỗi quý
                </span>
              </div>
              <div class="text-sm font-black text-slate-900 dark:text-white">${avgFmt}</div>
              <div class="text-[10px] text-slate-400 mt-0.5">Trung bình ${Math.round(yearTotalReceipts / 4)} phiếu / quý</div>
            </div>

            <div class="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <div class="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1 mb-1">
                <i class="fa-solid fa-truck-ramp-box text-emerald-500 text-[10px]"></i> NCC lớn nhất năm
              </div>
              <div class="font-extrabold text-slate-900 dark:text-white truncate" title="${topYearSupp ? topYearSupp[0] : 'Chưa có'}">
                ${topYearSupp ? topYearSupp[0] : 'Chưa có dữ liệu'}
              </div>
              <div class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                ${topYearSupp ? (topYearSupp[1] >= 1e6 ? (topYearSupp[1]/1e6).toFixed(1)+' tr' : topYearSupp[1].toLocaleString('vi-VN')+'₫') : ''}
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
          <button type="button" onclick="adminTab('inventory', null)"
            class="w-full py-2 px-3 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs">
            <i class="fa-solid fa-file-lines text-xs"></i> Xem tất cả phiếu nhập kho
          </button>
        </div>
      `;
    }
  }
}


function _renderDashboardTopSuppliers(isLoading = false) {
  const tbody = document.getElementById('dashboardTopSuppliersBody');
  if (!tbody) return;

  if (isLoading && (!allInventoryReceipts || allInventoryReceipts.length === 0)) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-6 text-slate-400 dark:text-slate-500">
          <i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang tải dữ liệu nhà cung cấp...
        </td>
      </tr>
    `;
    return;
  }

  const receipts = _getDashboardFilteredReceipts();

  if (receipts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8 text-slate-400 dark:text-slate-500">
          <i class="fa-solid fa-inbox text-2xl mb-1.5 opacity-40 block"></i>
          <span class="text-xs font-bold">Không có dữ liệu nhà cung cấp trong khoảng thời gian này</span>
        </td>
      </tr>
    `;
    return;
  }

  // Aggregate by normalized supplier name
  const aggMap = {};
  receipts.forEach(r => {
    const rawName = (r.supplier_name || 'Nhà cung cấp vãng lai').trim();
    const rawTax = (r.tax_code || '').trim();
    const key = rawName.toLowerCase();
    if (!aggMap[key]) {
      aggMap[key] = {
        name: rawName,
        tax_code: rawTax,
        receipts: 0,
        qty: 0,
        total: 0
      };
    }
    if (!aggMap[key].tax_code && rawTax) aggMap[key].tax_code = rawTax;
    aggMap[key].receipts++;
    aggMap[key].qty += (Number(r.total_quantity) || Number(r.item_count) || 0);
    aggMap[key].total += (Number(r.total_amount) || Number(r.total_cost) || 0);
  });

  const sorted = Object.values(aggMap).sort((a, b) => b.total - a.total).slice(0, 10);

  // Match supplier info from suppliers array
  const getSupplierInfo = (name, taxCode) => {
    const cleanName = (name || '').trim().toLowerCase();
    const cleanTax = (taxCode || '').trim().toLowerCase();
    const s = suppliers.find(sup => {
      const supCode = (sup.code || '').trim().toLowerCase();
      const supTax = (sup.tax_code || sup.taxCode || '').trim().toLowerCase();
      const supName = (sup.name || '').trim().toLowerCase();
      if (cleanTax && (supTax === cleanTax || supCode === cleanTax)) return true;
      if (cleanName && supName && (supName === cleanName || supName.includes(cleanName) || cleanName.includes(supName))) return true;
      return false;
    });
    return {
      code: s ? (s.code || s.tax_code || '—') : (cleanTax || '—'),
      name: s ? (s.name || name) : name,
      status: s ? (s.status || 'Đang hợp tác') : 'Đang hợp tác'
    };
  };

  const statusBadgeSupp = (s) => {
    if (!s || s === 'Đang hợp tác') return { text: 'Đang hợp tác', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
    if (s === 'Ngừng theo dõi' || s === 'Ngừng hợp tác') return { text: s, bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
    return { text: s, bg: '#fffbeb', color: '#d97706', border: '#fde68a' };
  };

  tbody.innerHTML = sorted.map((row, i) => {
    const suppInfo = getSupplierInfo(row.name, row.tax_code);
    const badge = statusBadgeSupp(suppInfo.status);
    const valFmt = row.total.toLocaleString('vi-VN');
    return `
      <tr style="border-bottom:1px solid #f1f5f9;transition:background .1s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
        <td style="padding:10px 12px;color:#94a3b8;font-weight:600;">${i + 1}</td>
        <td style="padding:10px 12px;"><code style="background:#f1f5f9;border-radius:4px;padding:2px 6px;font-size:0.75rem;color:#475569;">${suppInfo.code}</code></td>
        <td style="padding:10px 12px;font-weight:500;color:#0f172a;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${suppInfo.name}">${suppInfo.name}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:600;color:#374151;">${row.receipts.toLocaleString('vi-VN')}</td>
        <td style="padding:10px 12px;text-align:right;color:#374151;">${row.qty.toLocaleString('vi-VN')}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;color:#0f172a;">${valFmt}₫</td>
        <td style="padding:10px 12px;text-align:center;">
          <span style="display:inline-block;padding:3px 10px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:${badge.bg};color:${badge.color};border:1px solid ${badge.border};">${badge.text}</span>
        </td>
      </tr>
    `;
  }).join('');
}

function _getDashboardFilteredReturns() {
  if (!Array.isArray(orderReturns) || orderReturns.length === 0) return [];
  const filter = _getDashboardTimeFilterRange();
  if (filter.type === 'all') return orderReturns;

  return orderReturns.filter(ret => {
    let t = ret.timestamp;
    if (!t && ret.createdAt) {
      const match = String(ret.createdAt).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        t = new Date(parseInt(match[3], 10), parseInt(match[2], 10) - 1, parseInt(match[1], 10)).getTime();
      }
    }
    if (!t) return true;
    if (filter.startDate && t < filter.startDate.getTime()) return false;
    if (filter.endDate && t > filter.endDate.getTime()) return false;
    return true;
  });
}

function _renderDashboardReturns(isLoading = false) {
  const tbody = document.getElementById('dashboardReturnsBody');
  if (!tbody) return;

  if (isLoading && (!orderReturns || orderReturns.length === 0)) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-6 text-slate-400 dark:text-slate-500">
          <i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang tải dữ liệu phiếu trả hàng...
        </td>
      </tr>
    `;
    return;
  }

  const filtered = _getDashboardFilteredReturns();
  const listToDisplay = filtered.slice(0, 10);

  // Tính toán số liệu thống kê trả hàng
  let totalSlips = filtered.length;
  let totalRefund = 0;
  let totalQty = 0;
  let totalRestocked = 0;

  filtered.forEach(ret => {
    totalRefund += Number(ret.totalRefund) || 0;
    if (ret.restock) totalRestocked++;
    (ret.items || []).forEach(it => {
      totalQty += Number(it.returnQty) || 0;
    });
  });

  const countBadge = document.getElementById('dashReturnCountBadge');
  if (countBadge) countBadge.textContent = `${totalSlips} phiếu`;

  const kpiSlips = document.getElementById('dashReturnTotalSlips');
  if (kpiSlips) kpiSlips.textContent = totalSlips.toLocaleString('vi-VN');

  const kpiRefund = document.getElementById('dashReturnTotalRefund');
  if (kpiRefund) kpiRefund.textContent = formatPrice(totalRefund);

  const kpiQty = document.getElementById('dashReturnTotalQty');
  if (kpiQty) kpiQty.textContent = `${totalQty.toLocaleString('vi-VN')} SP`;

  const kpiRestocked = document.getElementById('dashReturnRestockedCount');
  if (kpiRestocked) kpiRestocked.textContent = `${totalRestocked} phiếu`;

  if (listToDisplay.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-8 text-slate-400 dark:text-slate-500">
          <i class="fa-solid fa-rotate-left text-2xl mb-1.5 opacity-40 block"></i>
          <span class="text-xs font-bold">Không có dữ liệu trả hàng trong khoảng thời gian này</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = listToDisplay.map((ret, index) => {
    const itemsSummary = (ret.items || []).map(it => `${it.ten || it.ma} (x${it.returnQty} ${it.donvi || ''})`).join(', ');
    const itemsCount = (ret.items || []).reduce((acc, cur) => acc + (Number(cur.returnQty) || 0), 0);
    const restockBadge = ret.restock
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"><i class="fa-solid fa-check text-[10px]"></i> Đã hoàn kho</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Không hoàn kho</span>`;

    return `
      <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition">
        <td class="py-3 px-3 text-center text-slate-400 font-medium">${index + 1}</td>
        <td class="py-3 px-3 font-mono font-bold whitespace-nowrap">
          <button type="button" onclick="viewReturnDetail('${ret.id}')" class="text-slate-900 dark:text-white hover:text-rose-600 dark:hover:text-rose-400 font-mono font-bold hover:underline transition cursor-pointer">
            ${ret.id}
          </button>
        </td>
        <td class="py-3 px-3 whitespace-nowrap">
          <button type="button" onclick="viewOrderDetail('${ret.orderId}')" class="text-indigo-600 dark:text-indigo-400 hover:underline font-mono font-bold flex items-center gap-1 cursor-pointer">
            <i class="fa-solid fa-receipt text-[11px]"></i> ${ret.orderId}
          </button>
        </td>
        <td class="py-3 px-3">
          <div class="font-bold text-slate-900 dark:text-white">${ret.customer || '—'}</div>
          <div class="text-[11px] text-slate-400 font-mono">${ret.phone || '—'}</div>
        </td>
        <td class="py-3 px-3 max-w-[220px] truncate" title="${itemsSummary}">
          <span class="font-bold text-slate-800 dark:text-slate-200">${itemsCount} SP:</span>
          <span class="text-slate-500 dark:text-slate-400">${itemsSummary}</span>
        </td>
        <td class="py-3 px-3 text-right font-black text-rose-600 dark:text-rose-400 whitespace-nowrap font-mono">
          ${formatPrice(ret.totalRefund || 0)}
        </td>
        <td class="py-3 px-3 text-center whitespace-nowrap">
          ${restockBadge}
        </td>
        <td class="py-3 px-3 max-w-[140px] truncate text-slate-700 dark:text-slate-300 font-medium" title="${ret.reason || ''}">
          ${ret.reason || '—'}
        </td>
        <td class="py-3 px-3 text-center text-slate-400 whitespace-nowrap text-[11px]">${ret.createdAt || '—'}</td>
        <td class="py-3 px-3 text-center whitespace-nowrap">
          <div class="flex items-center justify-center gap-1.5">
            <button class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs transition cursor-pointer" title="Xem chi tiết phiếu trả" onclick="viewReturnDetail('${ret.id}')">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs transition cursor-pointer" title="In phiếu trả hàng" onclick="printReturnSlip('${ret.id}')">
              <i class="fa-solid fa-print"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
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
  const upsellFilter = document.getElementById('adminUpsellFilter')?.value || '';

  let list = products.filter(p => {
    if (q && !p.ten.toLowerCase().includes(q) && !p.ma.toLowerCase().includes(q)) return false;
    if (typeFilter && p.loai !== typeFilter) return false;
    if (statusFilter && (p.trangthai || 'Đang theo dõi') !== statusFilter) return false;
    if (bestSellerFilter === 'yes' && !p.isBestSeller) return false;
    if (bestSellerFilter === 'no' && p.isBestSeller) return false;
    if (imageFilter === 'yes' && !p.image) return false;
    if (imageFilter === 'no' && p.image) return false;
    if (upsellFilter === 'yes' && p.enableUpsell === false) return false;
    if (upsellFilter === 'custom' && (p.enableUpsell === false || !Array.isArray(p.upsellProducts) || p.upsellProducts.length === 0)) return false;
    if (upsellFilter === 'no' && p.enableUpsell !== false) return false;
    return true;
  });

  const total = list.length;
  const pages = Math.ceil(total / ITEMS_PER_PAGE);
  if (adminPage > pages) adminPage = Math.max(1, pages);
  const paged = list.slice((adminPage - 1) * ITEMS_PER_PAGE, adminPage * ITEMS_PER_PAGE);

  document.getElementById('adminProductCount').textContent = total;
  document.getElementById('adminTable').innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Ảnh</th><th>Mã SP</th><th>Tên sản phẩm</th><th>Giá bán</th><th>ĐVT</th><th>Loại</th><th>Trạng thái</th><th>BÁN CHẠY</th><th style="text-align:center">Thao tác</th></tr></thead>
      <tbody>${paged.map((p, i) => `
        <tr>
          <td>${(adminPage - 1) * ITEMS_PER_PAGE + i + 1}</td>
          <td>${p.image ? `<img src="${getProductImageUrl(p)}" style="width:40px;height:40px;object-fit:cover;border-radius:4px" />` : '<i class="fa-solid fa-box"></i>'}</td>
          <td><code style="font-size:.78rem;background:var(--bg);padding:2px 6px;border-radius:4px">${p.ma}</code></td>
          <td style="max-width:320px;line-height:1.3">
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600" title="${p.ten.replace(/"/g, '&quot;')}">${p.ten}</div>
            ${p.enableUpsell !== false ? `
              <div style="margin-top:3px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">
                <span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:#fef3c7;color:#92400e;border:1px solid #fde68a" title="Tiêu chí Up-sell: ${p.upsellCriteria || 'Ma trận ngành hàng'} (${Array.isArray(p.upsellProducts) ? p.upsellProducts.length : 0} SP chỉ định)">
                  <i class="fa-solid fa-arrow-trend-up text-amber-500" style="font-size:9px"></i>
                  ${p.upsellCriteria ? p.upsellCriteria : 'Up-sell'}
                  ${Array.isArray(p.upsellProducts) && p.upsellProducts.length > 0 ? `<span style="opacity:0.85">(${p.upsellProducts.length} SP)</span>` : ''}
                </span>
              </div>
            ` : ''}
          </td>
          <td style="font-weight:700;color:var(--primary)">${formatPrice(p.gia)}</td>
          <td>${p.donvi || '-'}</td>
          <td><span class="badge ${p.loai === 'Hàng hóa dịch vụ' ? 'badge-green' : 'badge-blue'}">${p.loai || '-'}</span></td>
          <td><span class="badge ${p.trangthai === 'Ngừng theo dõi' ? 'badge-red' : 'badge-yellow'}">${p.trangthai || 'Đang theo dõi'}</span></td>
          <td style="text-align:center">
            <input type="checkbox" ${p.isBestSeller ? 'checked' : ''} onchange="toggleBestSeller('${p.ma.replace(/'/g, "\\'")}', this.checked)" style="width:18px;height:18px;cursor:pointer">
          </td>
          <td style="text-align:center">
            <div class="row-actions">
              <button class="btn-act btn-act-edit" onclick="openProductModal('${p.ma.replace(/'/g, "\\'")}')" title="Sửa sản phẩm">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn-act btn-act-delete" onclick="deleteProduct('${p.ma.replace(/'/g, "\\'")}')" title="Xóa sản phẩm">
                <i class="fa-solid fa-trash-can"></i>
              </button>
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
// UP-SELLING & UPGRADE CRITERIA CONFIGURATION
// ==============================
let currentModalUpsellProducts = [];

function toggleUpsellSettingsSection(enabled) {
  const body = document.getElementById('pf_upsell_body');
  if (body) {
    body.style.opacity = enabled ? '1' : '0.4';
    body.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

function handleUpsellCriteriaChange(val) {
  const customInput = document.getElementById('pf_customUpsellCriteria');
  if (!customInput) return;
  if (val === 'custom') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
  }
}

function searchUpsellCandidates(kw) {
  const resDiv = document.getElementById('pf_upsellSearchResults');
  if (!resDiv) return;
  const term = (kw || '').trim().toLowerCase();
  if (!term) {
    resDiv.style.display = 'none';
    resDiv.innerHTML = '';
    return;
  }

  const currentMa = document.getElementById('pf_ma')?.value.trim();
  const selectedSet = new Set(currentModalUpsellProducts);

  const matched = (products || []).filter(p => {
    if (p.ma === currentMa) return false;
    if (selectedSet.has(p.ma)) return false;
    return p.ten.toLowerCase().includes(term) || p.ma.toLowerCase().includes(term);
  }).slice(0, 8);

  if (matched.length === 0) {
    resDiv.innerHTML = '<div class="p-3 text-center text-slate-400">Không tìm thấy sản phẩm phù hợp</div>';
    resDiv.style.display = 'block';
    return;
  }

  resDiv.innerHTML = matched.map(p => `
    <div onclick="addUpsellCandidate('${p.ma.replace(/'/g, "\\'")}')" 
      class="p-2 hover:bg-amber-50 dark:hover:bg-slate-700/60 rounded-lg cursor-pointer flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/40 last:border-0 transition">
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-8 h-8 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
          ${p.image ? `<img src="${getProductImageUrl(p)}" class="w-full h-full object-cover" />` : '<i class="fa-solid fa-box text-slate-400 text-xs"></i>'}
        </div>
        <div class="min-w-0">
          <div class="font-bold text-slate-800 dark:text-white truncate text-xs">${p.ten}</div>
          <div class="text-[10px] text-slate-400 font-mono">${p.ma} · ${formatPrice(p.gia)}</div>
        </div>
      </div>
      <button type="button" class="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-[11px] rounded flex items-center gap-1 flex-shrink-0 cursor-pointer">
        <i class="fa-solid fa-plus text-[10px]"></i> Chọn
      </button>
    </div>
  `).join('');
  resDiv.style.display = 'block';
}

function addUpsellCandidate(ma) {
  if (currentModalUpsellProducts.length >= 4) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Tối đa 4 sản phẩm Up-sell cho mỗi mặt hàng', 'warning');
    return;
  }
  if (!currentModalUpsellProducts.includes(ma)) {
    currentModalUpsellProducts.push(ma);
  }
  const searchInput = document.getElementById('pf_upsellSearch');
  if (searchInput) searchInput.value = '';
  const resDiv = document.getElementById('pf_upsellSearchResults');
  if (resDiv) {
    resDiv.style.display = 'none';
    resDiv.innerHTML = '';
  }
  renderSelectedUpsellBadges();
}

function removeUpsellProduct(ma) {
  currentModalUpsellProducts = currentModalUpsellProducts.filter(x => x !== ma);
  renderSelectedUpsellBadges();
}

function renderSelectedUpsellBadges() {
  const container = document.getElementById('pf_selectedUpsellList');
  const countEl = document.getElementById('pf_upsellSelectedCount');
  if (!container) return;

  if (countEl) {
    countEl.textContent = `Đã chọn: ${currentModalUpsellProducts.length}/4`;
  }

  if (currentModalUpsellProducts.length === 0) {
    container.innerHTML = '<div class="text-center py-2 text-slate-400 text-xs italic" id="pf_noUpsellNotice">Chưa chọn sản phẩm liên kết nào (Hệ thống sẽ tự động dùng ma trận ngành hàng thông minh).</div>';
    return;
  }

  container.innerHTML = currentModalUpsellProducts.map((ma, idx) => {
    const p = (products || []).find(x => x.ma === ma) || { ma, ten: 'Sản phẩm không xác định', gia: 0 };
    return `
      <div class="flex items-center justify-between gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black flex items-center justify-center flex-shrink-0">${idx + 1}</span>
          <div class="w-8 h-8 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
            ${p.image ? `<img src="${getProductImageUrl(p)}" class="w-full h-full object-cover" />` : '<i class="fa-solid fa-box text-slate-400 text-xs"></i>'}
          </div>
          <div class="min-w-0">
            <div class="text-xs font-bold text-slate-800 dark:text-white truncate">${p.ten}</div>
            <div class="text-[10px] text-slate-400 font-mono">${p.ma} · <span class="text-amber-600 font-bold">${formatPrice(p.gia)}</span></div>
          </div>
        </div>
        <button type="button" onclick="removeUpsellProduct('${ma.replace(/'/g, "\\'")}')" class="w-7 h-7 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center text-xs transition cursor-pointer" title="Gỡ khỏi danh sách">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
  }).join('');
}

document.addEventListener('click', (e) => {
  const searchWrap = document.getElementById('pf_upsellSearch');
  const resDiv = document.getElementById('pf_upsellSearchResults');
  if (resDiv && searchWrap && !searchWrap.contains(e.target) && !resDiv.contains(e.target)) {
    resDiv.style.display = 'none';
  }
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

  // Up-selling Configuration Loading
  const enableUpsellEl = document.getElementById('pf_enableUpsell');
  if (enableUpsellEl) {
    enableUpsellEl.checked = p ? (p.enableUpsell !== false) : true;
    toggleUpsellSettingsSection(enableUpsellEl.checked);
  }

  const criteriaSelect = document.getElementById('pf_upsellCriteria');
  const customCriteriaInput = document.getElementById('pf_customUpsellCriteria');
  if (criteriaSelect && customCriteriaInput) {
    const criteriaVal = p?.upsellCriteria || '';
    const presetOptions = [
      'Công suất / Tải lớn hơn',
      'Dòng cao cấp / Độ bền cao',
      'Quy cách lớn hơn tiết kiệm hơn',
      'Phụ kiện thi công đồng bộ khuyên dùng',
      'Combo đầy đủ dụng cụ lắp đặt'
    ];
    if (presetOptions.includes(criteriaVal)) {
      criteriaSelect.value = criteriaVal;
      customCriteriaInput.style.display = 'none';
      customCriteriaInput.value = '';
    } else if (criteriaVal) {
      criteriaSelect.value = 'custom';
      customCriteriaInput.style.display = 'block';
      customCriteriaInput.value = criteriaVal;
    } else {
      criteriaSelect.value = '';
      customCriteriaInput.style.display = 'none';
      customCriteriaInput.value = '';
    }
  }

  currentModalUpsellProducts = Array.isArray(p?.upsellProducts) ? [...p.upsellProducts] : [];
  const searchInput = document.getElementById('pf_upsellSearch');
  if (searchInput) searchInput.value = '';
  const searchRes = document.getElementById('pf_upsellSearchResults');
  if (searchRes) {
    searchRes.style.display = 'none';
    searchRes.innerHTML = '';
  }
  renderSelectedUpsellBadges();

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

    // Up-selling fields
    const enableUpsellEl = document.getElementById('pf_enableUpsell');
    const enableUpsell = enableUpsellEl ? enableUpsellEl.checked : true;
    const criteriaSelect = document.getElementById('pf_upsellCriteria');
    const customCriteriaInput = document.getElementById('pf_customUpsellCriteria');
    let upsellCriteria = '';
    if (criteriaSelect) {
      upsellCriteria = criteriaSelect.value === 'custom' 
        ? (customCriteriaInput?.value.trim() || '') 
        : criteriaSelect.value.trim();
    }
    const upsellProducts = JSON.stringify(currentModalUpsellProducts);

    formData.append('enableUpsell', enableUpsell);
    formData.append('upsellCriteria', upsellCriteria);
    formData.append('upsellProducts', upsellProducts);

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
    if (typeof sk_filterAndRender === 'function') sk_filterAndRender();
    showToast(isEdit ? '<i class="fa-solid fa-circle-check"></i> Đã cập nhật sản phẩm' : '<i class="fa-solid fa-circle-check"></i> Đã thêm sản phẩm', 'success');
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
  }
}

async function deleteProduct(ma) {
  const p = (products || []).find(x => x.ma === ma);
  const targetLabel = p ? `${p.ma} - ${p.ten}` : `Mã sản phẩm: ${ma}`;
  const confirmed = await showDeleteConfirmModal({
    title: 'Xoá vĩnh viễn sản phẩm',
    target: targetLabel,
    desc: 'Bạn có chắc chắn muốn xoá vĩnh viễn sản phẩm này khỏi hệ thống? Toàn bộ dữ liệu, lịch sử và hình ảnh của sản phẩm sẽ bị xoá.',
    confirmText: 'Xoá sản phẩm'
  });
  if (!confirmed) return;
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
    if (typeof sk_filterAndRender === 'function') sk_filterAndRender();
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

function formatOrderDateText(str) {
  if (!str) return '—';
  if (typeof str === 'string' && str.includes('<')) {
    const tmp = document.createElement('div');
    tmp.innerHTML = str;
    return tmp.textContent.replace(/\s+/g, ' ').trim() || '—';
  }
  // Pattern 1: HH:mm[:ss] DD/MM/YYYY
  const m1 = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) {
    const time = `${m1[1].padStart(2, '0')}:${m1[2]}`;
    const date = `${m1[4].padStart(2, '0')}/${m1[5].padStart(2, '0')}/${m1[6]}`;
    return `${date} ${time}`;
  }
  // Pattern 2: DD/MM/YYYY[, ] HH:mm
  const m2 = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})/);
  if (m2) {
    const date = `${m2[1].padStart(2, '0')}/${m2[2].padStart(2, '0')}/${m2[3]}`;
    const time = `${m2[4].padStart(2, '0')}:${m2[5]}`;
    return `${date} ${time}`;
  }
  return str;
}

function formatOrderDateOnly(str) {
  if (!str) return '—';
  if (typeof str === 'string' && str.includes('<')) {
    const tmp = document.createElement('div');
    tmp.innerHTML = str;
    str = tmp.textContent.replace(/\s+/g, ' ').trim();
  }
  // Pattern 1: HH:mm[:ss] DD/MM/YYYY
  const m1 = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) return `${m1[4].padStart(2, '0')}/${m1[5].padStart(2, '0')}/${m1[6]}`;
  // Pattern 2: DD/MM/YYYY
  const m2 = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return `${m2[1].padStart(2, '0')}/${m2[2].padStart(2, '0')}/${m2[3]}`;
  // Pattern 3: YYYY-MM-DD
  const m3 = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m3) return `${m3[3]}/${m3[2]}/${m3[1]}`;
  return str;
}

function changeOrderPageSize(size) {
  ORDERS_PER_PAGE = parseInt(size) || 10;
  orderPage = 1;
  renderOrdersTable();
}

async function resetOrderFilters(btn) {
  const searchInput = document.getElementById('orderSearch');
  const dateFromInput = document.getElementById('orderDateFrom');
  const dateToInput = document.getElementById('orderDateTo');
  const statusFilter = document.getElementById('orderStatusFilter');
  if (searchInput) searchInput.value = '';
  if (dateFromInput) dateFromInput.value = '';
  if (dateToInput) dateToInput.value = '';
  if (statusFilter) statusFilter.value = '';
  orderPage = 1;

  // Hiệu ứng icon quay
  const icon = (btn && btn.querySelector('i')) || document.querySelector('button[onclick*="resetOrderFilters"] i');
  if (icon) icon.classList.add('fa-spin');

  try {
    await loadOrders();
    renderOrdersTable();
    showToast('<i class="fa-solid fa-circle-check"></i> Đã làm mới danh sách đơn hàng', 'success');
  } catch (err) {
    console.error('Lỗi khi tải lại đơn hàng:', err);
    showToast('<i class="fa-solid fa-xmark"></i> Không thể tải lại đơn hàng', 'error');
  } finally {
    if (icon) icon.classList.remove('fa-spin');
  }
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
    <table class="w-full text-xs">
      <thead>
        <tr>
          <th style="width:30px;text-align:center">#</th>
          <th style="white-space:nowrap">Mã đơn</th>
          <th>Khách hàng</th>
          <th style="white-space:nowrap">SĐT</th>
          <th>Địa chỉ</th>
          <th style="white-space:nowrap;text-align:center">Sản phẩm</th>
          <th style="white-space:nowrap">Tổng tiền</th>
          <th style="white-space:nowrap;text-align:center">Ngày đặt</th>
          <th style="white-space:nowrap;text-align:center">Trạng thái</th>
          <th style="white-space:nowrap;text-align:center;width:145px">Thao tác</th>
        </tr>
      </thead>
      <tbody>${pagedOrders.map((o, i) => `
        <tr class="order-row">
          <td style="color:var(--muted);font-size:.75rem;text-align:center">${(orderPage - 1) * ORDERS_PER_PAGE + i + 1}</td>
          <td style="white-space:nowrap;font-weight:700">${o.id}</td>
          <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.customer}">${o.customer}</td>
          <td style="white-space:nowrap;font-family:monospace;font-size:.78rem">${o.phone}</td>
          <td style="max-width:120px;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.address}">${o.address}</td>
          <td style="white-space:nowrap;text-align:center"><span class="order-detail font-bold" style="font-size:.78rem">${o.items.length} SP</span></td>
          <td style="white-space:nowrap;font-weight:700;color:var(--primary);font-size:.8rem">
            <div>${formatPrice(o.total)}</div>
            ${(o.freeShipping || o.total >= 300000) ? `
              <div class="mt-0.5">
                <span class="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/70" title="Đơn hàng đủ điều kiện miễn phí giao hàng KV Thốt Nốt (≥ 300.000đ)">
                  <i class="fa-solid fa-truck-fast text-[9px]"></i> Freeship
                </span>
              </div>
            ` : ''}
          </td>
          <td style="white-space:nowrap;text-align:center">${formatOrderDate(o.createdAt)}</td>
          <td style="white-space:nowrap;text-align:center"><span class="badge ${statusBadge(o.status)}">${o.status}</span></td>
          <td style="white-space:nowrap;text-align:center">
            <div class="row-actions order-actions">
              <button class="btn-act btn-act-view" title="Xem chi tiết" onclick="viewOrderDetail('${o.id}')">
                <i class="fa-solid fa-eye"></i>
              </button>
              ${o.status === 'Chờ xác nhận' || o.status === 'Đã xác nhận'
      ? `<button class="btn-act btn-act-print" title="In hóa đơn" onclick="printOrderInvoice('${o.id}')"><i class="fa-solid fa-print"></i></button>`
      : ''
    }
              ${o.status === 'Đã xác nhận'
      ? `<button class="btn-act btn-act-return" title="Tạo phiếu trả hàng" onclick="initiateReturnForOrder('${o.id}')"><i class="fa-solid fa-rotate-left"></i></button>`
      : ''
    }
              ${o.status === 'Chờ xác nhận'
      ? `<button class="btn-act btn-act-confirm" title="Xác nhận đơn" onclick="updateOrderStatus('${o.id}','Đã xác nhận', this)"><i class="fa-solid fa-circle-check"></i></button>`
      : ''
    }
              ${o.status === 'Chờ xác nhận'
      ? `<button class="btn-act btn-act-delete" title="Huỷ đơn" onclick="updateOrderStatus('${o.id}','Đã huỷ', this)"><i class="fa-solid fa-xmark"></i></button>`
      : o.status === 'Đã huỷ'
        ? `<button class="btn-act btn-act-delete" title="Xóa vĩnh viễn" onclick="deleteOrder('${o.id}')"><i class="fa-solid fa-trash-can"></i></button>`
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
  const confirmed = await showDeleteConfirmModal({
    title: 'Xoá vĩnh viễn đơn hàng',
    target: `Đơn hàng #${id}`,
    desc: `Bạn có chắc chắn muốn xoá vĩnh viễn đơn hàng ${id}? Toàn bộ chi tiết giỏ hàng và lịch sử đơn sẽ bị xoá hoàn toàn khỏi hệ thống.`,
    confirmText: 'Xoá đơn hàng'
  });
  if (!confirmed) return;
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
    await Promise.all([loadOrders(), loadProducts()]);
    renderOrdersTable();
    renderDashboard();
    renderAdminTable();
    if (typeof sk_filterAndRender === 'function') sk_filterAndRender();
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
  const confirmed = await showDeleteConfirmModal({
    title: 'Dọn sạch đơn hàng đã huỷ',
    target: `Tổng cộng ${cancelledCount} đơn hàng đã huỷ`,
    desc: `Bạn có chắc chắn muốn xoá vĩnh viễn toàn bộ ${cancelledCount} đơn hàng đã huỷ? Thao tác này không thể hoàn tác!`,
    confirmText: `Xoá ${cancelledCount} đơn`
  });
  if (!confirmed) return;
  try {
    const res = await adminFetch('/api/admin/orders-cancelled/all', { method: 'DELETE' });
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast('<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Lỗi xoá đơn hàng'), 'error');
      return;
    }
    await Promise.all([loadOrders(), loadProducts()]);
    orderPage = 1;
    renderOrdersTable();
    renderDashboard();
    renderAdminTable();
    if (typeof sk_filterAndRender === 'function') sk_filterAndRender();
    showToast(`<i class="fa-solid fa-trash"></i> Đã xoá ${data.deleted} đơn hàng đã huỷ`, 'success');
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
  }
}

async function updateOrderStatus(id, status, triggerBtn = null) {
  const btn = triggerBtn || document.querySelector(`button[onclick*="updateOrderStatus('${id}'"]`);
  let icon = null;
  let originalIconClass = '';
  let siblingButtons = [];

  if (btn) {
    btn.disabled = true;
    icon = btn.querySelector('i');
    if (icon) {
      originalIconClass = icon.className;
      icon.className = 'fa-solid fa-circle-notch fa-spin text-amber-500';
    }
    const row = btn.closest('tr') || btn.closest('div');
    if (row) {
      siblingButtons = Array.from(row.querySelectorAll('button.btn-act, button.btn'));
      siblingButtons.forEach(b => b.disabled = true);
    }
  }

  const actionName = status === 'Đã xác nhận' ? 'Đang xác nhận đơn' : (status === 'Đã huỷ' ? 'Đang huỷ đơn' : 'Đang cập nhật');
  showToast(`<i class="fa-solid fa-spinner fa-spin"></i> ${actionName} ${id}...`, 'info');

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
      if (btn) btn.disabled = false;
      if (icon && originalIconClass) icon.className = originalIconClass;
      siblingButtons.forEach(b => b.disabled = false);
      return;
    }

    // 1. Cập nhật state cục bộ ngay lập tức (< 10ms)
    const localOrder = orders.find(x => x.id === id);
    if (localOrder) {
      localOrder.status = status;
    }

    // 2. Render lại bảng đơn hàng ngay lập tức
    renderOrdersTable();

    // 3. Thông báo hoàn tất
    const successMsg = status === 'Đã xác nhận' ? `Đã xác nhận đơn ${id} thành công!` : `Đã huỷ đơn ${id}!`;
    showToast(`<i class="fa-solid fa-circle-check"></i> ${successMsg}`, 'success');

    // 4. Đồng bộ nền số lượng tồn kho & KPI mà không gây đơ màn hình
    Promise.all([loadOrders(), loadProducts()])
      .then(() => {
        renderDashboard();
        renderAdminTable();
        if (typeof sk_filterAndRender === 'function') sk_filterAndRender();
      })
      .catch(console.warn);

  } catch (err) {
    console.error('Lỗi cập nhật trạng thái đơn:', err);
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
    if (btn) btn.disabled = false;
    if (icon && originalIconClass) icon.className = originalIconClass;
    siblingButtons.forEach(b => b.disabled = false);
  }
}

function viewOrderDetail(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  const titleEl = document.getElementById('od_modalTitle');
  if (titleEl) titleEl.textContent = `Chi tiết đơn hàng [#${o.id}]`;

  const totalQty = (o.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const subtotal = (o.items || []).reduce((s, it) => s + (it.gia || 0) * (it.qty || 0), 0);
  const discount = Number(o.discount || 0);
  const shipping = Number(o.shippingFee || o.shipping || 0);
  const grandTotal = Number(o.total || (subtotal - discount + shipping));

  const orderReturnsList = (orderReturns || []).filter(r => r.orderId === o.id);
  const totalRefunded = orderReturnsList.reduce((sum, r) => sum + (Number(r.totalRefund) || 0), 0);

  // Điều kiện miễn phí giao hàng: đơn >= 300.000đ hoặc cờ freeShipping
  const FREE_SHIPPING_THRESHOLD = 300000;
  const isFreeShipping = Boolean(o.freeShipping || o.isFreeShipping || subtotal >= FREE_SHIPPING_THRESHOLD || grandTotal >= FREE_SHIPPING_THRESHOLD);

  document.getElementById('orderDetailBody').innerHTML = `
    <div class="space-y-4">
      <!-- Info Cards (Stitch Style) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 text-xs">
        <div>
          <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Mã đơn hàng</span>
          <span class="font-mono font-extrabold text-slate-900 dark:text-amber-400 text-sm">#${o.id}</span>
        </div>
        <div>
          <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Ngày đặt hàng</span>
          <strong class="font-bold text-slate-800 dark:text-slate-200">${formatOrderDateText(o.createdAt)}</strong>
        </div>
        <div>
          <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Khách hàng</span>
          <div class="font-bold text-slate-900 dark:text-white truncate">${o.customer || 'Khách lẻ'}</div>
          ${o.phone ? `<div class="font-mono text-slate-500 dark:text-slate-400 text-[11px]">${o.phone}</div>` : ''}
        </div>
        <div>
          <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Vận chuyển</span>
          ${isFreeShipping ? `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              <i class="fa-solid fa-truck-fast text-emerald-600 dark:text-emerald-400"></i> Miễn ship
            </span>
            <div class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">Đạt chuẩn (≥ 300k)</div>
          ` : `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
              <i class="fa-solid fa-truck text-slate-400"></i> Tiêu chuẩn
            </span>
            <div class="text-[10px] text-slate-400 mt-0.5">Chưa đạt miễn ship</div>
          `}
        </div>
        <div>
          <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Trạng thái</span>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
            o.status === 'Đã xác nhận'
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
              : (o.status === 'Đã huỷ'
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30')
          }">
            <span class="w-1.5 h-1.5 rounded-full ${
              o.status === 'Đã xác nhận' ? 'bg-emerald-500' : (o.status === 'Đã huỷ' ? 'bg-rose-500' : 'bg-amber-500 animate-pulse')
            }"></span>
            ${o.status}
          </span>
        </div>
      </div>

      <!-- Delivery Info & Notes -->
      <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-xs space-y-2 text-slate-600 dark:text-slate-300 shadow-xs">
        <div class="flex items-baseline gap-2">
          <span class="text-slate-400 font-medium">Địa chỉ giao hàng:</span>
          <strong class="text-slate-900 dark:text-white font-semibold">${o.address || '—'}</strong>
        </div>
        ${o.note ? `
          <div class="flex items-baseline gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span class="text-slate-400 font-medium">Ghi chú đơn hàng:</span>
            <span class="text-slate-900 dark:text-white italic">${o.note}</span>
          </div>
        ` : ''}

        <!-- Free shipping highlight banner -->
        ${isFreeShipping ? `
          <div class="mt-2.5 p-3 bg-emerald-50/90 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/90 dark:border-emerald-800/60 flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2.5">
              <span class="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm flex-shrink-0">
                <i class="fa-solid fa-truck-fast"></i>
              </span>
              <div>
                <strong class="text-emerald-800 dark:text-emerald-300 font-extrabold text-xs block">
                  Đơn hàng ĐỦ ĐIỀU KIỆN Miễn phí giao hàng (Khu vực Thốt Nốt)
                </strong>
                <span class="text-emerald-600/90 dark:text-emerald-400/90 text-[11px]">
                  Giá trị đơn hàng đạt ${formatPrice(subtotal || grandTotal)} (vượt mốc 300.000đ). Cửa hàng hỗ trợ giao hàng miễn phí.
                </span>
              </div>
            </div>
            <span class="text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white px-2.5 py-1 rounded-lg shadow-xs flex-shrink-0 flex items-center gap-1">
              <i class="fa-solid fa-circle-check"></i> ĐẠT CHUẨN FREESHIP
            </span>
          </div>
        ` : `
          <div class="mt-2 p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/70 dark:border-slate-700/60 flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
            <i class="fa-solid fa-circle-info text-slate-400"></i>
            <span>Giao hàng tính cước tiêu chuẩn (Cần thêm <strong>${formatPrice(Math.max(0, FREE_SHIPPING_THRESHOLD - (subtotal || grandTotal)))}</strong> để đạt mức miễn ship 300.000đ KV Thốt Nốt).</span>
          </div>
        `}
      </div>

      <!-- Return slips alert if exists -->
      ${orderReturnsList.length > 0 ? `
        <div class="p-3.5 bg-rose-50/80 dark:bg-rose-950/40 rounded-2xl border border-rose-200/80 dark:border-rose-800/60 text-xs text-rose-950 dark:text-rose-200 flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-arrow-rotate-left text-rose-500"></i>
            <span>Đơn hàng này đã có <strong>${orderReturnsList.length}</strong> phiếu trả hàng (Tổng hoàn: <strong class="text-rose-600 dark:text-rose-400 font-mono font-bold">${formatPrice(totalRefunded)}</strong>).</span>
          </div>
          <button type="button" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition active:scale-95 cursor-pointer" onclick="adminTab('returns');closeModal('orderDetailModal')">
            Xem danh sách trả hàng
          </button>
        </div>
      ` : ''}

      <!-- Items Table (Stitch Style) -->
      <div class="overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[11px] tracking-wider">
            <tr>
              <th class="py-3 px-3 text-left">#</th>
              <th class="py-3 px-3 text-left">Mã SP</th>
              <th class="py-3 px-3 text-left">Tên sản phẩm</th>
              <th class="py-3 px-3 text-center">ĐVT</th>
              <th class="py-3 px-3 text-right">Đơn giá</th>
              <th class="py-3 px-3 text-center">SL</th>
              <th class="py-3 px-4 text-right">Thành tiền</th>
              <th class="py-3 px-3 text-left">Ghi chú SP</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            ${o.items.map((item, idx) => `
              <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                <td class="py-3 px-3 text-slate-400">${idx + 1}</td>
                <td class="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">${item.ma || '—'}</td>
                <td class="py-3 px-3 font-semibold text-slate-900 dark:text-white" style="min-width:180px">${item.ten}</td>
                <td class="py-3 px-3 text-center text-slate-500">${item.donvi || '—'}</td>
                <td class="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">${formatPrice(item.gia)}</td>
                <td class="py-3 px-3 text-center font-bold text-slate-900 dark:text-white">${item.qty}</td>
                <td class="py-3 px-4 text-right font-black text-amber-600 dark:text-amber-400 font-mono">${formatPrice(item.gia * item.qty)}</td>
                <td class="py-3 px-3 text-slate-400 italic text-[11px]">${item.note || '—'}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot class="bg-slate-50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700 text-xs">
            <tr class="border-b border-slate-200/60 dark:border-slate-700/60">
              <td colspan="5" class="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400 font-semibold">Tạm tính tiền hàng (${totalQty} sản phẩm):</td>
              <td class="py-2.5 px-3 text-center font-bold text-slate-700 dark:text-slate-300">${totalQty}</td>
              <td class="py-2.5 px-4 text-right font-bold text-slate-800 dark:text-slate-200 font-mono">${formatPrice(subtotal)}</td>
              <td></td>
            </tr>
            <tr class="border-b border-slate-200/60 dark:border-slate-700/60">
              <td colspan="6" class="py-2 px-3 text-right text-slate-500 dark:text-slate-400 font-semibold">Cước vận chuyển (KV Thốt Nốt):</td>
              <td class="py-2 px-4 text-right font-black font-mono">
                ${isFreeShipping
                  ? '<span class="text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1"><i class="fa-solid fa-truck-fast text-xs"></i> 0đ (Miễn ship)</span>'
                  : (shipping > 0 ? formatPrice(shipping) : '<span class="text-slate-400 font-normal">Chưa tính cước</span>')}
              </td>
              <td></td>
            </tr>
            <tr class="text-sm">
              <td colspan="5" class="py-3 px-3 text-right text-slate-800 dark:text-slate-100 font-black">Tổng cộng thanh toán:</td>
              <td class="py-3 px-3 text-center font-black text-slate-900 dark:text-white">${totalQty}</td>
              <td class="py-3 px-4 text-right font-black text-amber-600 dark:text-amber-400 text-base font-mono">${formatPrice(grandTotal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Actions Bar (Stitch Style) -->
      <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 flex-wrap gap-2">
        <div class="flex items-center gap-2 flex-wrap">
          ${o.status === 'Đã xác nhận' ? `
            <button type="button" onclick="printOrderInvoice('${o.id}')"
              class="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-450 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer active:scale-95">
              <i class="fa-solid fa-print"></i> In Hóa Đơn (A4/A5)
            </button>
            <button type="button" onclick="initiateReturnForOrder('${o.id}');closeModal('orderDetailModal')"
              class="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-450 hover:to-rose-500 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-500/20 transition flex items-center gap-2 cursor-pointer active:scale-95">
              <i class="fa-solid fa-arrow-rotate-left"></i> Trả hàng
            </button>
          ` : ''}
          ${o.status === 'Chờ xác nhận' ? `
            <button type="button" onclick="updateOrderStatus('${o.id}','Đã xác nhận', this);closeModal('orderDetailModal')"
              class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95">
              <i class="fa-solid fa-circle-check"></i> Xác nhận đơn
            </button>
            <button type="button" onclick="updateOrderStatus('${o.id}','Đã huỷ', this);closeModal('orderDetailModal')"
              class="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95">
              <i class="fa-solid fa-xmark"></i> Huỷ đơn
            </button>
          ` : ''}
          <button type="button" onclick="createOrderFromExisting('${o.id}');closeModal('orderDetailModal')"
            class="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition flex items-center gap-2 cursor-pointer">
            <i class="fa-solid fa-copy"></i> Tạo đơn mới từ đơn này
          </button>
        </div>
        <button type="button" onclick="closeModal('orderDetailModal')"
          class="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer">
          Đóng
        </button>
      </div>
    </div>
  `;
  document.getElementById('orderDetailModal').classList.add('open');
}

// ==============================
// IN HÓA ĐƠN BÁN HÀNG (A4/A5 - STITCH DESIGN)
// ==============================
async function printOrderInvoice(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  // Lấy thông tin cửa hàng từ settings
  let shopName = 'CỬA HÀNG ĐIỆN NƯỚC & VẬT TƯ HỮU TÁNH';
  let shopPhone = '0945 592 209';
  let shopAddress = 'Thị trấn Thốt Nốt, Q. Thốt Nốt, TP. Cần Thơ';
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    if (s.shopName) shopName = s.shopName;
    if (s.phone) shopPhone = s.phone;
    if (s.address) shopAddress = s.address;
  } catch (_) { }

  // Định dạng ngày in hóa đơn (chỉ giữ ngày, bỏ giờ)
  const now = new Date();
  const printDate = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;

  // Tính tổng tiền hàng (trước giảm giá)
  const subtotal = (o.items || []).reduce((s, item) => s + (item.gia || 0) * (item.qty || 0), 0);
  const discount = Number(o.discount || 0);
  const shipping = Number(o.shippingFee || o.shipping || 0);
  const grandTotal = Number(o.total || (subtotal - discount + shipping));
  const totalQty = (o.items || []).reduce((s, item) => s + (Number(item.qty) || 0), 0);
  const isFreeShipping = Boolean(o.freeShipping || o.isFreeShipping || subtotal >= 300000 || grandTotal >= 300000);

  // Địa chỉ + tọa độ
  const shippingAddress = o.shippingAddress || o.address || '';
  const customerName = o.customerName || o.customer || 'Khách lẻ';

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Hóa Đơn Bán Hàng - ${o.id}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Times New Roman", Times, serif; padding: 14mm 15mm; color: #000; line-height: 1.45; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
    .store-name { font-size: 18px; font-weight: bold; color: #000; text-transform: uppercase; }
    .store-sub { font-size: 13px; color: #333; margin-top: 2px; }
    .slip-meta { text-align: right; }
    .slip-code { font-weight: bold; font-size: 16px; color: #000; }
    .title { text-align: center; font-size: 22px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; color: #000; }
    .sub-title { text-align: center; font-size: 13px; color: #333; margin-bottom: 20px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-bottom: 20px; background: #fff; padding: 14px 18px; border-radius: 8px; border: 1px solid #ccc; font-size: 13.5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #fff; }
    th, td { border: 1px solid #555; padding: 7px 8px; font-size: 13px; background: #fff; }
    th { background: #fff; font-weight: bold; text-align: center; font-size: 13px; white-space: nowrap; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .total-row { font-weight: bold; font-size: 13.5px; background: #fff; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; margin-top: 36px; padding-top: 10px; }
    .sig-block { font-size: 13px; }
    .sig-role { font-weight: bold; color: #000; }
    .sig-sub { color: #555; font-size: 12px; margin-top: 2px; font-style: italic; }
    .sig-space { height: 75px; }
    .footer-note { text-align: center; font-size: 12px; color: #555; margin-top: 25px; border-top: 1px dashed #ccc; padding-top: 10px; font-style: italic; }
    @media print {
      body { padding: 14mm 15mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="store-name">${shopName}</div>
      ${shopAddress ? `<div class="store-sub">${shopAddress}</div>` : ''}
      ${shopPhone ? `<div class="store-sub" style="white-space:nowrap">Hotline: ${shopPhone}</div>` : ''}
    </div>
    <div class="slip-meta">
      <div class="slip-code">#${o.id}</div>
      <div style="color:#555;font-size:12px;margin-top:2px">Ngày in: ${printDate}</div>
    </div>
  </div>

  <div class="title">HÓA ĐƠN BÁN HÀNG</div>
  <div class="sub-title">(Ngày đặt hàng: <strong style="color:#000">${formatOrderDateOnly(o.createdAt)}</strong>)</div>

  <div class="info-grid">
    <div><strong>Khách hàng:</strong> ${customerName}</div>
    <div><strong>Số điện thoại:</strong> ${o.phone || '—'}</div>
    <div><strong>Vận chuyển:</strong> ${isFreeShipping ? '<span style="color:#16a34a;font-weight:bold">Miễn phí giao hàng</span>' : 'Giao hàng tiêu chuẩn'}</div>
    <div><strong>Phương thức:</strong> Thanh toán khi nhận hàng (COD)</div>
    <div style="grid-column: span 2"><strong>Địa chỉ giao hàng:</strong> ${shippingAddress || 'Nhận tại cửa hàng'}
      ${o.coordinates || o.coords || o.lat ? `<span style="font-size:12px;color:#555;margin-left:6px">(Tọa độ: ${o.coordinates || o.coords || `${o.lat}, ${o.lng}`})</span>` : ''}
    </div>
    ${o.note ? `<div style="grid-column: span 2"><strong>Ghi chú:</strong> ${o.note}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:38px;text-align:center;white-space:nowrap">STT</th>
        <th style="width:120px;text-align:center;white-space:nowrap">Mã SP</th>
        <th style="min-width:150px;text-align:center">Tên sản phẩm</th>
        <th style="width:55px;text-align:center;white-space:nowrap">ĐVT</th>
        <th style="width:90px;text-align:center;white-space:nowrap">Đơn giá</th>
        <th style="width:75px;text-align:center;white-space:nowrap">Số lượng</th>
        <th style="width:105px;text-align:center;white-space:nowrap">Thành tiền</th>
        <th style="width:80px;text-align:center;white-space:nowrap">Ghi chú</th>
      </tr>
    </thead>
    <tbody>
      ${(o.items || []).map((item, idx) => `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td style="font-weight:600;white-space:nowrap">${item.ma || '—'}</td>
          <td>${item.ten || ''}</td>
          <td class="text-center" style="white-space:nowrap">${item.donvi || 'Cái'}</td>
          <td class="text-right" style="white-space:nowrap">${item.gia ? item.gia.toLocaleString('vi-VN') + '₫' : 'Liên hệ'}</td>
          <td class="text-center" style="font-weight:700;white-space:nowrap">${item.qty}</td>
          <td class="text-right" style="font-weight:700;white-space:nowrap">${item.gia ? (item.gia * item.qty).toLocaleString('vi-VN') + '₫' : '—'}</td>
          <td style="font-size:11px;color:#64748b">${item.note || ''}</td>
        </tr>
      `).join('')}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="5" class="text-right">Tổng tiền hàng:</td>
        <td class="text-center" style="font-weight:700;white-space:nowrap">${totalQty}</td>
        <td class="text-right" style="font-weight:700;white-space:nowrap">${subtotal.toLocaleString('vi-VN')}₫</td>
        <td></td>
      </tr>
      ${discount > 0 ? `
        <tr class="total-row">
          <td colspan="6" class="text-right">Giảm giá chiết khấu:</td>
          <td class="text-right" style="font-weight:700;color:#16a34a;white-space:nowrap">-${discount.toLocaleString('vi-VN')}₫</td>
          <td></td>
        </tr>
      ` : ''}
      ${isFreeShipping ? `
        <tr class="total-row">
          <td colspan="6" class="text-right" style="color:#16a34a;font-weight:700">Phí vận chuyển (Miễn phí giao hàng KV Thốt Nốt):</td>
          <td class="text-right" style="font-weight:700;color:#16a34a;white-space:nowrap">0₫</td>
          <td></td>
        </tr>
      ` : (shipping > 0 ? `
        <tr class="total-row">
          <td colspan="6" class="text-right">Phí vận chuyển:</td>
          <td class="text-right" style="font-weight:700;white-space:nowrap">+${shipping.toLocaleString('vi-VN')}₫</td>
          <td></td>
        </tr>
      ` : '')}
      <tr class="total-row" style="background:#fff;font-size:13.5px;border-top:2px solid #000">
        <td colspan="6" class="text-right" style="font-weight:bold">TỔNG CỘNG THANH TOÁN:</td>
        <td class="text-right" style="color:#b91c1c;font-weight:bold;font-size:14px;white-space:nowrap">${grandTotal.toLocaleString('vi-VN')}₫</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-role">Người mua hàng</div>
      <div class="sig-sub">(Ký & ghi rõ họ tên)</div>
      <div class="sig-space"></div>
    </div>
    <div class="sig-block">
      <div class="sig-role">Người giao hàng</div>
      <div class="sig-sub">(Ký & ghi rõ họ tên)</div>
      <div class="sig-space"></div>
    </div>
    <div class="sig-block">
      <div class="sig-role">Người lập hóa đơn</div>
      <div class="sig-sub">(Ký & ghi rõ họ tên)</div>
      <div class="sig-space"></div>
    </div>
  </div>

  <div class="footer-note">
    <strong>Cảm ơn quý khách đã tin tưởng và mua hàng tại ${shopName}!</strong><br>
    Vui lòng giữ hóa đơn để đối chiếu và đổi/trả hàng trong vòng 7 ngày kể từ ngày mua.
  </div>

  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=880,height=960');
  if (!win) {
    showToast('Trình duyệt đã chặn cửa sổ in (Pop-up). Vui lòng cấp quyền mở pop-up.', 'warning');
    return;
  }
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

function hideToast() {
  const t = document.getElementById('toast');
  if (t) {
    t.classList.remove('show');
    clearTimeout(toastTimer);
  }
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;

  const cleanText = msg.replace(/<[^>]*>?/gm, '').trim();
  const isError = type === 'error';
  const isInfo = type === 'info';

  let title = 'Thông báo';
  let iconClass = 'fa-solid fa-circle-info';
  let iconColorClass = 'text-sky-400 bg-sky-500/20';
  let accentClass = isError ? 'toast-error' : (isInfo ? 'toast-info' : 'toast-success');

  if (isError) {
    title = 'Thông báo lỗi';
    iconClass = 'fa-solid fa-circle-exclamation';
    iconColorClass = 'text-rose-400 bg-rose-500/20';
  } else if (type === 'success') {
    title = 'Thành công';
    iconClass = 'fa-solid fa-circle-check';
    iconColorClass = 'text-amber-400 bg-amber-500/20';
  }

  t.className = `toast ${accentClass}`;
  t.innerHTML = `
    <div class="toast-card">
      <div class="toast-accent-line"></div>
      <div class="w-8 h-8 rounded-xl ${iconColorClass} flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5">
        <i class="${iconClass}"></i>
      </div>
      <div class="flex-1 min-w-0 pr-1">
        <div class="text-xs font-bold text-white leading-tight uppercase tracking-wider">${title}</div>
        <div class="text-[12px] text-slate-300 font-medium leading-relaxed mt-0.5 break-words line-clamp-2">${cleanText}</div>
      </div>
      <button onclick="hideToast()" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80 transition flex-shrink-0 text-xs" title="Đóng">✕</button>
      <div class="toast-progress"></div>
    </div>
  `;

  void t.offsetWidth;
  t.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
  }, 3500);
}

// ==============================
// INIT
// ==============================
checkAuth();

['productModal', 'orderDetailModal', 'stockPendingOrdersModal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('open');
    });
  }
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
    if (typeof sk_filterAndRender === 'function') sk_filterAndRender();
  } else if (topic === 'orders') {
    console.log('⚡ Nhận cập nhật đơn hàng...');
    await Promise.all([loadOrders(), loadProducts()]);
    renderOrdersTable();
    renderDashboard();
    renderAdminTable();
    if (typeof sk_filterAndRender === 'function') sk_filterAndRender();
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

function renderSelectedInvoiceFiles() {
  const listEl = document.getElementById('invoiceFilesList');
  const btnProcess = document.getElementById('btnProcessInvoices');
  const btnProcessNoAi = document.getElementById('btnProcessInvoicesNoAi');
  const btnClear = document.getElementById('btnClearInvoices');
  const uploadText = document.getElementById('invoiceUploadText');

  if (!listEl || !uploadText) return;

  if (selectedInvoiceFiles.length > 0) {
    uploadText.innerHTML = `Đã chọn <strong>${selectedInvoiceFiles.length} file</strong> hóa đơn (Nhấn Xử lý bên dưới)`;
    listEl.style.display = 'block';
    listEl.innerHTML = `
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">
        ${selectedInvoiceFiles.map((f, idx) => {
          const isPDF = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
          const isXML = f.type === 'text/xml' || f.type === 'application/xml' || f.name.toLowerCase().endsWith('.xml');
          let icon = '<i class="fa-solid fa-file-image" style="color: #3b82f6; font-size: 1rem;"></i>';
          if (isPDF) {
            icon = '<i class="fa-solid fa-file-pdf" style="color: #ef4444; font-size: 1rem;"></i>';
          } else if (isXML) {
            icon = '<i class="fa-solid fa-file-code" style="color: #10b981; font-size: 1rem;"></i>';
          }
          const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
          return `
            <div class="selected-invoice-file-item inline-flex items-center gap-2 max-w-full bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-2xs transition-all">
              ${icon}
              <span class="font-semibold text-slate-800 dark:text-slate-200 text-xs sm:text-sm max-w-[280px] truncate" title="${f.name}">${f.name}</span>
              <span class="text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap font-medium">(${sizeMB} MB)</span>
              <button type="button" onclick="removeSelectedInvoiceFile(${idx})" title="Xoá file này" class="bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 rounded-lg px-2 py-0.5 text-xs font-bold cursor-pointer inline-flex items-center gap-1 transition-all active:scale-95 ml-1">
                <i class="fa-solid fa-xmark"></i> Xoá
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;
    if (btnProcess) btnProcess.removeAttribute('disabled');
    if (btnProcessNoAi) btnProcessNoAi.removeAttribute('disabled');
    if (btnClear) btnClear.style.display = 'inline-block';
  } else {
    clearInvoiceSelection();
  }
}

function removeSelectedInvoiceFile(index) {
  if (index >= 0 && index < selectedInvoiceFiles.length) {
    const removed = selectedInvoiceFiles.splice(index, 1);
    if (removed.length > 0) {
      showToast(`<i class="fa-solid fa-circle-check"></i> Đã xoá file: ${removed[0].name}`, 'info');
    }
  }
  renderSelectedInvoiceFiles();
}

function filterAndSetInvoiceFiles(filesList) {
  for (let i = 0; i < filesList.length; i++) {
    const file = filesList[i];
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isXML = file.type === 'text/xml' || file.type === 'application/xml' || file.name.toLowerCase().endsWith('.xml');
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|jfif)$/i.test(file.name);

    if (isPDF || isXML || isImage) {
      if (file.size <= 5 * 1024 * 1024) {
        // Prevent duplicate files based on name and size
        if (!selectedInvoiceFiles.some(f => f.name === file.name && f.size === file.size)) {
          selectedInvoiceFiles.push(file);
        }
      } else {
        showToast(`<i class="fa-solid fa-triangle-exclamation"></i> File ${file.name} vượt quá 5MB.`, 'error');
      }
    } else {
      showToast(`<i class="fa-solid fa-triangle-exclamation"></i> File ${file.name} không phải định dạng PDF, XML hoặc hình ảnh.`, 'error');
    }
  }

  renderSelectedInvoiceFiles();
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
  const fileInput = document.getElementById('invoiceFileInput');
  if (fileInput) fileInput.value = '';
  const uploadText = document.getElementById('invoiceUploadText');
  if (uploadText) uploadText.innerHTML = 'Kéo thả file PDF, XML, hình ảnh vào đây, hoặc nhấn để chọn file (Hỗ trợ Ctrl+V)';
  const filesList = document.getElementById('invoiceFilesList');
  if (filesList) {
    filesList.style.display = 'none';
    filesList.innerHTML = '';
  }
  const btnProcess = document.getElementById('btnProcessInvoices');
  if (btnProcess) btnProcess.setAttribute('disabled', 'true');
  const btnProcessNoAi = document.getElementById('btnProcessInvoicesNoAi');
  if (btnProcessNoAi) btnProcessNoAi.setAttribute('disabled', 'true');
  const btnClear = document.getElementById('btnClearInvoices');
  if (btnClear) btnClear.style.display = 'none';
}

async function processInvoices(mode = 'ai') {
  if (selectedInvoiceFiles.length === 0) return;

  const btnProcess = document.getElementById('btnProcessInvoices');
  const btnProcessNoAi = document.getElementById('btnProcessInvoicesNoAi');
  const btnClear = document.getElementById('btnClearInvoices');
  const statusEl = document.getElementById('invoiceProcessingStatus');
  const statusText = document.getElementById('invoiceStatusText');
  const resultsContainer = document.getElementById('invoiceResultsContainer');

  // Trạng thái đang tải
  if (btnProcess) btnProcess.setAttribute('disabled', 'true');
  if (btnProcessNoAi) btnProcessNoAi.setAttribute('disabled', 'true');
  if (btnClear) btnClear.style.display = 'none';
  if (statusText) {
    statusText.textContent = mode === 'direct'
      ? 'Đang đọc và phân tích dữ liệu hóa đơn trực tiếp (không dùng AI)...'
      : 'Đang gửi dữ liệu hóa đơn và xử lý bằng AI...';
  }
  if (statusEl) statusEl.style.display = 'block';
  if (resultsContainer) resultsContainer.innerHTML = '';

  const formData = new FormData();
  formData.append('mode', mode);
  selectedInvoiceFiles.forEach(file => {
    formData.append('files', file);
  });

  try {
    const res = await adminFetch('/api/tools/parse-invoice', {
      method: 'POST',
      body: formData
    });

    if (res.status === 401) {
      if (statusEl) statusEl.style.display = 'none';
      return;
    }

    const data = await res.json();
    if (statusEl) statusEl.style.display = 'none';

    if (!res.ok || !data.ok) {
      showToast(`<i class="fa-solid fa-xmark"></i> ${data.message || 'Lỗi xử lý hóa đơn'}`, 'error');
      if (btnProcess) btnProcess.removeAttribute('disabled');
      if (btnProcessNoAi) btnProcessNoAi.removeAttribute('disabled');
      if (btnClear) btnClear.style.display = 'inline-block';
      return;
    }

    renderInvoiceResults(data.results);
    parsedInvoicesList = data.results.map(r => r.ok ? r.data : null);
    const msg = mode === 'direct'
      ? '<i class="fa-solid fa-bolt"></i> Đã phân tích xong hóa đơn trực tiếp (không dùng AI)!'
      : '<i class="fa-solid fa-check"></i> Đã xử lý xong toàn bộ hóa đơn bằng AI!';
    showToast(msg, 'success');
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.style.display = 'none';
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối máy chủ.', 'error');
    if (btnProcess) btnProcess.removeAttribute('disabled');
    if (btnProcessNoAi) btnProcessNoAi.removeAttribute('disabled');
    if (btnClear) btnClear.style.display = 'inline-block';
  }
}

function renderInvoiceResults(results) {
  const container = document.getElementById('invoiceResultsContainer');
  container.innerHTML = '';

  if (!results || results.length === 0) {
    container.innerHTML = '<div class="admin-card"><p>Không có kết quả trả về.</p></div>';
    return;
  }

  parsedInvoicesList = results.map(r => r.ok ? r.data : null);

  // Thu thập danh sách sản phẩm mới từ tất cả các hóa đơn (loại trùng theo tên + đơn vị)
  const allNewProducts = [];
  const seenKeys = new Set();
  results.forEach(res => {
    if (!res.ok || !res.data || !res.data.products) return;
    res.data.products.forEach(p => {
      if (p.isNewSystemProduct) {
        const key = (p.name || '').trim().toLowerCase() + '___' + (p.unit || '').trim().toLowerCase();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          allNewProducts.push(p);
        }
      }
    });
  });

  // 1. Tạo vùng điều hướng Tab phân trang
  const tabsWrapper = document.createElement('div');
  tabsWrapper.className = 'invoice-tabs-wrapper';
  tabsWrapper.style.display = 'flex';
  tabsWrapper.style.justifyContent = 'space-between';
  tabsWrapper.style.alignItems = 'center';
  tabsWrapper.style.gap = '12px';
  tabsWrapper.style.marginBottom = '16px';
  tabsWrapper.style.flexWrap = 'wrap';

  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'invoice-tabs';
  tabsContainer.style.display = 'flex';
  tabsContainer.style.gap = '8px';
  tabsContainer.style.flexWrap = 'wrap';

  results.forEach((res, index) => {
    const tabBtn = document.createElement('button');
    tabBtn.className = `btn btn-sm invoice-tab-btn ${index === 0 ? 'btn-primary' : 'btn-outline'}`;
    tabBtn.id = `invoice-tab-btn-${index}`;
    
    let tabTitle = `Hóa đơn ${index + 1}`;
    if (res.data && res.data.invoiceNumber) {
      tabTitle = `HĐ ${index + 1} (Số ${res.data.invoiceNumber})`;
    }
    tabBtn.innerHTML = `<i class="fa-solid fa-file-invoice"></i> ${tabTitle}`;
    tabBtn.onclick = () => showInvoiceResultTab(index);
    tabsContainer.appendChild(tabBtn);
  });

  tabsWrapper.appendChild(tabsContainer);

  // Nút xuất tất cả hàng hóa mới từ tất cả hóa đơn nếu có sản phẩm mới
  if (allNewProducts.length > 0) {
    const exportAllBtn = document.createElement('button');
    exportAllBtn.className = 'btn btn-warning btn-sm btn-export-all-misa';
    exportAllBtn.id = 'btnExportAllNewProducts';
    exportAllBtn.style.background = '#d97706';
    exportAllBtn.style.color = 'white';
    exportAllBtn.style.border = 'none';
    exportAllBtn.style.fontWeight = '600';
    exportAllBtn.style.display = 'inline-flex';
    exportAllBtn.style.alignItems = 'center';
    exportAllBtn.style.gap = '6px';
    exportAllBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    exportAllBtn.innerHTML = `<i class="fa-solid fa-file-excel"></i> Xuất file tạo mới Hàng Hóa (Tất cả HĐ - ${allNewProducts.length} SP)`;
    exportAllBtn.onclick = () => exportAllNewProductsExcel(exportAllBtn);
    tabsWrapper.appendChild(exportAllBtn);
  }

  container.appendChild(tabsWrapper);

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
        <div style="color: var(--danger); font-weight: 700; display: flex; align-items: center; gap: 8px; font-size: 0.95rem;">
          <i class="fa-solid fa-triangle-exclamation"></i> Lỗi file: ${res.fileName}
        </div>
        <div style="margin-top: 8px; font-size: 0.85rem; color: var(--text); background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; padding: 10px 12px; line-height: 1.5;">${res.message || 'Lỗi không xác định.'}</div>
        <div style="margin-top: 12px;">
          <button type="button" class="btn btn-sm btn-primary" onclick="processInvoices()">
            <i class="fa-solid fa-rotate-right"></i> Thử lại xử lý hóa đơn
          </button>
        </div>
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
            <strong style="color: #b45309; font-size: 0.9rem; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
               <i class="fa-solid fa-circle-exclamation"></i> Cảnh báo: Sản phẩm gợi ý chưa có trên hệ thống
               <span style="background: #fef3c7; color: #92400e; font-size: 0.8rem; font-weight: 700; padding: 2px 8px; border-radius: 9999px; border: 1px solid #fde68a; margin-left: 4px;">${newProducts.length} sản phẩm</span>
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
        <span style="font-size: 0.9rem; font-weight: 600; color: var(--text); display: inline-flex; align-items: center; gap: 8px;">
          Danh sách sản phẩm
          <span style="background: #e0f2fe; color: #0369a1; font-size: 0.8rem; font-weight: 600; padding: 2px 8px; border-radius: 9999px; border: 1px solid #bae6fd;">${products.length} sản phẩm</span>
        </span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary btn-sm btn-save-invoice-db" onclick="saveInvoiceToInventory(this, ${index})">
            <i class="fa-solid fa-download"></i> Lưu vào Nhập kho
          </button>
          <button class="btn btn-success btn-sm btn-export-invoice-excel" onclick="exportSingleInvoiceExcel(${index})">
            <i class="fa-solid fa-file-excel"></i> Xuất Excel Nhập Kho
          </button>
          <button class="btn btn-outline btn-sm btn-copy-table" onclick="copyInvoiceTableToClipboard(this, ${index})">
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
  const btnProcess = document.getElementById('btnProcessInvoices');
  if (btnProcess) btnProcess.removeAttribute('disabled');
  const btnProcessNoAi = document.getElementById('btnProcessInvoicesNoAi');
  if (btnProcessNoAi) btnProcessNoAi.removeAttribute('disabled');
  const btnClear = document.getElementById('btnClearInvoices');
  if (btnClear) btnClear.style.display = 'inline-block';
}

function showInvoiceResultTab(index) {
  // Thay đổi class hoạt động của nút tab
  document.querySelectorAll('.invoice-tab-btn').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-outline');
    btn.style.color = '';
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
      btn.style.color = '';
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
          <div class="row-actions">
            <button class="btn-act btn-act-edit" onclick="openEditSupplierModal('${(s.code||'').replace(/'/g,"\\'")}')" title="Sửa thông tin">
              <i class="fa-solid fa-pen"></i>
            </button>
          </div>
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
async function exportAllNewProductsExcel(btn) {
  if (!parsedInvoicesList || parsedInvoicesList.length === 0) {
    showToast('<i class="fa-solid fa-xmark"></i> Không tìm thấy dữ liệu hóa đơn.', 'error');
    return;
  }

  // Thu thập và loại trùng các sản phẩm mới từ tất cả hóa đơn
  const allNewProducts = [];
  const seenKeys = new Set();

  parsedInvoicesList.forEach(inv => {
    if (!inv || !inv.products) return;
    inv.products.forEach(p => {
      if (p.isNewSystemProduct) {
        const key = (p.name || '').trim().toLowerCase() + '___' + (p.unit || '').trim().toLowerCase();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          allNewProducts.push(p);
        }
      }
    });
  });

  if (allNewProducts.length === 0) {
    showToast('<i class="fa-solid fa-circle-info"></i> Không có sản phẩm mới nào trong tất cả các hóa đơn.', 'info');
    return;
  }

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
      body: JSON.stringify(allNewProducts)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Lỗi xuất file từ máy chủ.');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Danh_sach_hang_hoa_moi_Tat_ca_HD.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    showToast(`<i class="fa-solid fa-circle-check"></i> Đã xuất ${allNewProducts.length} hàng hóa mới cho tất cả HĐ thành công!`, 'success');
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
    b.style.color = '';
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
    b.className = 'inventory-tab-btn px-4 py-2 rounded-full font-semibold text-xs transition flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200';
  });
  if (btn) {
    btn.className = 'inventory-tab-btn px-4 py-2 rounded-full font-bold text-xs transition flex items-center gap-2 bg-slate-900 text-white shadow-xs';
  }

  document.querySelectorAll('.inventory-tab-content').forEach(content => {
    content.style.display = 'none';
  });
  const activeContent = document.getElementById(`inventory-tab-${tabName}`);
  if (activeContent) {
    activeContent.style.display = 'block';
  }

  if (tabName === 'stock') {
    // Luôn load lại cả products và orders mới nhất trước khi render tab Tồn kho
    Promise.all([loadProducts(), loadOrders()]).then(() => sk_initStockTab()).catch(() => sk_initStockTab());
  }
}

// =====================================================================
// TỒN KHO SẢN PHẨM TAB LOGIC (sk_ prefix)
// =====================================================================
let sk_page = 1;
let sk_filteredList = [];
let sk_initialized = false;

const SK_LOW_STOCK_THRESHOLD = 30; // Sắp hết hàng nếu <= ngưỡng này

function sk_getStockStatus(stock) {
  const q = parseFloat(stock) || 0;
  if (q <= 0) return 'out';
  if (q <= SK_LOW_STOCK_THRESHOLD) return 'low';
  return 'in';
}

function sk_statusBadge(status) {
  if (status === 'out') return `<span class="text-xs px-2.5 py-0.5 rounded-full font-medium" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;">Hết hàng</span>`;
  if (status === 'low') return `<span class="text-xs px-2.5 py-0.5 rounded-full font-medium" style="background:#fffbeb;color:#92400e;border:1px solid #fde68a;">Sắp hết hàng</span>`;
  return `<span class="text-xs px-2.5 py-0.5 rounded-full font-medium" style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;">Còn hàng</span>`;
}

function sk_initStockTab() {
  // Populate category filter once
  const catSel = document.getElementById('sk_catFilter');
  if (catSel && catSel.options.length <= 1 && products && products.length > 0) {
    const cats = [...new Set(products.map(p => p.loai).filter(Boolean))].sort();
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      catSel.appendChild(opt);
    });
  }
  sk_page = 1;
  sk_filterAndRender();
}

function sk_filterAndRender() {
  const q = (document.getElementById('sk_searchInput')?.value || '').trim().toLowerCase();
  const cat = document.getElementById('sk_catFilter')?.value || '';
  const status = document.getElementById('sk_statusFilter')?.value || '';
  const pageSize = parseInt(document.getElementById('sk_pageSize')?.value || 10);

  // Tính lượng "đang chờ xác nhận" cho từng SKU từ orders
  const pendingQtyMap = {};
  (orders || []).filter(o => o && o.status === 'Chờ xác nhận').forEach(o => {
    (o.items || []).forEach(item => {
      const sku = (item.sku || item.productId || item.ma || '').trim().toUpperCase();
      const qty = parseFloat(item.quantity !== undefined ? item.quantity : (item.qty || 0)) || 0;
      if (sku && qty > 0) {
        pendingQtyMap[sku] = (pendingQtyMap[sku] || 0) + qty;
      }
    });
  });

  let list = (products || []).filter(p => p.trangthai !== 'Ngừng theo dõi');

  if (q) {
    list = list.filter(p =>
      (p.ma || '').toLowerCase().includes(q) ||
      (p.ten || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    );
  }
  if (cat) list = list.filter(p => p.loai === cat);
  if (status) list = list.filter(p => sk_getStockStatus(p.stock) === status);

  // Đính kèm pendingQty vào mỗi sản phẩm để dùng trong render
  list = list.map(p => {
    const pCode = (p.ma || '').trim().toUpperCase();
    return { ...p, _pendingQty: pendingQtyMap[pCode] || 0 };
  });

  sk_filteredList = list;

  // Update stats cards
  const allActive = (products || []).filter(p => p.trangthai !== 'Ngừng theo dõi');
  const totalProducts = allActive.length;
  const totalStock = allActive.reduce((s, p) => s + (parseFloat(p.stock) || 0), 0);
  const lowCount = allActive.filter(p => sk_getStockStatus(p.stock) === 'low').length;
  const outCount = allActive.filter(p => sk_getStockStatus(p.stock) === 'out').length;
  const totalValue = allActive.reduce((s, p) => s + ((parseFloat(p.stock) || 0) * (parseFloat(p.cost_price || p.gia) || 0)), 0);

  const el = id => document.getElementById(id);
  if (el('sk_totalProducts')) el('sk_totalProducts').textContent = totalProducts.toLocaleString('vi-VN');
  if (el('sk_totalStock')) el('sk_totalStock').textContent = totalStock.toLocaleString('vi-VN');
  if (el('sk_lowStock')) el('sk_lowStock').textContent = lowCount.toLocaleString('vi-VN');
  if (el('sk_outOfStock')) el('sk_outOfStock').textContent = outCount.toLocaleString('vi-VN');
  if (el('sk_totalValue')) el('sk_totalValue').textContent = formatPrice(Math.round(totalValue));

  // Pagination
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (sk_page > totalPages) sk_page = totalPages;
  if (sk_page < 1) sk_page = 1;

  const start = (sk_page - 1) * pageSize;
  const paged = list.slice(start, start + pageSize);

  sk_renderTable(paged, start);

  // Render standard pagination matching all other tabs
  renderPagination(totalPages, sk_page, 'sk_pagination', (p) => { sk_goPage(p); });

  const infoEl = document.getElementById('sk_paginationInfo');
  if (infoEl && total > 0) {
    const startIdx = (sk_page - 1) * pageSize + 1;
    const endIdx = Math.min(sk_page * pageSize, total);
    infoEl.innerHTML = `Hiển thị <strong>${startIdx} – ${endIdx}</strong> của <strong>${total}</strong> sản phẩm`;
  } else if (infoEl) {
    infoEl.innerHTML = '';
  }
}

function sk_renderTable(list, startOffset) {
  const tbody = document.getElementById('sk_tableBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-gray-400 py-12 text-sm">
      <i class="fa-solid fa-box-open fa-2x mb-2 block text-gray-300"></i>
      Không tìm thấy sản phẩm nào phù hợp
    </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((p, i) => {
    const stock = parseFloat(p.stock) || 0;
    const pending = parseFloat(p._pendingQty) || 0;
    const available = Math.max(0, stock - pending);
    const costPrice = parseFloat(p.cost_price || p.gia) || 0;
    const totalVal = Math.round(stock * costPrice);
    const status = sk_getStockStatus(stock);
    const hasImg = !!p.image;
    const imgSrc = getProductImageUrl(p);
    const rowNum = startOffset + i + 1;

    let badgeHtml = '';
    if (status === 'out') {
      badgeHtml = `<span class="bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-xs font-semibold inline-block">Hết hàng</span>`;
    } else if (status === 'low') {
      badgeHtml = `<span class="bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full text-xs font-semibold inline-block">Sắp hết hàng</span>`;
    } else {
      badgeHtml = `<span class="bg-green-50 text-green-600 px-2.5 py-1 rounded-full text-xs font-semibold inline-block">Còn hàng</span>`;
    }

    return `
      <tr class="hover:bg-gray-50 border-b border-gray-100">
        <td class="w-12 px-4 py-3 text-center text-gray-500 text-sm">${rowNum}</td>
        <td class="py-3 px-4 font-medium text-gray-900">
          <div class="flex items-center gap-2.5">
            <div style="width:32px;height:32px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
              ${hasImg
                ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:contain;padding:2px;" onerror="this.parentNode.innerHTML='<i class=\\'fa-solid fa-box\\' style=\\'color:#cbd5e1;\\'></i>'" />`
                : `<i class="fa-solid fa-box" style="color:#cbd5e1;font-size:0.8rem;"></i>`
              }
            </div>
            <span style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;" title="${p.ten || ''}">${p.ten || '—'}</span>
          </div>
        </td>
        <td class="py-3 px-4 text-gray-600 font-mono text-xs">${p.ma || '—'}</td>
        <td class="py-3 px-4 text-gray-600">${p.donvi || 'Cái'}</td>
        <td class="py-3 px-4 font-bold text-gray-900">${stock.toLocaleString('vi-VN')}</td>
        <td class="py-3 px-4 font-medium">
          <button type="button"
            onclick="openPendingOrdersModal('${(p.ma||'').replace(/'/g, "\\'")}')"
            class="inline-flex items-center gap-1 font-semibold text-xs transition cursor-pointer text-blue-600 hover:text-blue-800 hover:underline group text-left"
            title="${pending > 0 ? `Bấm xem ${pending} sản phẩm đang giữ trong đơn chờ xác nhận` : 'Bấm xem đơn hàng chờ xác nhận'}">
            <span>${available.toLocaleString('vi-VN')}</span>
            ${pending > 0 ? `<span class="text-amber-600 font-bold group-hover:underline">(−${pending.toLocaleString('vi-VN')})</span>` : ''}
            <i class="fa-solid fa-arrow-up-right-from-square text-[10px] text-blue-500 opacity-60 group-hover:opacity-100 transition-opacity ml-0.5"></i>
          </button>
        </td>
        <td class="py-3 px-4"><span class="text-red-600 font-semibold">${formatPrice(totalVal)}</span></td>
        <td class="py-3 px-4">${badgeHtml}</td>
        <td class="py-3 px-4 text-center">
          <div class="row-actions">
            <button class="btn-act btn-act-edit" onclick="openProductModal('${(p.ma||'').replace(/'/g, "\\'")}')" title="Sửa sản phẩm">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-act btn-act-delete" onclick="deleteProduct('${(p.ma||'').replace(/'/g, "\\'")}')" title="Xóa sản phẩm">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function sk_goPage(p) {
  const pageSize = parseInt(document.getElementById('sk_pageSize')?.value || 20, 10);
  const totalPages = Math.max(1, Math.ceil(sk_filteredList.length / pageSize));
  if (p < 1 || p > totalPages) return;
  sk_page = p;
  sk_filterAndRender();
}

function sk_exportExcel() {
  if (!sk_filteredList || sk_filteredList.length === 0) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Không có dữ liệu để xuất', 'warning');
    return;
  }
  
  const headers = ['STT', 'Mã sản phẩm', 'Tên sản phẩm', 'Danh mục', 'Đơn vị', 'Tồn kho', 'Khả dụng', 'Đang chờ', 'Giá vốn', 'Giá trị tồn', 'Tình trạng'];
  const rows = sk_filteredList.map((p, idx) => {
    const stock = parseFloat(p.stock) || 0;
    const pending = parseFloat(p._pendingQty) || 0;
    const available = Math.max(0, stock - pending);
    const costPrice = parseFloat(p.cost_price || p.gia) || 0;
    const totalVal = Math.round(stock * costPrice);
    const statusText = stock <= 0 ? 'Hết hàng' : stock <= SK_LOW_STOCK_THRESHOLD ? 'Sắp hết hàng' : 'Còn hàng';
    return [
      idx + 1,
      `"${(p.ma || '').replace(/"/g, '""')}"`,
      `"${(p.ten || '').replace(/"/g, '""')}"`,
      `"${(p.loai || '').replace(/"/g, '""')}"`,
      `"${(p.donvi || 'Cái').replace(/"/g, '""')}"`,
      stock,
      available,
      pending,
      costPrice,
      totalVal,
      `"${statusText}"`
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Ton_kho_san_pham_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('<i class="fa-solid fa-circle-check"></i> Đã xuất danh sách tồn kho thành công!', 'success');
}

// =====================================================================
// PENDING ORDERS MODAL FOR INVENTORY TAB (Xem đơn chờ xác nhận giữ hàng)
// =====================================================================
async function openPendingOrdersModal(productSku) {
  const modal = document.getElementById('stockPendingOrdersModal');
  if (!modal) return;
  modal.classList.add('open');

  const p = (products || []).find(x => (x.ma || '').trim().toUpperCase() === (productSku || '').trim().toUpperCase()) || {};
  const skuUpper = (productSku || '').trim().toUpperCase();
  const prodName = p.ten || productSku || 'Sản phẩm';

  document.getElementById('stockPendingOrdersTitle').textContent = `Danh sách đơn hàng chờ xác nhận - ${prodName}`;
  document.getElementById('stockPendingOrdersSubtitle').innerHTML = `Mã SP: <strong class="font-mono">${skuUpper || '—'}</strong> &bull; Đang đồng bộ danh sách đơn hàng...`;
  
  const bodyEl = document.getElementById('stockPendingOrdersBody');
  bodyEl.innerHTML = `
    <div class="text-center py-12 text-slate-400">
      <i class="fa-solid fa-circle-notch fa-spin text-2xl text-amber-500 mb-3 block"></i>
      <p class="text-xs font-semibold">Đang tải danh sách đơn hàng giữ sản phẩm...</p>
    </div>
  `;

  // Luôn đảm bảo danh sách orders mới nhất
  if (!orders || orders.length === 0) {
    try {
      await loadOrders();
    } catch (e) {
      console.error('Lỗi tải orders:', e);
    }
  }

  const isPendingOrder = (o) => {
    if (!o) return false;
    const st = String(o.status || '').toLowerCase().trim();
    return st === 'chờ xác nhận' || st === 'pending' || st.includes('chờ');
  };

  const pendingOrders = (orders || []).filter(o => {
    if (!isPendingOrder(o)) return false;
    return (o.items || []).some(item => {
      const itemSku = (item.sku || item.productId || item.ma || '').trim().toUpperCase();
      return (itemSku && itemSku === skuUpper) ||
        (p.id && (item.productId === p.id || item.id === p.id)) ||
        (p.ten && item.ten && item.ten.trim().toLowerCase() === p.ten.trim().toLowerCase());
    });
  });

  let totalPendingQty = 0;
  const orderRows = pendingOrders.map(o => {
    const matchingItems = (o.items || []).filter(item => {
      const itemSku = (item.sku || item.productId || item.ma || '').trim().toUpperCase();
      return (itemSku && itemSku === skuUpper) ||
        (p.id && (item.productId === p.id || item.id === p.id)) ||
        (p.ten && item.ten && item.ten.trim().toLowerCase() === p.ten.trim().toLowerCase());
    });

    const orderPendingQty = matchingItems.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity !== undefined ? item.quantity : (item.qty || 0)) || 0);
    }, 0);
    totalPendingQty += orderPendingQty;

    const dateFormatted = typeof formatOrderDate === 'function' ? formatOrderDate(o.createdAt) : (o.createdAt || '—');

    return `
      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 transition">
        <td class="py-3 px-4 font-mono font-bold text-xs text-amber-600 dark:text-amber-400 whitespace-nowrap">#${o.id}</td>
        <td class="py-3 px-4 text-xs font-semibold text-slate-800 dark:text-slate-200">
          <div>${o.customer || 'Khách vãng lai'}</div>
          ${o.phone ? `<div class="text-slate-400 font-normal text-[11px]"><i class="fa-solid fa-phone text-[10px] mr-1"></i>${o.phone}</div>` : ''}
        </td>
        <td class="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap text-center">${dateFormatted}</td>
        <td class="py-3 px-4 text-xs text-center font-bold whitespace-nowrap">
          <span class="bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/80 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-lg">
            ${orderPendingQty.toLocaleString('vi-VN')} ${p.donvi || 'Cái'}
          </span>
        </td>
        <td class="py-3 px-4 text-xs text-center whitespace-nowrap">
          <span class="bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/80 px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Chờ xác nhận
          </span>
        </td>
        <td class="py-3 px-4 text-xs text-center whitespace-nowrap">
          <button type="button" class="btn btn-sm btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold cursor-pointer active:scale-95 shadow-2xs transition"
            onclick="goToOrderDetailFromStock('${o.id}')" title="Chuyển đến trang Đơn hàng và xem chi tiết đơn này">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Xem chi tiết đơn hàng
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const stock = parseFloat(p.stock) || 0;
  const available = Math.max(0, stock - totalPendingQty);

  document.getElementById('stockPendingOrdersTitle').textContent = `Danh sách đơn hàng chờ xác nhận - ${prodName}`;
  document.getElementById('stockPendingOrdersSubtitle').innerHTML = `Mã SP: <span class="font-mono font-bold text-slate-700 dark:text-slate-300">${skuUpper || '—'}</span> &bull; Tồn kho thực tế: <strong>${stock.toLocaleString('vi-VN')}</strong> &bull; Đang giữ: <strong class="text-amber-600 dark:text-amber-400">${totalPendingQty.toLocaleString('vi-VN')}</strong> &bull; Khả dụng: <strong class="text-blue-600 dark:text-blue-400">${available.toLocaleString('vi-VN')}</strong>`;

  if (pendingOrders.length === 0) {
    bodyEl.innerHTML = `
      <div class="text-center py-12 px-4">
        <div class="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
          <i class="fa-solid fa-clipboard-check text-2xl text-slate-400"></i>
        </div>
        <h4 class="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">Không có đơn hàng nào đang chờ xác nhận</h4>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">Sản phẩm này hiện không có đơn nào ở trạng thái "Chờ xác nhận" giữ hàng. Toàn bộ số lượng tồn kho đều khả dụng để xuất bán.</p>
      </div>
    `;
  } else {
    bodyEl.innerHTML = `
      <div class="mb-4 p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 rounded-xl flex items-center justify-between text-xs">
        <div class="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold">
          <i class="fa-solid fa-circle-info text-amber-500 text-sm"></i>
          <span>Có <strong>${pendingOrders.length}</strong> đơn hàng đang tạm giữ tổng cộng <strong>${totalPendingQty.toLocaleString('vi-VN')} ${p.donvi || 'Cái'}</strong></span>
        </div>
        <span class="text-slate-500 dark:text-slate-400 text-[11px]">Tồn kho: <strong>${stock.toLocaleString('vi-VN')}</strong> &bull; Khả dụng: <strong class="text-blue-600 dark:text-blue-400">${available.toLocaleString('vi-VN')}</strong></span>
      </div>
      <div class="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold uppercase border-b border-slate-200/80 dark:border-slate-700/80">
              <th class="py-2.5 px-4">Mã đơn hàng</th>
              <th class="py-2.5 px-4">Tên khách hàng</th>
              <th class="py-2.5 px-4 text-center">Ngày đặt</th>
              <th class="py-2.5 px-4 text-center">Số lượng giữ</th>
              <th class="py-2.5 px-4 text-center">Trạng thái</th>
              <th class="py-2.5 px-4 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${orderRows}
          </tbody>
        </table>
      </div>
    `;
  }
}

function goToOrderDetailFromStock(orderId) {
  closeModal('stockPendingOrdersModal');
  adminTab('orders');

  const searchInput = document.getElementById('orderSearch');
  if (searchInput) {
    searchInput.value = orderId;
  }
  const statusFilter = document.getElementById('orderStatusFilter');
  if (statusFilter) {
    statusFilter.value = ''; // Reset filter để đảm bảo hiển thị đơn được tìm
  }
  renderOrdersTable();

  setTimeout(() => {
    if (typeof viewOrderDetail === 'function') {
      viewOrderDetail(orderId);
    }
  }, 120);
}

async function loadInventoryHistory() {
  const isInventoryTabActive = document.getElementById('tab-inventory')?.classList.contains('active');
  const tbody = document.getElementById('inventoryHistoryTableBody');
  if (tbody && isInventoryTabActive) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--muted); padding: 20px 0;">
          <i class="fa-solid fa-spinner fa-spin"></i> Đang tải lịch sử nhập kho...
        </td>
      </tr>
    `;
  }

  try {
    const res = await adminFetch('/api/admin/inventory/receipts');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allInventoryReceipts = await res.json();

    if (typeof filterInventoryHistory === 'function') {
      try {
        filterInventoryHistory();
      } catch (err) {
        console.warn('Lỗi filterInventoryHistory:', err);
      }
    }
  } catch (err) {
    console.error('Lỗi khi tải lịch sử nhập kho:', err);
    if (tbody && isInventoryTabActive) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--danger); padding: 20px 0;">
            <i class="fa-solid fa-circle-exclamation"></i> Không thể tải dữ liệu: ${err.message}
          </td>
        </tr>
      `;
    }
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
  const count = selectedInventoryIds.length;
  const confirmed = await showDeleteConfirmModal({
    title: 'Xóa hàng loạt chứng từ',
    target: `${count} chứng từ nhập kho đã chọn`,
    desc: `Bạn có chắc chắn muốn xóa ${count} chứng từ đã chọn? Hành động này không thể hoàn tác và số lượng tồn kho có thể bị thay đổi.`,
    confirmText: `Xóa ${count} chứng từ`
  });
  if (!confirmed) {
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
      <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
        <td class="w-12 px-4 py-3.5 text-center">
          <input type="checkbox" class="inventory-row-checkbox w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer" value="${r.id}" onchange="updateSelectedInventoryCount()" />
        </td>
        <td class="py-3.5 px-4">
          <span class="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded-md text-xs border border-slate-200/60">${r.receipt_code}</span>
        </td>
        <td class="py-3.5 px-4 text-xs font-medium text-slate-500">${formattedDate}</td>
        <td class="py-3.5 px-4 text-xs font-bold text-slate-800 uppercase tracking-tight">${r.supplier_name || 'N/A'}</td>
        <td class="py-3.5 px-4 text-xs font-medium text-slate-600">${r.warehouse_name || 'Kho chính'}</td>
        <td class="py-3.5 px-4"><span class="text-xs font-black text-slate-900 tracking-tight">${formatPrice(r.total_amount)}</span></td>
        <td class="py-3.5 px-4"><span class="bg-slate-100 text-slate-700 border border-slate-200/60 px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-block">${r.item_count} mặt hàng</span></td>
        <td class="py-3.5 px-4 text-center">
          <div class="row-actions">
            <button class="btn-act btn-act-view" onclick="openInventoryReceiptDetail(${r.id})" title="Xem chi tiết">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn-act btn-act-edit" onclick="editStockReceipt(${r.id})" title="Sửa chứng từ">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-act btn-act-delete" onclick="deleteInventoryReceipt(${r.id})" title="Xóa chứng từ">
              <i class="fa-solid fa-trash-can"></i>
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
      <tr class="bg-slate-50/90 border-t-2 border-slate-200 font-bold text-xs text-slate-700">
        <td colspan="5" class="py-3.5 px-4 text-left">
          <i class="fa-solid fa-calculator text-amber-500 mr-1.5"></i> Tổng cộng (${total} phiếu)
        </td>
        <td colspan="3" class="py-3.5 px-4 text-left font-black text-slate-900 text-sm tracking-tight">
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
    <div class="text-center py-12 text-slate-400">
      <i class="fa-solid fa-circle-notch fa-spin text-2xl text-amber-500 mb-3 block"></i>
      <p class="text-xs font-semibold">Đang tải thông tin chi tiết chứng từ...</p>
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

    let totalBeforeTax = 0;
    let totalTax = 0;
    let totalQty = 0;
    (items || []).forEach(item => {
      const amount = Number(item.total_price || 0);
      const taxRate = Number(item.tax_rate || 0);
      totalBeforeTax += amount;
      totalTax += Math.round(amount * taxRate / 100);
      totalQty += Number(item.quantity || 0);
    });
    const totalWithTax = totalBeforeTax + totalTax;

    detailBody.innerHTML = `
      <div class="space-y-4">
        <!-- Info Cards (Stitch Style) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 text-xs">
          <div>
            <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Mã chứng từ</span>
            <span class="font-mono font-extrabold text-slate-900 dark:text-amber-400 text-sm">${receipt.receipt_code}</span>
          </div>
          <div>
            <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Ngày nhập kho</span>
            <strong class="font-bold text-slate-800 dark:text-slate-200">${fileDate}</strong>
            <span class="block text-slate-400 text-[10px] mt-0.5">Tạo: ${systemDate}</span>
          </div>
          <div>
            <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Nhà cung cấp</span>
            <div class="font-bold text-slate-900 dark:text-white truncate">${receipt.supplier_name || 'N/A'}</div>
          </div>
          <div>
            <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Kho nhập</span>
            <span class="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
              <i class="fa-solid fa-warehouse text-amber-500 text-[10px]"></i> ${receipt.warehouse_name || 'Kho chính'}
            </span>
          </div>
        </div>

        <!-- Financial & Notes summary -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-xs shadow-xs">
            <span class="text-slate-400 block mb-1">Tiền hàng (chưa thuế)</span>
            <span class="font-mono font-bold text-slate-900 dark:text-white text-sm">${formatPrice(totalBeforeTax)}</span>
          </div>
          <div class="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-xs shadow-xs">
            <span class="text-slate-400 block mb-1">Thuế GTGT</span>
            <span class="font-mono font-bold text-slate-900 dark:text-white text-sm">${formatPrice(totalTax)}</span>
          </div>
          <div class="bg-gradient-to-r from-amber-500/10 to-amber-600/15 dark:from-amber-500/20 dark:to-amber-600/25 p-3.5 rounded-2xl border border-amber-500/30 text-xs shadow-xs">
            <span class="text-amber-700 dark:text-amber-300 font-bold block mb-1">Tổng thanh toán (gồm thuế)</span>
            <span class="font-mono font-black text-rose-600 dark:text-amber-400 text-base">${formatPrice(totalWithTax)}</span>
          </div>
        </div>

        ${receipt.note ? `
          <div class="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 shadow-xs flex items-start gap-2">
            <i class="fa-solid fa-note-sticky text-amber-500 mt-0.5"></i>
            <div><strong>Diễn giải / Ghi chú:</strong> ${receipt.note}</div>
          </div>
        ` : ''}

        <!-- Items Table -->
        <div class="overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[11px] tracking-wider">
              <tr>
                <th class="py-3 px-3 text-left">#</th>
                <th class="py-3 px-3 text-left">Mã SKU</th>
                <th class="py-3 px-3 text-left">Tên hàng hóa</th>
                <th class="py-3 px-3 text-center">ĐVT</th>
                <th class="py-3 px-3 text-right">Số lượng</th>
                <th class="py-3 px-3 text-right">Đơn giá</th>
                <th class="py-3 px-3 text-right">Thuế %</th>
                <th class="py-3 px-4 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${(items || []).map((item, idx) => `
                <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                  <td class="py-3 px-3 text-slate-400">${idx + 1}</td>
                  <td class="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">${item.product_sku}</td>
                  <td class="py-3 px-3 font-semibold text-slate-900 dark:text-white" style="min-width: 200px;">${item.product_name}</td>
                  <td class="py-3 px-3 text-center text-slate-500">${item.unit || 'Cái'}</td>
                  <td class="py-3 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">${(item.quantity || 0).toLocaleString('vi-VN')}</td>
                  <td class="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">${formatPrice(item.unit_price)}</td>
                  <td class="py-3 px-3 text-right text-slate-500">${item.tax_rate}%</td>
                  <td class="py-3 px-4 text-right font-black text-slate-900 dark:text-white font-mono">${formatPrice(item.total_price)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot class="bg-slate-50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
              <tr>
                <td colspan="4" class="py-3 px-3 text-right text-slate-600 dark:text-slate-300">Tổng số lượng (${totalQty.toLocaleString('vi-VN')}):</td>
                <td class="py-3 px-3 text-right font-black text-slate-900 dark:text-white font-mono">${totalQty.toLocaleString('vi-VN')}</td>
                <td colspan="2" class="py-3 px-3 text-right text-slate-600 dark:text-slate-300">Tổng thanh toán (gồm thuế):</td>
                <td class="py-3 px-4 text-right font-black text-rose-600 dark:text-amber-400 text-sm font-mono">${formatPrice(totalWithTax)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 flex-wrap gap-2">
          <button type="button" onclick="window.print()"
            class="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-450 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer active:scale-95">
            <i class="fa-solid fa-print"></i> In chứng từ
          </button>
          <button type="button" onclick="closeModal('inventoryReceiptModal')"
            class="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer">
            Đóng
          </button>
        </div>
      </div>
    `;

  } catch (err) {
    console.error('Lỗi khi tải chi tiết phiếu nhập:', err);
    detailBody.innerHTML = `
      <div class="py-12 px-4 text-center">
        <div class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center">
          <i class="fa-solid fa-triangle-exclamation text-xl"></i>
        </div>
        <h4 class="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">Không thể tải chi tiết chứng từ</h4>
        <p class="text-xs text-rose-600 dark:text-rose-400 font-semibold">${err.message}</p>
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
  const confirmed = await showDeleteConfirmModal({
    title: 'Xóa chứng từ nhập kho',
    target: `Chứng từ: ${id}`,
    desc: 'Bạn có chắc chắn muốn xóa chứng từ nhập kho này? Hành động này không thể hoàn tác và sẽ khôi phục lại số lượng tồn kho của các sản phẩm tương ứng.',
    confirmText: 'Xóa chứng từ'
  });
  if (!confirmed) {
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
    await loadProducts();
    if (typeof renderAdminTable === 'function') renderAdminTable();
    if (typeof sk_filterAndRender === 'function') sk_filterAndRender();

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
let viewMode = 'grid';

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

function oc_setViewMode(mode) {
  viewMode = mode;
  
  const gridBtn = document.getElementById('oc_btnGridView');
  const listBtn = document.getElementById('oc_btnListView');
  
  if (gridBtn && listBtn) {
    if (mode === 'grid') {
      gridBtn.className = 'px-2 py-1 rounded-lg text-xs bg-slate-900 text-white font-bold cursor-pointer';
      listBtn.className = 'px-2 py-1 rounded-lg text-xs text-slate-500 hover:bg-slate-100 font-bold cursor-pointer';
    } else {
      listBtn.className = 'px-2 py-1 rounded-lg text-xs bg-slate-900 text-white font-bold cursor-pointer';
      gridBtn.className = 'px-2 py-1 rounded-lg text-xs text-slate-500 hover:bg-slate-100 font-bold cursor-pointer';
    }
  }
  
  const query = document.getElementById('oc_productSearch')?.value || '';
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

  // Adjust container styles according to the view mode
  if (catalogGrid) {
    if (viewMode === 'list') {
      catalogGrid.style.display = 'flex';
      catalogGrid.style.flexDirection = 'column';
      catalogGrid.style.gap = '8px';
      catalogGrid.style.gridTemplateColumns = 'none';
      catalogGrid.style.maxHeight = '380px';
      catalogGrid.style.overflowY = 'auto';
    } else {
      catalogGrid.style.display = 'grid';
      catalogGrid.style.gridTemplateColumns = '1fr 1fr';
      catalogGrid.style.gap = '10px';
      catalogGrid.style.maxHeight = '';
      catalogGrid.style.overflowY = 'auto';
    }
  }

  // Pagination
  const totalPages = Math.ceil(matches.length / ocCatalogPageSize) || 1;
  if (ocCatalogPage > totalPages) ocCatalogPage = totalPages;
  if (ocCatalogPage < 1) ocCatalogPage = 1;

  const startIdx = (ocCatalogPage - 1) * ocCatalogPageSize;
  const displayList = matches.slice(startIdx, startIdx + ocCatalogPageSize);

  if (displayList.length === 0) {
    catalogGrid.innerHTML = `
      <div style="grid-column: span 2; text-align: center; color: var(--muted); padding: 40px; font-size: 0.85rem; width: 100%;">
        <i class="fa-solid fa-box-open fa-2x" style="margin-bottom: 8px; display: block; color: #cbd5e1;"></i>
        Không tìm thấy sản phẩm nào phù hợp
      </div>
    `;
    renderCatalogPagination(totalPages);
    return;
  }

  if (viewMode === 'list') {
    catalogGrid.innerHTML = displayList.map(p => {
      const isOutOfStock = (p.stock === undefined || p.stock === null || parseFloat(p.stock) <= 0);
      const hasImage = !!p.image;

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.05); font-size: 0.8rem; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">
          <!-- Left section: Image, SKU, Name, Unit, Stock -->
          <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
            <!-- Small Image Thumbnail (32x32px) -->
            <div style="width: 32px; height: 32px; background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 4px; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
              ${hasImage
                ? `<img src="${getProductImageUrl(p)}" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.parentNode.innerHTML='<i class=\\'fa-solid fa-box\\' style=\\'color:#cbd5e1;font-size:0.75rem;\\'></i>'" />`
                : `<i class="fa-solid fa-box" style="color: #cbd5e1; font-size: 0.75rem;"></i>`
              }
            </div>
            
            <!-- SKU -->
            <span style="font-size: 0.65rem; color: var(--muted); font-family: monospace; background: var(--bg); padding: 1px 4px; border-radius: 3px; flex-shrink: 0;">${p.ma}</span>
            
            <!-- Name -->
            <span style="font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;" title="${p.ten}">${p.ten}</span>
            
            <!-- Unit -->
            <span style="color: var(--muted); flex-shrink: 0; font-size: 0.72rem;">ĐVT: ${p.donvi || 'Cái'}</span>
            
            <!-- Stock -->
            <span style="color: ${isOutOfStock ? 'var(--danger)' : 'var(--success)'}; font-weight: 600; flex-shrink: 0; font-size: 0.72rem;">
              ${isOutOfStock ? 'Hết hàng' : `Tồn: ${p.stock}`}
            </span>
          </div>
          
          <!-- Right section: Price & Action -->
          <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
            <span style="font-weight: 700; color: var(--primary); font-size: 0.82rem;">${formatPrice(p.gia)}</span>
            <button class="btn btn-primary btn-sm" onclick="addProdToManualOrder('${p.ma}')" style="padding: 2px 8px; font-size: 0.7rem; border-radius: 4px; height: 22px; display: inline-flex; align-items: center; gap: 3px;">
              <i class="fa-solid fa-plus"></i> Thêm
            </button>
          </div>
        </div>
      `;
    }).join('');
  } else {
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
  }

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

async function clearAllManualOrderItems() {
  if (manualOrderItems.length === 0) return;
  const count = manualOrderItems.length;
  const confirmed = await showDeleteConfirmModal({
    title: 'Xóa giỏ hàng đơn',
    target: `${count} sản phẩm đang có trong đơn`,
    desc: 'Bạn có chắc chắn muốn xóa toàn bộ sản phẩm đang chọn trong giỏ hàng của đơn này không?',
    confirmText: 'Xóa tất cả'
  });
  if (confirmed) {
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
        <input type="text" value="${(item.gia || 0).toLocaleString('vi-VN')}"
               oninput="formatPriceInput(this); updateManualOrderItemPrice('${item.ma}', this.value)"
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
        <div class="row-actions">
          <button class="btn-act btn-act-delete" onclick="removeManualOrderItem('${item.ma}')" title="Xóa khỏi đơn">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
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
  const price = parseFormattedFloat(val);
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

  const saveBtn = document.getElementById('btnSubmitManualOrder') || document.querySelector('#orderCreateModal button[onclick*="submitManualOrder"]');
  const originalHTML = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
  }

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
    const res = await adminFetch('/api/admin/orders', {
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
        status,
        isManualOrder: true
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
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHTML;
    }
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
      <input type="text" id="srfm_price_${idx}" placeholder="0" value="${d.unit_price ? d.unit_price.toLocaleString('vi-VN') : ''}"
        style="${inputStyle}text-align:right;" ${focusEvents}
        oninput="formatPriceInput(this); srfm_calcRow(${idx})" />
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
      <div class="row-actions">
        <button class="btn-act btn-act-delete" onclick="srfm_removeRow(${idx})" title="Xóa dòng">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
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
  const price = parseFormattedFloat(document.getElementById(`srfm_price_${idx}`)?.value || 0) || 0;
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
    const price = parseFormattedFloat(document.getElementById(`srfm_price_${idx}`)?.value || 0) || 0;
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
  if (priceEl && !priceEl.value) priceEl.value = price ? price.toLocaleString('vi-VN') : '';
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
    const price = parseFormattedFloat(document.getElementById(`srfm_price_${idx}`)?.value || 0) || 0;
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
    // Reload products sau khi nhập kho để Tồn kho tab phản ánh số liệu mới
    await loadProducts();
    if (typeof renderAdminTable === 'function') renderAdminTable();
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
  saveBtn.style.background = '';

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
  saveBtn.style.background = '';

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
  const name = document.getElementById('sup_name')?.value?.trim() || '';
  const targetLabel = name ? `${code} - ${name}` : `Nhà cung cấp: ${code}`;

  const confirmed = await showDeleteConfirmModal({
    title: 'Xoá vĩnh viễn nhà cung cấp',
    target: targetLabel,
    desc: `Bạn có chắc chắn muốn xoá vĩnh viễn nhà cung cấp ${code}? Thao tác này không thể hoàn tác và các dữ liệu liên quan sẽ bị xóa hoàn toàn khỏi hệ thống.`,
    confirmText: 'Xoá nhà cung cấp'
  });
  if (!confirmed) return;

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
  
  const confirmed = await showDeleteConfirmModal({
    title: 'Xóa vĩnh viễn phiếu nhập',
    target: `Phiếu nhập kho #${srfm_editingReceiptId}`,
    desc: 'Bạn có chắc chắn muốn xóa vĩnh viễn phiếu nhập kho này? Hành động này không thể hoàn tác và sẽ khôi phục lại số lượng tồn kho của các sản phẩm tương ứng.',
    confirmText: 'Xóa phiếu nhập'
  });
  if (!confirmed) return;

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

// =====================================================================
// MODULE QUẢN LÝ TRẢ HÀNG (RETURNS MANAGEMENT)
// Chỉ cho phép trả hàng cho các đơn hàng "Đã xác nhận"
// =====================================================================

// orderReturns is declared at the top-level state
let returnPage = 1;
const RETURNS_PER_PAGE = 15;
let _currentReturnOrder = null;

async function loadReturns() {
  try {
    const res = await adminFetch('/api/admin/returns');
    if (!res.ok) throw new Error('Không thể tải danh sách phiếu trả hàng');
    const data = await res.json();
    orderReturns = Array.isArray(data.returns) ? data.returns : [];
    
    updateReturnsKPIs();
    renderReturnsTable();
    _renderDashboardReturns();
  } catch (err) {
    console.error('Lỗi tải phiếu trả hàng:', err);
    const tbody = document.getElementById('returnsTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-rose-500 font-semibold"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Lỗi khi tải dữ liệu phiếu trả hàng.</td></tr>`;
    }
  }
}

function updateReturnsKPIs() {
  const totalSlips = orderReturns.length;
  let totalRefund = 0;
  let totalQty = 0;
  let totalRestocked = 0;

  orderReturns.forEach(ret => {
    totalRefund += Number(ret.totalRefund) || 0;
    if (ret.restock) totalRestocked++;
    (ret.items || []).forEach(it => {
      totalQty += Number(it.returnQty) || 0;
    });
  });

  const badgeEl = document.getElementById('returnsCountBadge');
  if (badgeEl) badgeEl.textContent = `${totalSlips} phiếu`;

  const kpiSlips = document.getElementById('kpi_returnTotalSlips');
  if (kpiSlips) kpiSlips.textContent = totalSlips;

  const kpiRefund = document.getElementById('kpi_returnTotalRefund');
  if (kpiRefund) kpiRefund.textContent = formatPrice(totalRefund);

  const kpiQty = document.getElementById('kpi_returnTotalQty');
  if (kpiQty) kpiQty.textContent = `${totalQty} SP`;

  const kpiRestocked = document.getElementById('kpi_returnRestocked');
  if (kpiRestocked) kpiRestocked.textContent = `${totalRestocked} phiếu`;
}

function renderReturnsTable() {
  const tbody = document.getElementById('returnsTableBody');
  if (!tbody) return;

  const searchKeyword = (document.getElementById('returnSearch')?.value || '').trim().toLowerCase();
  const reasonFilter = (document.getElementById('returnReasonFilter')?.value || '').trim();
  const restockFilter = (document.getElementById('returnRestockFilter')?.value || '').trim();

  let filtered = orderReturns.filter(ret => {
    if (searchKeyword) {
      const matchId = (ret.id || '').toLowerCase().includes(searchKeyword);
      const matchOrder = (ret.orderId || '').toLowerCase().includes(searchKeyword);
      const matchCustomer = (ret.customer || '').toLowerCase().includes(searchKeyword);
      const matchPhone = (ret.phone || '').toLowerCase().includes(searchKeyword);
      if (!matchId && !matchOrder && !matchCustomer && !matchPhone) return false;
    }
    if (reasonFilter && ret.reason !== reasonFilter) return false;
    if (restockFilter === 'yes' && !ret.restock) return false;
    if (restockFilter === 'no' && ret.restock) return false;
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / RETURNS_PER_PAGE));
  if (returnPage > totalPages) returnPage = totalPages;

  const start = (returnPage - 1) * RETURNS_PER_PAGE;
  const paged = filtered.slice(start, start + RETURNS_PER_PAGE);

  const infoEl = document.getElementById('returnPaginationInfo');
  if (infoEl) {
    infoEl.textContent = total === 0 ? '0 phiếu trả' : `Hiển thị ${start + 1} - ${Math.min(start + RETURNS_PER_PAGE, total)} / ${total} phiếu`;
  }

  if (paged.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-12 text-slate-400">
          <div class="flex flex-col items-center justify-center gap-2">
            <i class="fa-solid fa-box-open text-3xl opacity-30"></i>
            <span class="font-bold text-sm">Chưa có phiếu trả hàng nào</span>
            <span class="text-xs text-slate-500">Nhấn nút "Tạo phiếu trả hàng" để thực hiện trả hàng cho đơn đã xác nhận.</span>
          </div>
        </td>
      </tr>
    `;
    renderPagination(1, 1, 'returnPagination', () => {});
    return;
  }

  tbody.innerHTML = paged.map((ret, index) => {
    const itemsSummary = (ret.items || []).map(it => `${it.ten || it.ma} (${it.returnQty} ${it.donvi || ''})`).join(', ');
    const itemsCount = (ret.items || []).reduce((acc, cur) => acc + (Number(cur.returnQty) || 0), 0);
    const restockBadge = ret.restock
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"><i class="fa-solid fa-check text-[10px]"></i> Đã hoàn kho</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Không hoàn kho</span>`;

    return `
      <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition">
        <td class="py-3 px-3 text-center text-slate-400 font-medium">${start + index + 1}</td>
        <td class="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">${ret.id}</td>
        <td class="py-3 px-3 whitespace-nowrap">
          <button type="button" onclick="viewOrderDetail('${ret.orderId}')" class="text-indigo-600 dark:text-indigo-400 hover:underline font-mono font-bold flex items-center gap-1 cursor-pointer">
            <i class="fa-solid fa-receipt text-[11px]"></i> ${ret.orderId}
          </button>
        </td>
        <td class="py-3 px-3">
          <div class="font-bold text-slate-900 dark:text-white">${ret.customer || '—'}</div>
          <div class="text-[11px] text-slate-400 font-mono">${ret.phone || '—'}</div>
        </td>
        <td class="py-3 px-3 max-w-[200px] truncate" title="${itemsSummary}">
          <span class="font-bold text-slate-800 dark:text-slate-200">${itemsCount} SP:</span>
          <span class="text-slate-500 dark:text-slate-400">${itemsSummary}</span>
        </td>
        <td class="py-3 px-3 text-right font-black text-rose-600 dark:text-rose-400 whitespace-nowrap font-mono">
          ${formatPrice(ret.totalRefund || 0)}
        </td>
        <td class="py-3 px-3 text-center whitespace-nowrap">
          ${restockBadge}
        </td>
        <td class="py-3 px-3 max-w-[140px] truncate text-slate-700 dark:text-slate-300 font-medium" title="${ret.reason || ''}">
          ${ret.reason || '—'}
        </td>
        <td class="py-3 px-3 text-center text-slate-400 whitespace-nowrap text-[11px]">${ret.createdAt || '—'}</td>
        <td class="py-3 px-3 text-center whitespace-nowrap">
          <div class="row-actions return-actions">
            <button class="btn-act btn-act-view" title="Xem chi tiết phiếu trả" onclick="viewReturnDetail('${ret.id}')">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn-act btn-act-print" title="In phiếu trả hàng" onclick="printReturnSlip('${ret.id}')">
              <i class="fa-solid fa-print"></i>
            </button>
            <button class="btn-act btn-act-receipt" title="Xem đơn hàng gốc #${ret.orderId}" onclick="viewOrderDetail('${ret.orderId}')">
              <i class="fa-solid fa-receipt"></i>
            </button>
            <button class="btn-act btn-act-delete" title="Xóa phiếu trả hàng" onclick="deleteReturnSlip('${ret.id}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderPagination(totalPages, returnPage, 'returnPagination', (p) => {
    returnPage = p;
    renderReturnsTable();
  });
}

function resetReturnFilters(btn) {
  if (btn) {
    btn.classList.add('rotate-180');
    setTimeout(() => btn.classList.remove('rotate-180'), 400);
  }
  const searchInput = document.getElementById('returnSearch');
  if (searchInput) searchInput.value = '';
  const reasonSelect = document.getElementById('returnReasonFilter');
  if (reasonSelect) reasonSelect.value = '';
  const restockSelect = document.getElementById('returnRestockFilter');
  if (restockSelect) restockSelect.value = '';
  returnPage = 1;
  loadReturns();
}

function initiateReturnForOrder(orderId) {
  adminTab('returns');
  openCreateReturnModal(orderId);
}

function openCreateReturnModal(prefilledOrderId) {
  const select = document.getElementById('rc_orderSelect');
  if (!select) return;

  // LỌC CHỈ CÁC ĐƠN HÀNG "ĐÃ XÁC NHẬN"
  const confirmedOrders = (orders || []).filter(o => o.status === 'Đã xác nhận');

  select.innerHTML = '<option value="">-- Chọn đơn hàng đã xác nhận --</option>' +
    confirmedOrders.map(o => {
      const itemsCount = (o.items || []).reduce((sum, it) => sum + (Number(it.quantity || it.qty || 0) || 0), 0);
      return `<option value="${o.id}">[${o.id}] - ${o.customer || 'Khách lẻ'} (${o.phone || 'Không SĐT'}) - ${formatPrice(o.total || 0)} - ${itemsCount} SP</option>`;
    }).join('');

  const searchInput = document.getElementById('rc_orderSearchInput');
  if (searchInput) searchInput.value = '';
  const reasonCustom = document.getElementById('rc_reasonCustom');
  if (reasonCustom) {
    reasonCustom.value = '';
    reasonCustom.classList.add('hidden');
  }
  const reasonSelect = document.getElementById('rc_reasonSelect');
  if (reasonSelect) reasonSelect.value = 'Hàng lỗi kỹ thuật';
  const noteEl = document.getElementById('rc_note');
  if (noteEl) noteEl.value = '';
  const restockCb = document.getElementById('rc_restockCheckbox');
  if (restockCb) restockCb.checked = true;

  if (prefilledOrderId) {
    select.value = prefilledOrderId;
    onReturnOrderSelected(prefilledOrderId);
  } else {
    onReturnOrderSelected('');
  }

  document.getElementById('returnCreateModal').classList.add('open');
}

function filterReturnOrderOptions(keyword) {
  const select = document.getElementById('rc_orderSelect');
  if (!select) return;
  const kw = (keyword || '').toLowerCase().trim();
  const confirmedOrders = (orders || []).filter(o => o.status === 'Đã xác nhận');

  const filtered = confirmedOrders.filter(o => {
    if (!kw) return true;
    return (o.id || '').toLowerCase().includes(kw) ||
      (o.customer || '').toLowerCase().includes(kw) ||
      (o.phone || '').toLowerCase().includes(kw);
  });

  const curVal = select.value;
  select.innerHTML = '<option value="">-- Chọn đơn hàng đã xác nhận --</option>' +
    filtered.map(o => `<option value="${o.id}">[${o.id}] - ${o.customer || 'Khách lẻ'} (${o.phone || 'Không SĐT'}) - ${formatPrice(o.total || 0)}</option>`).join('');
  if (curVal && filtered.some(o => o.id === curVal)) {
    select.value = curVal;
  }
}

function onReturnOrderSelected(orderId) {
  const summaryCard = document.getElementById('rc_orderSummaryCard');
  const tbody = document.getElementById('rc_itemsTableBody');

  if (!orderId) {
    _currentReturnOrder = null;
    if (summaryCard) summaryCard.classList.add('hidden');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 italic">Vui lòng chọn đơn hàng ở trên để hiển thị danh sách sản phẩm.</td></tr>`;
    }
    calculateReturnTotals();
    return;
  }

  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  _currentReturnOrder = order;

  // Hiển thị tóm tắt đơn hàng theo thiết kế Stitch
  if (summaryCard) {
    const idEl = document.getElementById('rc_sumOrderId');
    if (idEl) idEl.textContent = '#' + order.id;

    const dateEl = document.getElementById('rc_sumOrderDate');
    if (dateEl) dateEl.textContent = formatOrderDateText(order.createdAt);

    const custEl = document.getElementById('rc_sumCustomer');
    if (custEl) custEl.textContent = order.customer || 'Khách lẻ';

    const phoneEl = document.getElementById('rc_sumPhone');
    if (phoneEl) phoneEl.textContent = order.phone || '—';

    const totalEl = document.getElementById('rc_sumTotal');
    if (totalEl) totalEl.textContent = formatPrice(order.total || 0);

    summaryCard.classList.remove('hidden');
  }

  // Tính số lượng đã trả trước đó của từng mặt hàng
  const prevReturnedQtyByCode = {};
  (orderReturns || []).filter(r => r.orderId === orderId).forEach(ret => {
    (ret.items || []).forEach(it => {
      const code = (it.ma || it.sku || it.productId || '').trim();
      if (code) prevReturnedQtyByCode[code] = (prevReturnedQtyByCode[code] || 0) + (Number(it.returnQty) || 0);
    });
  });

  const items = order.items || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-amber-500 font-bold">Đơn hàng này không có sản phẩm nào.</td></tr>`;
    calculateReturnTotals();
    return;
  }

  tbody.innerHTML = items.map((item, idx) => {
    const code = (item.ma || item.productId || item.sku || `SP_${idx}`).trim();
    const name = item.ten || item.name || 'Sản phẩm';
    const unit = item.donvi || item.unit || 'Cái';
    const unitPrice = parseFloat(item.unitPrice !== undefined ? item.unitPrice : (item.gia || 0)) || 0;
    const purchasedQty = parseFloat(item.quantity !== undefined ? item.quantity : (item.qty || 0)) || 0;
    const alreadyReturned = prevReturnedQtyByCode[code] || 0;
    const maxCanReturn = Math.max(0, purchasedQty - alreadyReturned);

    const isFullyReturned = maxCanReturn <= 0;

    return `
      <tr class="rc-item-row hover:bg-amber-50/40 dark:hover:bg-slate-800/60 transition-colors ${isFullyReturned ? 'opacity-40 bg-slate-50/40 dark:bg-slate-900/30' : ''}" data-code="${code}" data-price="${unitPrice}" data-max="${maxCanReturn}">
        <td class="py-3 px-3 pl-4 font-mono font-semibold text-slate-500 text-[11px]">
          ${code}
        </td>
        <td class="py-3 px-3">
          <div class="font-bold text-slate-800 dark:text-slate-100 text-[13px]">${name}</div>
          <div class="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
            <span>ĐVT: <strong class="text-slate-600 dark:text-slate-300 font-semibold">${unit}</strong></span>
          </div>
        </td>
        <td class="py-3 px-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
          ${formatPrice(unitPrice)}
        </td>
        <td class="py-3 px-2 text-center font-mono font-semibold text-slate-600 dark:text-slate-300">
          ${purchasedQty}
        </td>
        <td class="py-3 px-2 text-center font-mono text-slate-400">
          ${alreadyReturned}
        </td>
        <td class="py-3 px-2 text-center">
          <span class="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs ${isFullyReturned ? 'text-slate-400 bg-slate-100 dark:bg-slate-800' : 'text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/70 border border-amber-300/60 dark:border-amber-700/60'}">
            ${maxCanReturn}
          </span>
        </td>
        <td class="py-3 px-3 text-center">
          ${isFullyReturned ? `
            <span class="text-[11px] font-bold text-slate-400 italic">Đã trả đủ</span>
          ` : `
            <div class="flex items-center justify-center gap-1">
              <button type="button" onclick="stepReturnQty(this, -1)"
                class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center text-xs border border-slate-300 dark:border-slate-700 transition cursor-pointer select-none">
                -
              </button>
              <input type="number" min="0" max="${maxCanReturn}" step="1" value="0"
                class="rc-qty-input w-12 h-7 text-center font-mono font-bold text-xs bg-white dark:bg-slate-800 border border-amber-400 dark:border-amber-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                oninput="onReturnQtyInput(this)" />
              <button type="button" onclick="stepReturnQty(this, 1)"
                class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center text-xs border border-slate-300 dark:border-slate-700 transition cursor-pointer select-none">
                +
              </button>
              <button type="button" title="Trả tối đa" onclick="setRowReturnMax(this)"
                class="px-1.5 h-7 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-300 text-[11px] font-bold border border-amber-300 dark:border-amber-700 transition cursor-pointer select-none">
                Hết
              </button>
            </div>
          `}
        </td>
        <td class="py-3 px-4 pr-5 text-right font-mono font-bold text-rose-600 dark:text-rose-400 text-sm rc-row-total">
          0₫
        </td>
      </tr>
    `;
  }).join('');

  calculateReturnTotals();
}

function stepReturnQty(btn, delta) {
  const row = btn.closest('.rc-item-row');
  if (!row) return;
  const max = parseFloat(row.getAttribute('data-max')) || 0;
  const input = row.querySelector('.rc-qty-input');
  if (!input) return;
  let val = (parseFloat(input.value) || 0) + delta;
  if (val < 0) val = 0;
  if (val > max) val = max;
  input.value = val;
  onReturnQtyInput(input);
}

function onReturnQtyInput(inputEl) {
  const row = inputEl.closest('.rc-item-row');
  const max = parseFloat(row.getAttribute('data-max')) || 0;
  let val = parseFloat(inputEl.value) || 0;

  if (val < 0) val = 0;
  if (val > max) {
    val = max;
    showToast(`Số lượng trả không thể vượt quá ${max}`, 'warning');
  }
  inputEl.value = val;

  const price = parseFloat(row.getAttribute('data-price')) || 0;
  const rowTotal = Math.round(val * price);
  row.querySelector('.rc-row-total').textContent = formatPrice(rowTotal);

  calculateReturnTotals();
}

function setRowReturnMax(btn) {
  const row = btn.closest('.rc-item-row');
  const max = parseFloat(row.getAttribute('data-max')) || 0;
  const input = row.querySelector('.rc-qty-input');
  if (input) {
    input.value = max;
    onReturnQtyInput(input);
  }
}

function returnAllRemainingItems() {
  document.querySelectorAll('.rc-item-row').forEach(row => {
    const max = parseFloat(row.getAttribute('data-max')) || 0;
    const input = row.querySelector('.rc-qty-input');
    if (input && max > 0) {
      input.value = max;
      const price = parseFloat(row.getAttribute('data-price')) || 0;
      row.querySelector('.rc-row-total').textContent = formatPrice(Math.round(max * price));
    }
  });
  calculateReturnTotals();
}

function resetAllReturnQuantities() {
  document.querySelectorAll('.rc-item-row').forEach(row => {
    const input = row.querySelector('.rc-qty-input');
    if (input) {
      input.value = 0;
      row.querySelector('.rc-row-total').textContent = '0₫';
    }
  });
  calculateReturnTotals();
}

function updateRestockSummaryNotice() {
  const cb = document.getElementById('rc_restockCheckbox');
  const notice = document.getElementById('rc_restockNoticeText');
  if (!notice) return;
  if (!cb || !cb.checked) {
    notice.innerHTML = `<span class="text-slate-500 italic">Không hoàn hàng về kho. Dữ liệu tồn kho sẽ giữ nguyên không đổi.</span>`;
    return;
  }
  let totalQty = 0;
  document.querySelectorAll('.rc-item-row').forEach(row => {
    const input = row.querySelector('.rc-qty-input');
    if (input) totalQty += parseFloat(input.value) || 0;
  });
  if (totalQty > 0) {
    notice.innerHTML = `Hệ thống sẽ <strong>tự động cộng dồn ${totalQty} sản phẩm</strong> vào dữ liệu tồn kho ngay khi tạo phiếu.`;
  } else {
    notice.innerHTML = `Hệ thống sẽ <strong>tự động cộng dồn số lượng trả</strong> vào dữ liệu tồn kho sản phẩm ngay khi tạo phiếu.`;
  }
}

function calculateReturnTotals() {
  let totalQty = 0;
  let totalRefund = 0;
  let itemsCount = 0;

  document.querySelectorAll('.rc-item-row').forEach(row => {
    const input = row.querySelector('.rc-qty-input');
    if (input) {
      const qty = parseFloat(input.value) || 0;
      const price = parseFloat(row.getAttribute('data-price')) || 0;
      if (qty > 0) {
        totalQty += qty;
        totalRefund += Math.round(qty * price);
        itemsCount++;
      }
    }
  });

  const footerQty = document.getElementById('rc_footerQty');
  if (footerQty) {
    footerQty.textContent = totalQty > 0 ? `${totalQty} SP (${itemsCount} mặt hàng)` : `0 SP`;
  }

  const footerTotal = document.getElementById('rc_footerTotal');
  if (footerTotal) footerTotal.textContent = formatPrice(totalRefund);

  updateRestockSummaryNotice();
}

function toggleCustomReason(val) {
  const customInput = document.getElementById('rc_reasonCustom');
  if (customInput) {
    if (val === 'Khác') {
      customInput.classList.remove('hidden');
      customInput.focus();
    } else {
      customInput.classList.add('hidden');
    }
  }
}

async function submitCreateReturn(btn) {
  if (!_currentReturnOrder) {
    showToast('Vui lòng chọn đơn hàng cần trả.', 'error');
    return;
  }

  // 1. RÀNG BUỘC CHỈ CHO PHÉP ĐƠN "ĐÃ XÁC NHẬN"
  if (_currentReturnOrder.status !== 'Đã xác nhận') {
    showToast(`Chỉ cho phép trả hàng cho đơn "Đã xác nhận". Đơn này đang "${_currentReturnOrder.status}".`, 'error');
    return;
  }

  // 2. Thu thập danh sách sản phẩm trả
  const items = [];
  document.querySelectorAll('.rc-item-row').forEach(row => {
    const input = row.querySelector('.rc-qty-input');
    if (input) {
      const returnQty = parseFloat(input.value) || 0;
      if (returnQty > 0) {
        items.push({
          ma: row.getAttribute('data-code'),
          returnQty: returnQty
        });
      }
    }
  });

  if (items.length === 0) {
    showToast('Vui lòng nhập số lượng trả cho ít nhất một sản phẩm.', 'warning');
    return;
  }

  let reason = document.getElementById('rc_reasonSelect')?.value || 'Khách đổi ý';
  if (reason === 'Khác') {
    const customReason = (document.getElementById('rc_reasonCustom')?.value || '').trim();
    if (customReason) reason = customReason;
  }

  const note = (document.getElementById('rc_note')?.value || '').trim();
  const restock = Boolean(document.getElementById('rc_restockCheckbox')?.checked);

  const payload = {
    orderId: _currentReturnOrder.id,
    items,
    reason,
    note,
    restock
  };

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-slate-950"></i> <span>Đang tạo phiếu...</span>';

  try {
    const res = await adminFetch('/api/admin/returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'Lỗi khi tạo phiếu trả hàng.');
    }

    showToast('<i class="fa-solid fa-circle-check"></i> Đã tạo phiếu trả hàng thành công!', 'success');
    closeModal('returnCreateModal');

    // Tải lại phiếu trả và sản phẩm (nếu có hoàn kho)
    await loadReturns();
    if (restock && typeof loadProducts === 'function') {
      await loadProducts();
      if (typeof renderAdminTable === 'function') renderAdminTable();
    }
  } catch (err) {
    console.error(err);
    showToast(`<i class="fa-solid fa-xmark"></i> ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

function viewReturnDetail(returnId) {
  const ret = orderReturns.find(r => r.id === returnId);
  if (!ret) {
    showToast('Không tìm thấy thông tin phiếu trả hàng.', 'error');
    return;
  }

  const titleEl = document.getElementById('rd_modalTitle');
  if (titleEl) titleEl.textContent = `Chi tiết phiếu trả hàng [${ret.id}]`;

  const bodyEl = document.getElementById('returnDetailBody');
  if (!bodyEl) return;

  const totalQty = (ret.items || []).reduce((acc, cur) => acc + (Number(cur.returnQty) || 0), 0);

  bodyEl.innerHTML = `
    <div class="space-y-4">
      <!-- Info Cards (Stitch Style) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 text-xs">
        <div>
          <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Mã phiếu trả</span>
          <span class="font-mono font-extrabold text-slate-900 dark:text-amber-400 text-sm">${ret.id}</span>
        </div>
        <div>
          <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Đơn hàng gốc</span>
          <button type="button" onclick="viewOrderDetail('${ret.orderId}');closeModal('returnDetailModal')"
            class="font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
            #${ret.orderId}
          </button>
        </div>
        <div>
          <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Thời gian tạo</span>
          <strong class="font-bold text-slate-800 dark:text-slate-200">${ret.createdAt || '—'}</strong>
        </div>
        <div>
          <span class="text-slate-400 block mb-0.5 text-[11px] font-bold uppercase tracking-wider">Tình trạng kho</span>
          ${ret.restock
            ? '<span class="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400"><i class="fa-solid fa-circle-check text-[10px]"></i> Đã cộng lại tồn kho</span>'
            : '<span class="text-slate-500 font-bold">Không hoàn kho</span>'
          }
        </div>
      </div>

      <!-- Customer Card -->
      <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-xs flex flex-wrap gap-6 text-slate-600 dark:text-slate-300 shadow-xs">
        <div>Khách hàng: <strong class="text-slate-900 dark:text-white font-bold">${ret.customer || 'Khách lẻ'}</strong></div>
        <div>Số điện thoại: <strong class="text-slate-900 dark:text-white font-mono font-semibold">${ret.phone || '—'}</strong></div>
        <div>Địa chỉ: <strong class="text-slate-900 dark:text-white">${ret.address || '—'}</strong></div>
        <div>Lý do trả: <strong class="text-amber-600 dark:text-amber-400 font-bold">${ret.reason || '—'}</strong></div>
      </div>

      ${ret.note ? `
        <div class="p-3.5 bg-amber-50/70 dark:bg-amber-950/40 rounded-2xl border border-amber-200/80 dark:border-amber-800/60 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5">
          <i class="fa-solid fa-note-sticky text-amber-500 mt-0.5"></i>
          <div><strong>Ghi chú:</strong> ${ret.note}</div>
        </div>
      ` : ''}

      <!-- Items Table -->
      <div class="overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[11px] tracking-wider">
            <tr>
              <th class="py-3 px-3 text-left">#</th>
              <th class="py-3 px-3 text-left">Mã SP</th>
              <th class="py-3 px-3 text-left">Tên sản phẩm</th>
              <th class="py-3 px-3 text-center">ĐVT</th>
              <th class="py-3 px-3 text-right">Đơn giá hoàn</th>
              <th class="py-3 px-3 text-center">SL Trả</th>
              <th class="py-3 px-4 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            ${(ret.items || []).map((it, idx) => `
              <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                <td class="py-3 px-3 text-slate-400">${idx + 1}</td>
                <td class="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">${it.ma}</td>
                <td class="py-3 px-3 font-semibold text-slate-900 dark:text-white">${it.ten || it.ma}</td>
                <td class="py-3 px-3 text-center text-slate-500">${it.donvi || '—'}</td>
                <td class="py-3 px-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">${formatPrice(it.unitPrice || 0)}</td>
                <td class="py-3 px-3 text-center font-black text-slate-900 dark:text-white text-xs">${it.returnQty}</td>
                <td class="py-3 px-4 text-right font-black text-rose-600 dark:text-rose-400 font-mono text-xs">${formatPrice(it.returnTotal || (it.returnQty * it.unitPrice) || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot class="bg-slate-50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
            <tr>
              <td colspan="5" class="py-3 px-3 text-right text-slate-600 dark:text-slate-300">Tổng cộng (${totalQty} sản phẩm):</td>
              <td class="py-3 px-3 text-center font-black text-slate-900 dark:text-white">${totalQty}</td>
              <td class="py-3 px-4 text-right font-black text-rose-600 dark:text-rose-400 text-sm font-mono">${formatPrice(ret.totalRefund || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Modal Actions (Synchronized with Orders Detail) -->
      <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 flex-wrap gap-2">
        <div class="flex items-center gap-2 flex-wrap">
          <button type="button" onclick="printReturnSlip('${ret.id}')"
            class="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-450 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer active:scale-95">
            <i class="fa-solid fa-print"></i> In Phiếu (A4/A5)
          </button>
          <button type="button" onclick="viewOrderDetail('${ret.orderId}');closeModal('returnDetailModal')"
            class="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-xl border border-indigo-200 dark:border-indigo-800/60 transition flex items-center gap-2 cursor-pointer">
            <i class="fa-solid fa-receipt"></i> Xem đơn hàng gốc #${ret.orderId}
          </button>
          <button type="button" onclick="deleteReturnSlip('${ret.id}');closeModal('returnDetailModal')"
            class="px-4 py-2.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-bold text-xs rounded-xl border border-rose-200 dark:border-rose-800/60 transition flex items-center gap-2 cursor-pointer">
            <i class="fa-solid fa-trash-can"></i> Xóa phiếu trả
          </button>
        </div>
        <button type="button" onclick="closeModal('returnDetailModal')"
          class="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer">
          Đóng
        </button>
      </div>
    </div>
  `;

  document.getElementById('returnDetailModal').classList.add('open');
}

function numberToVietnameseWords(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return 'Không đồng chẵn';
  if (num < 0) return 'Âm ' + numberToVietnameseWords(-num);

  function readGroup3(g, showZeroHundred) {
    const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
    const tram = Math.floor(g / 100);
    const chuc = Math.floor((g % 100) / 10);
    const donvi = g % 10;
    const res = [];

    if (tram > 0 || showZeroHundred) {
      res.push(digits[tram] + ' trăm');
    }

    if (chuc > 1) {
      res.push(digits[chuc] + ' mươi');
      if (donvi === 1) res.push('mốt');
      else if (donvi === 5) res.push('lăm');
      else if (donvi > 0) res.push(digits[donvi]);
    } else if (chuc === 1) {
      res.push('mười');
      if (donvi === 5) res.push('lăm');
      else if (donvi > 0) res.push(digits[donvi]);
    } else {
      if ((tram > 0 || showZeroHundred) && donvi > 0) {
        res.push('lẻ');
      }
      if (donvi > 0) {
        res.push(digits[donvi]);
      }
    }
    return res.join(' ');
  }

  const scales = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const groups = [];
  let temp = num;
  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  const words = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g > 0) {
      const isFirst = (i === groups.length - 1);
      const gText = readGroup3(g, !isFirst);
      words.push(gText + (scales[i] ? ' ' + scales[i] : ''));
    }
  }

  let result = words.join(' ').replace(/\s+/g, ' ').trim();
  result = result.charAt(0).toUpperCase() + result.slice(1) + ' đồng chẵn';
  return result;
}

async function printReturnSlip(returnId) {
  const ret = orderReturns.find(r => r.id === returnId);
  if (!ret) return;

  // Lấy thông tin cửa hàng từ settings
  let shopName = 'CỬA HÀNG ĐIỆN NƯỚC & VẬT TƯ HỮU TÁNH';
  let shopPhone = '0945 592 209';
  let shopAddress = 'Thị trấn Thốt Nốt, Q. Thốt Nốt, TP. Cần Thơ';
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    if (s.shopName) shopName = s.shopName;
    if (s.phone) shopPhone = s.phone;
    if (s.address) shopAddress = s.address;
  } catch (_) { }

  // Định dạng ngày in phiếu
  const now = new Date();
  const printDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

  const totalQty = (ret.items || []).reduce((acc, cur) => acc + (Number(cur.returnQty) || 0), 0);
  const totalRefundInWords = numberToVietnameseWords(ret.totalRefund || 0);
  const customerName = ret.customer || 'Khách lẻ';
  const returnAddress = ret.address || '—';

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Phiếu Trả Hàng & Hoàn Tiền - ${ret.id}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Times New Roman", Times, serif; padding: 14mm 15mm; color: #000; line-height: 1.45; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
    .store-name { font-size: 18px; font-weight: bold; color: #000; text-transform: uppercase; }
    .store-sub { font-size: 13px; color: #333; margin-top: 2px; }
    .slip-meta { text-align: right; }
    .slip-code { font-weight: bold; font-size: 16px; color: #000; }
    .title { text-align: center; font-size: 22px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; color: #000; }
    .sub-title { text-align: center; font-size: 13px; color: #333; margin-bottom: 20px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-bottom: 20px; background: #fff; padding: 14px 18px; border-radius: 8px; border: 1px solid #ccc; font-size: 13.5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #fff; }
    th, td { border: 1px solid #555; padding: 7px 8px; font-size: 13px; background: #fff; }
    th { background: #fff; font-weight: bold; text-align: center; font-size: 13px; white-space: nowrap; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .total-row { font-weight: bold; font-size: 13.5px; background: #fff; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; margin-top: 36px; padding-top: 10px; }
    .sig-block { font-size: 13px; }
    .sig-role { font-weight: bold; color: #000; }
    .sig-sub { color: #555; font-size: 12px; margin-top: 2px; font-style: italic; }
    .sig-space { height: 75px; }
    .footer-note { text-align: center; font-size: 12px; color: #555; margin-top: 25px; border-top: 1px dashed #ccc; padding-top: 10px; font-style: italic; }
    .words-note { text-align: right; font-size: 13px; font-style: italic; color: #333; margin-top: -12px; margin-bottom: 16px; }
    @media print {
      body { padding: 14mm 15mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="store-name">${shopName}</div>
      ${shopAddress ? `<div class="store-sub">${shopAddress}</div>` : ''}
      ${shopPhone ? `<div class="store-sub" style="white-space:nowrap">Hotline: ${shopPhone}</div>` : ''}
    </div>
    <div class="slip-meta">
      <div class="slip-code">${ret.id}</div>
      <div style="color:#555;font-size:12px;margin-top:2px">Ngày in: ${printDate}</div>
    </div>
  </div>

  <div class="title">PHIẾU TRẢ HÀNG & HOÀN TIỀN</div>
  <div class="sub-title">(Kèm theo đơn hàng gốc: <strong style="color:#000">#${ret.orderId}</strong> - Ngày lập: <strong style="color:#000">${formatOrderDateOnly(ret.createdAt) || printDate}</strong>)</div>

  <div class="info-grid">
    <div><strong>Khách hàng:</strong> ${customerName}</div>
    <div><strong>Số điện thoại:</strong> ${ret.phone || '—'}</div>
    <div style="grid-column: span 2"><strong>Địa chỉ:</strong> ${returnAddress}</div>
    <div><strong>Lý do trả hàng:</strong> ${ret.reason || '—'}</div>
    <div><strong>Tình trạng nhập kho:</strong> <span style="font-weight:bold;color:${ret.restock ? '#15803d' : '#444'}">${ret.restock ? 'Đã hoàn hàng về tồn kho' : 'Không nhập lại kho'}</span></div>
    ${ret.note ? `<div style="grid-column: span 2"><strong>Ghi chú:</strong> ${ret.note}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:38px;text-align:center;white-space:nowrap">STT</th>
        <th style="width:120px;text-align:center;white-space:nowrap">Mã SP</th>
        <th style="min-width:140px;text-align:center">Tên sản phẩm</th>
        <th style="width:55px;text-align:center;white-space:nowrap">ĐVT</th>
        <th style="width:90px;text-align:center;white-space:nowrap">Đơn giá</th>
        <th style="width:95px;text-align:center;white-space:nowrap">Số lượng trả</th>
        <th style="width:115px;text-align:center;white-space:nowrap">Thành tiền hoàn</th>
        <th style="width:80px;text-align:center;white-space:nowrap">Ghi chú</th>
      </tr>
    </thead>
    <tbody>
      ${(ret.items || []).map((it, idx) => `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td style="font-weight:600;white-space:nowrap">${it.ma}</td>
          <td>${it.ten || it.ma}</td>
          <td class="text-center" style="white-space:nowrap">${it.donvi || 'Cái'}</td>
          <td class="text-right" style="white-space:nowrap">${it.unitPrice ? it.unitPrice.toLocaleString('vi-VN') + '₫' : '0₫'}</td>
          <td class="text-center" style="font-weight:700;white-space:nowrap">${it.returnQty}</td>
          <td class="text-right" style="font-weight:700;color:#b91c1c;white-space:nowrap">${it.returnTotal ? it.returnTotal.toLocaleString('vi-VN') + '₫' : '0₫'}</td>
          <td style="font-size:11px;color:#64748b">${it.reason || ''}</td>
        </tr>
      `).join('')}
    </tbody>
    <tfoot>
      <tr class="total-row" style="background:#fff;font-size:13.5px;border-top:2px solid #000">
        <td colspan="5" class="text-right" style="font-weight:bold">TỔNG CỘNG TIỀN HOÀN TRẢ:</td>
        <td class="text-center" style="font-weight:bold;white-space:nowrap">${totalQty}</td>
        <td class="text-right" style="color:#b91c1c;font-weight:bold;font-size:14px;white-space:nowrap">${(ret.totalRefund || 0).toLocaleString('vi-VN')}₫</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="words-note">
    (Bằng chữ: <strong>${totalRefundInWords}</strong>)
  </div>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-role">Người trả hàng</div>
      <div class="sig-sub">(Ký & ghi rõ họ tên)</div>
      <div class="sig-space"></div>
    </div>
    <div class="sig-block">
      <div class="sig-role">Thủ kho nhận hàng</div>
      <div class="sig-sub">(Ký & ghi rõ họ tên)</div>
      <div class="sig-space"></div>
    </div>
    <div class="sig-block">
      <div class="sig-role">Người lập phiếu</div>
      <div class="sig-sub">(Ký & ghi rõ họ tên)</div>
      <div class="sig-space"></div>
    </div>
  </div>

  <div class="footer-note">
    <strong>Cửa hàng Hữu Tánh xác nhận đã hoàn tất thủ tục nhận trả hàng và hoàn tiền!</strong><br>
    Chứng từ này được lập thành 03 bản có giá trị như nhau: Khách hàng giữ 01 bản, Kế toán lưu 01 bản, Thủ kho lưu 01 bản.
  </div>

  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=880,height=960');
  if (!win) {
    showToast('Trình duyệt đã chặn cửa sổ in (Pop-up). Vui lòng cấp quyền mở pop-up.', 'warning');
    return;
  }
  win.document.write(html);
  win.document.close();
}


async function deleteReturnSlip(returnId) {
  const ret = orderReturns.find(r => r.id === returnId);
  if (!ret) return;

  const confirmed = await showDeleteConfirmModal({
    title: 'Xóa phiếu trả hàng',
    target: `Phiếu trả ${ret.id} (${formatPrice(ret.totalRefund || 0)})`,
    desc: `Bạn có chắc chắn muốn xóa phiếu trả hàng này? ${ret.restock ? 'Hệ thống sẽ tự động trừ lại số lượng tồn kho đã hoàn trước đó.' : ''} Thao tác này không thể hoàn tác.`,
    confirmText: 'Xóa phiếu trả'
  });

  if (!confirmed) return;

  try {
    const res = await adminFetch(`/api/admin/returns/${returnId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'Không thể xóa phiếu trả hàng.');
    }

    showToast('<i class="fa-solid fa-circle-check"></i> Đã xóa phiếu trả hàng!', 'success');
    await loadReturns();

    if (ret.restock && typeof loadProducts === 'function') {
      await loadProducts();
      if (typeof renderAdminTable === 'function') renderAdminTable();
    }
  } catch (err) {
    console.error(err);
    showToast(`<i class="fa-solid fa-xmark"></i> ${err.message}`, 'error');
  }
}




