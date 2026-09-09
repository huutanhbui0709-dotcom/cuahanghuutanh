// ==============================
// STATE
// ==============================
let products = [];
let cart = [];
let currentType = 'bestseller'; // default: show best sellers first

const ITEMS_PER_PAGE = 24;
let currentPage = 1;

const ICONS = {
  'ống': '<i class="fa-solid fa-bucket text-blue-500"></i>', 'van': '<i class="fa-solid fa-screwdriver-wrench text-slate-500"></i>', 'đèn': '<i class="fa-solid fa-lightbulb text-amber-400"></i>', 'led': '<i class="fa-solid fa-lightbulb text-amber-400"></i>', 'bóng': '<i class="fa-solid fa-lightbulb text-amber-400"></i>', 'cầu dao': '<i class="fa-solid fa-bolt text-red-500"></i>', 'dây': '<i class="fa-solid fa-link text-slate-500"></i>',
  'keo': '<i class="fa-solid fa-clamp text-slate-500"></i>', 'cưa': '<i class="fa-solid fa-ruler text-slate-500"></i>', 'khoan': '<i class="fa-solid fa-wrench text-slate-500"></i>', 'mũi': '<i class="fa-solid fa-wrench text-slate-500"></i>', 'tô vít': '<i class="fa-solid fa-screwdriver text-slate-500"></i>', 'kìm': '<i class="fa-solid fa-wrench text-slate-500"></i>',
  'mỏ lết': '<i class="fa-solid fa-wrench text-slate-500"></i>', 'bình': '<i class="fa-solid fa-bottle-water text-blue-400"></i>', 'quạt': '<i class="fa-solid fa-fan text-slate-500"></i>', 'ổ cắm': '<i class="fa-solid fa-plug text-slate-500"></i>', 'công tắc': '<i class="fa-solid fa-power-off text-red-500"></i>', 'phích': '<i class="fa-solid fa-plug text-slate-500"></i>',
  'ốc': '<i class="fa-solid fa-nut text-slate-500"></i>', 'vít': '<i class="fa-solid fa-screwdriver text-slate-500"></i>', 'sơn': '<i class="fa-solid fa-paint-roller text-blue-500"></i>', 'xe rùa': '<i class="fa-solid fa-truck-pickup text-slate-500"></i>', 'xẻng': '<i class="fa-solid fa-trowel text-slate-500"></i>', 'co': '<i class="fa-solid fa-screwdriver-wrench text-slate-500"></i>',
  'măng': '<i class="fa-solid fa-screwdriver-wrench text-slate-500"></i>', 'đá cắt': '<i class="fa-solid fa-compact-disc text-slate-500"></i>', 'đá mài': '<i class="fa-solid fa-compact-disc text-slate-500"></i>', 'lưỡi': '<i class="fa-solid fa-compact-disc text-slate-500"></i>', 'bộ sen': '<i class="fa-solid fa-shower text-blue-400"></i>', 'vòi': '<i class="fa-solid fa-shower text-blue-400"></i>',
  'hộp': '<i class="fa-solid fa-box text-amber-600"></i>', 'dao': '<i class="fa-solid fa-knife text-slate-500"></i>', 'bàn chải': '<i class="fa-solid fa-brush text-slate-500"></i>', 'silicone': '<i class="fa-solid fa-pump-medical text-slate-500"></i>', 'luppe': '<i class="fa-solid fa-screwdriver-wrench text-slate-500"></i>'
};

function getIcon(name) {
  const n = (name || '').toLowerCase();
  for (const [key, icon] of Object.entries(ICONS)) {
    if (n.includes(key)) return icon;
  }
  return '<i class="fa-solid fa-box text-slate-400"></i>';
}

function formatPrice(p) {
  if (!p || p === 0) return 'Liên hệ';
  return p.toLocaleString('vi-VN') + '₫';
}

function formatPriceMobile(p) {
  if (!p || p === 0) return 'Liên hệ';
  if (p >= 1000000) {
    const tr = p / 1000000;
    return (tr % 1 === 0 ? tr.toFixed(0) : tr.toFixed(tr >= 10 ? 1 : 2).replace(/0+$/, '').replace(/\.$/, '')) + 'Tr';
  }
  if (p >= 100000) {
    const k = p / 1000;
    const res = (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1).replace(/0+$/, '').replace(/\.$/, ''));
    if (res === '1000') return '1Tr';
    return res + 'K';
  }
  return p.toLocaleString('vi-VN') + '₫';
}

function getProductImageUrl(p) {
  if (!p || !p.image) return '';
  return p.image + (p.updatedAt ? `?t=${p.updatedAt}` : '');
}

// ==============================
// THEME (DARK / LIGHT)
// ==============================
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeUI(isDark);
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


// ==============================
// LOAD DATA FROM SERVER
// ==============================
// Build per-type product counts
function getTypeCounts() {
  const counts = {};
  products.forEach(p => {
    if (!p.ma || !p.ten) return;
    const t = p.loai || 'Khác';
    counts[t] = (counts[t] || 0) + 1;
  });
  return counts;
}

// Scroll to the product controls area (just below the hero)
// so selecting a category never leaves the user stranded at the footer.
function scrollToGrid(behavior = 'smooth') {
  const target = document.getElementById('shopMainLayout');
  if (!target) return;
  const navH = document.querySelector('nav')?.offsetHeight || 72;
  const targetTop = target.getBoundingClientRect().top;

  // Only adjust scroll if the user has scrolled past the top of the grid
  if (targetTop < navH) {
    const top = targetTop + window.scrollY - navH - 8;
    window.scrollTo({ top: Math.max(0, top), behavior });
  }
}

function setCategory(type) {
  currentType = type;
  currentPage = 1;
  // Update sidebar buttons
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  // Update mobile pills
  document.querySelectorAll('.cat-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.type === type);
  });
  // Scroll first, then re-render — prevents jump to footer
  scrollToGrid('smooth');
  renderShop();
}

function populateTypeFilter() {
  const types = [...new Set(products.map(p => p.loai).filter(Boolean))];
  const counts = getTypeCounts();
  const totalValid = products.filter(p => p.ma && p.ten).length;
  const totalBestseller = products.filter(p => p.ma && p.ten && p.isBestSeller).length;

  // ---- Sidebar buttons (#categoryList) ----
  const listEl = document.getElementById('categoryList');
  if (listEl) {
    listEl.innerHTML = [
      { label: 'Tất cả', value: '', count: totalValid },
      { label: '⭐ Bán chạy nhất', value: 'bestseller', count: totalBestseller },
      ...types.map(t => ({ label: t, value: t, count: counts[t] || 0 }))
    ].map(item => `
      <button class="cat-btn${item.value === currentType ? ' active' : ''}" data-type="${item.value}" onclick="setCategory(this.dataset.type)">
        <span class="cat-dot"></span>
        <span class="flex-1 truncate">${item.label}</span>
        <span class="cat-count-badge">${item.count}</span>
      </button>
    `).join('');
  }

  // ---- Mobile pill row (#categoryMobileRow) ----
  const pillEl = document.getElementById('categoryMobileRow');
  if (pillEl) {
    pillEl.innerHTML = [
      { label: 'Tất cả', value: '', count: totalValid },
      { label: '⭐ Bán chạy nhất', value: 'bestseller', count: totalBestseller },
      ...types.map(t => ({ label: t, value: t, count: counts[t] || 0 }))
    ].map(item => `
      <button class="cat-pill${item.value === currentType ? ' active' : ''}" data-type="${item.value}" onclick="setCategory(this.dataset.type)">
        ${item.label}
        <span style="font-size:0.7rem;opacity:0.75;">${item.count}</span>
      </button>
    `).join('');
  }
}

// Hiển thị skeleton loading trước khi dữ liệu sẵn sàng
function showSkeletonGrid() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  const skeletonCount = window.innerWidth < 640 ? 6 : 12;
  grid.innerHTML = Array.from({ length: skeletonCount }, () => `
    <div class="sm:hidden bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full animate-pulse">
      <div class="aspect-square bg-slate-200"></div>
      <div class="p-2.5 flex flex-col gap-2">
        <div class="h-3 bg-slate-200 rounded w-3/4"></div>
        <div class="h-2 bg-slate-100 rounded w-1/2"></div>
        <div class="mt-auto flex items-end justify-between pt-2 border-t border-slate-100">
          <div class="h-4 bg-slate-200 rounded w-16"></div>
          <div class="w-8 h-8 bg-slate-200 rounded-lg"></div>
        </div>
      </div>
    </div>
    <div class="max-sm:hidden bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full animate-pulse">
      <div class="aspect-[4/3] bg-slate-200 border-b border-slate-100"></div>
      <div class="p-4 flex flex-col gap-2">
        <div class="h-2 bg-slate-100 rounded w-1/3"></div>
        <div class="h-4 bg-slate-200 rounded w-3/4"></div>
        <div class="mt-auto flex items-end justify-between pt-3 border-t border-slate-100">
          <div class="h-5 bg-slate-200 rounded w-20"></div>
          <div class="h-9 bg-slate-200 rounded-xl w-24"></div>
        </div>
      </div>
    </div>
  `).join('');
}

const PRODUCT_CACHE_KEY = 'cached_products_v1';

async function loadProducts() {
  let hasRenderedFromCache = false;

  // 1. Kiểm tra cache trong localStorage để hiển thị tức thì (0ms)
  try {
    const cached = localStorage.getItem(PRODUCT_CACHE_KEY);
    if (cached) {
      const { data } = JSON.parse(cached);
      if (Array.isArray(data) && data.length > 0) {
        products = data;
        populateTypeFilter();
        renderShop();
        hasRenderedFromCache = true;
      }
    }
  } catch (e) { /* localStorage không khả dụng, bỏ qua */ }

  // Nếu chưa có cache (lần đầu truy cập), hiển thị skeleton loader
  if (!hasRenderedFromCache) {
    showSkeletonGrid();
  }

  // 2. Luôn fetch mới trong nền (Stale-While-Revalidate) để cập nhật giá & sản phẩm mới nhất
  try {
    const res = await fetch('/api/products');
    if (res.ok) {
      const freshData = await res.json();
      const filtered = freshData.filter(p => p.trangthai !== 'Ngừng theo dõi');
      
      const hasChanged = JSON.stringify(filtered) !== JSON.stringify(products);
      products = filtered;

      try {
        localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify({ data: filtered, timestamp: Date.now() }));
      } catch (e) { /* quota exceeded, bỏ qua */ }

      // Chỉ render lại nếu chưa render từ cache hoặc dữ liệu thực sự có thay đổi
      if (!hasRenderedFromCache || hasChanged) {
        populateTypeFilter();
        renderShop();
      }
    } else if (!hasRenderedFromCache) {
      showToast('<i class="fa-solid fa-xmark"></i> Không tải được danh sách sản phẩm', 'error');
      products = [];
      renderShop();
    }
  } catch (err) {
    if (!hasRenderedFromCache) {
      showToast('<i class="fa-solid fa-xmark"></i> Không tải được danh sách sản phẩm', 'error');
      products = [];
      renderShop();
    }
  }
}

// ==============================
// SHOP
// ==============================
function getFilteredProducts() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const sort = document.getElementById('sortSelect').value;
  let list = products.filter(p => {
    if (!p.ma || !p.ten) return false;
    const match = !q || p.ten.toLowerCase().includes(q) || p.ma.toLowerCase().includes(q);
    const matchType = !currentType || (currentType === 'bestseller' ? p.isBestSeller === true : p.loai === currentType);
    return match && matchType;
  });
  if (sort === 'name_asc') list.sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
  else if (sort === 'price_asc') list.sort((a, b) => a.gia - b.gia);
  else if (sort === 'price_desc') list.sort((a, b) => b.gia - a.gia);
  else {
    // Default: bestsellers first, then rest in original order
    list.sort((a, b) => (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0));
  }
  return list;
}

function filterProducts() {
  currentPage = 1;
  scrollToGrid('auto'); // Instant scroll during typing prevents footer jump
  renderShop();
}

function renderShop() {
  const list = getFilteredProducts();
  const total = list.length;
  const pages = Math.ceil(total / ITEMS_PER_PAGE);
  const paged = list.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  document.getElementById('countBadge').textContent = `${total} sản phẩm`;
  const grid = document.getElementById('productGrid');

  // Lock current height before clearing to prevent page-height collapse
  // which causes the browser to snap scroll position down to the footer.
  grid.style.minHeight = grid.offsetHeight + 'px';

  if (paged.length === 0) {
    grid.style.minHeight = '';
    grid.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center py-16 text-slate-400">
        <div class="text-6xl mb-4 select-none">🔍</div>
        <div class="text-lg font-bold text-slate-700">Không tìm thấy sản phẩm nào</div>
      </div>
    `;
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  grid.innerHTML = paged.map(p => `

    <!-- ========== MOBILE CARD (ẩn trên sm+) ========== -->
    <div class="sm:hidden group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-300 relative w-full">
      <!-- Image area -->
      <div class="relative aspect-square bg-slate-50 flex items-center justify-center overflow-hidden cursor-pointer active:bg-slate-100 transition duration-150" onclick="showProductDetails('${p.ma.replace(/'/g, "\\'")}')">
        ${p.image ? `<img src="${getProductImageUrl(p)}" loading="lazy" decoding="async" class="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500" />` : `<span class="text-4xl select-none opacity-50 group-hover:scale-105 transition-transform duration-500">${getIcon(p.ten)}</span>`}
        <span class="absolute top-2 left-2 text-[9px] text-amber-900 bg-amber-400/90 px-1.5 py-0.5 rounded-md font-bold truncate max-w-[90px] z-10 shadow-sm">
          ${p.loai || 'Hàng hóa'}
        </span>
      </div>
      <!-- Info -->
      <div class="p-2.5 flex flex-col flex-1">
        <div class="text-[11px] font-bold text-slate-800 leading-tight line-clamp-2 mb-1.5 min-h-[28px] cursor-pointer" title="${p.ten}" onclick="showProductDetails('${p.ma.replace(/'/g, "\\'")}')">${p.ten}</div>
        <span class="text-[9px] font-mono text-slate-400 uppercase mb-1.5">${p.ma}</span>
        <div class="mt-auto flex items-end justify-between gap-1.5 pt-2 border-t border-slate-100">
          <div class="flex flex-col">
            <span class="text-sm font-black text-blue-600 leading-none">${formatPriceMobile(p.gia)}</span>
            <span class="text-[9px] text-slate-400 font-medium mt-0.5">/${p.donvi || 'Cái'}</span>
          </div>
          <button class="shrink-0 w-8 h-8 bg-slate-100 text-slate-600 group-hover:bg-amber-500 group-hover:text-slate-900 rounded-lg flex items-center justify-center transition-colors duration-300 active:scale-90 text-xs shadow-sm" onclick="addToCart('${p.ma.replace(/'/g, "\\'")}')" title="Thêm vào giỏ">
            <i class="fa-solid fa-cart-plus"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- ========== DESKTOP CARD (ẩn trên mobile) ========== -->
    <div class="max-sm:hidden group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-300">
      <div class="relative aspect-[4/3] bg-slate-50 border-b border-slate-100 flex items-center justify-center overflow-hidden cursor-pointer p-4" onclick="showProductDetails('${p.ma.replace(/'/g, "\\'")}')">
        ${p.image ? `<img src="${getProductImageUrl(p)}" loading="lazy" decoding="async" class="w-full h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-500" />` : `<span class="text-6xl select-none opacity-50 group-hover:scale-105 transition-transform duration-500">${getIcon(p.ten)}</span>`}
        <span class="absolute top-3 left-3 text-[11px] text-amber-900 bg-amber-400/90 px-2 py-1 rounded-md font-bold shadow-sm">
          ${p.loai || 'Hàng hóa'}
        </span>
        <!-- Hover Overlay -->
        <div class="absolute inset-0 bg-slate-900/5 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center pointer-events-none">
          <span class="w-10 h-10 rounded-full bg-white/95 text-slate-800 flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition duration-300">
            <i class="fa-solid fa-eye text-amber-500"></i>
          </span>
        </div>
      </div>
      <div class="p-4 flex flex-col flex-1">
        <span class="font-mono text-[10px] text-slate-400 uppercase mb-1 tracking-wide">${p.ma}</span>
        <div class="text-[15px] font-bold text-slate-800 leading-tight mb-2 line-clamp-2 min-h-[38px] cursor-pointer hover:text-blue-600 transition" title="${p.ten}" onclick="showProductDetails('${p.ma.replace(/'/g, "\\'")}')">${p.ten}</div>
        <div class="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
          <div class="flex items-end gap-1">
            <span class="text-xl font-black text-slate-900 leading-none">${formatPrice(p.gia)}</span>
            ${p.donvi ? `<span class="text-xs text-slate-400 font-medium mb-0.5">/${p.donvi}</span>` : ''}
          </div>
          <button class="shrink-0 px-4 py-2.5 bg-slate-100 text-slate-600 group-hover:bg-amber-500 group-hover:text-slate-900 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors duration-300 shadow-sm text-sm active:scale-[0.97]" onclick="addToCart('${p.ma.replace(/'/g, "\\'")}')" title="Thêm vào giỏ">
            <i class="fa-solid fa-cart-plus"></i>
            <span>Thêm giỏ</span>
          </button>
        </div>
      </div>
    </div>

  `).join('');

  // Release the min-height lock after new content is painted
  requestAnimationFrame(() => { grid.style.minHeight = ''; });

  renderPagination(pages, currentPage, 'pagination', (p) => {
    currentPage = p;
    scrollToGrid('smooth');
    renderShop();
  });
}

function renderPagination(total, current, id, onPage) {
  const el = document.getElementById(id);
  if (total <= 1) { el.innerHTML = ''; return; }
  const btnClass = "px-2.5 py-1.5 xs:px-4 xs:py-2 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl font-bold transition text-xs xs:text-sm sm:text-base shadow-sm flex items-center justify-center min-w-[32px] xs:min-w-[40px] h-8 xs:h-10 disabled:opacity-40 disabled:cursor-not-allowed";
  const activeClass = "px-2.5 py-1.5 xs:px-4 xs:py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 border border-amber-500 rounded-xl font-black transition text-xs xs:text-sm sm:text-base shadow-md flex items-center justify-center min-w-[32px] xs:min-w-[40px] h-8 xs:h-10";

  let html = `<button class="${btnClass}" onclick="(${onPage.toString()})(${current - 1})" ${current <= 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= total; i++) {
    if (total > 7 && Math.abs(i - current) > 2 && i !== 1 && i !== total) {
      if (i === 2 || i === total - 1) html += `<span class="px-1 text-slate-400 font-bold">…</span>`;
      continue;
    }
    html += `<button class="${i === current ? activeClass : btnClass}" onclick="(${onPage.toString()})(${i})">${i}</button>`;
  }
  html += `<button class="${btnClass}" onclick="(${onPage.toString()})(${current + 1})" ${current >= total ? 'disabled' : ''}>›</button>`;
  el.innerHTML = html;
}

// ==============================
// COOKIE HELPERS
// ==============================
function setCookie(name, value, days) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (encodeURIComponent(value) || "") + expires + "; path=/; SameSite=Lax";
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
  }
  return null;
}

function saveCart() {
  setCookie('cart', JSON.stringify(cart), 7);
}

function loadCart() {
  const saved = getCookie('cart');
  if (saved) {
    try {
      cart = JSON.parse(saved);
    } catch (e) {
      cart = [];
    }
  }
  updateCartBadge();
}

// ============================================================
// STITCH-DESIGNED DELETE CONFIRMATION MODAL LOGIC
// ============================================================
let _deleteConfirmResolver = null;

function showDeleteConfirmModal({
  title = 'Xác nhận xoá',
  target = '',
  desc = 'Bạn có chắc chắn muốn thực hiện thao tác này?',
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

async function clearCart() {
  if (cart.length === 0) return;
  const totalItems = cart.reduce((s, x) => s + x.qty, 0);
  const confirmed = await showDeleteConfirmModal({
    title: 'Xóa toàn bộ giỏ hàng',
    target: `${cart.length} loại mặt hàng (${totalItems} sản phẩm)`,
    desc: 'Bạn có chắc chắn muốn xóa tất cả sản phẩm đang có trong giỏ hàng? Thao tác này sẽ làm trống giỏ hàng của bạn.',
    confirmText: 'Xóa giỏ hàng',
    cancelText: 'Giữ lại',
    icon: 'fa-trash-can'
  });
  if (!confirmed) return;
  cart = [];
  updateCartBadge();
  saveCart();
  renderCart();
  showToast('<i class="fa-solid fa-trash-can"></i> Đã xóa toàn bộ giỏ hàng', 'info');
}

// ==============================
// CART
// ==============================
function addToCart(ma) {
  const p = products.find(x => x.ma === ma);
  if (!p) return;
  const existing = cart.find(x => x.ma === ma);
  if (existing) { existing.qty++; }
  else { cart.push({ ...p, qty: 1 }); }
  updateCartBadge();
  saveCart();
  showToast(`<i class="fa-solid fa-circle-check"></i> Đã thêm "${p.ten.substring(0, 30)}..."`, 'success');
}

function updateCartBadge() {
  const total = cart.reduce((s, x) => s + x.qty, 0);
  const badge = document.getElementById('cartCount');
  if (badge) {
    badge.textContent = total;
    badge.classList.toggle('visible', total > 0);
  }
}

function openCart() {
  document.getElementById('cartModal').classList.add('open');
  renderCart();
}

function closeCart() {
  document.getElementById('cartModal').classList.remove('open');
}

function renderCart() {
  const body = document.getElementById('cartBody');
  const footer = document.getElementById('cartFooter');
  const headerSubtitle = document.getElementById('cartHeaderSubtitle');
  const headerBadge = document.getElementById('cartHeaderBadge');

  const totalItemsCount = cart.reduce((s, x) => s + x.qty, 0);

  if (headerBadge) {
    if (totalItemsCount > 0) {
      headerBadge.textContent = totalItemsCount;
      headerBadge.classList.remove('hidden');
    } else {
      headerBadge.classList.add('hidden');
    }
  }

  if (headerSubtitle) {
    headerSubtitle.textContent = cart.length > 0 
      ? `${cart.length} loại mặt hàng (${totalItemsCount} sản phẩm)` 
      : 'Sản phẩm đã chọn';
  }

  if (cart.length === 0) {
    body.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div class="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center text-2xl mb-4 shadow-sm">
          <i class="fa-solid fa-cart-shopping"></i>
        </div>
        <div class="text-base font-bold text-slate-800">Giỏ hàng của bạn đang trống</div>
        <p class="mt-1.5 text-xs text-slate-500 max-w-[240px] leading-relaxed">Chưa có sản phẩm nào trong giỏ. Khám phá các mặt hàng chất lượng của chúng tôi ngay!</p>
        <button onclick="closeCart()" class="mt-6 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2">
          <i class="fa-solid fa-bag-shopping text-amber-400"></i> Mua sắm ngay
        </button>
      </div>
    `;
    footer.innerHTML = '';
    return;
  }

  const total = cart.reduce((s, x) => s + (x.gia * x.qty), 0);

  const itemsHtml = cart.map(item => `
    <div class="swipe-container relative overflow-hidden w-full touch-pan-y rounded-2xl border border-slate-200/80 bg-white shadow-xs hover:border-slate-300 transition-colors" data-ma="${item.ma.replace(/'/g, "\\'")}">
      <!-- Background Delete Action (Swipe on Mobile) -->
      <div class="absolute right-0 top-0 bottom-0 bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center w-16 cursor-pointer rounded-r-2xl transition" onclick="removeFromCart('${item.ma.replace(/'/g, "\\'")}')">
        <i class="fa-solid fa-trash text-base"></i>
      </div>
      <!-- Foreground content -->
      <div class="swipe-content relative bg-white transition-transform duration-150 ease-out flex gap-3 items-center p-3 w-full rounded-2xl">
        <!-- Product Image -->
        <div class="w-14 h-14 xxs:w-16 xxs:h-16 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0 relative group">
          ${item.image ? `<img src="${getProductImageUrl(item)}" class="w-full h-full object-cover" />` : `<span class="text-xl">${getIcon(item.ten)}</span>`}
        </div>

        <!-- Info & Controls -->
        <div class="flex-1 min-w-0 pr-1">
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="text-[10px] font-mono font-bold text-amber-700 bg-amber-500/10 px-1.5 py-0.5 rounded tracking-wide uppercase">${item.ma}</span>
            ${item.donvi ? `<span class="text-[11px] font-semibold text-slate-400">· ${item.donvi}</span>` : ''}
          </div>
          <div class="text-xs xxs:text-sm font-bold text-slate-800 leading-snug line-clamp-1" title="${item.ten}">${item.ten}</div>

          <!-- Quantity Adjuster & Subtotal -->
          <div class="flex items-center justify-between mt-2">
            <!-- Pill Quantity Controls -->
            <div class="inline-flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200/60">
              <button class="w-6 h-6 rounded-md bg-white hover:bg-slate-200/80 active:scale-90 text-slate-700 font-bold flex items-center justify-center text-xs transition shadow-xs" onclick="changeQty('${item.ma.replace(/'/g, "\\'")}', -1)" title="Giảm">−</button>
              <span class="w-7 text-center font-bold text-slate-800 text-xs select-none">${item.qty}</span>
              <button class="w-6 h-6 rounded-md bg-white hover:bg-slate-200/80 active:scale-90 text-slate-700 font-bold flex items-center justify-center text-xs transition shadow-xs" onclick="changeQty('${item.ma.replace(/'/g, "\\'")}', 1)" title="Tăng">+</button>
            </div>

            <!-- Price -->
            <div class="text-right">
              <div class="text-xs xxs:text-sm font-black text-slate-900">${item.gia ? formatPrice(item.gia * item.qty) : 'Liên hệ'}</div>
              ${item.qty > 1 && item.gia ? `<div class="text-[10px] text-slate-400 font-medium">${formatPrice(item.gia)}/món</div>` : ''}
            </div>
          </div>
        </div>

        <!-- Direct Delete Button -->
        <button class="w-7 h-7 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 active:scale-90 flex items-center justify-center text-xs transition flex-shrink-0 ml-1" title="Xóa sản phẩm" onclick="removeFromCart('${item.ma.replace(/'/g, "\\'")}')">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
  `).join('');

  body.innerHTML = `
    ${renderIncentiveProgressBar(total)}
    <div class="space-y-3">
      ${itemsHtml}
    </div>
    ${renderCartUpsellSection()}
  `;

  initSwipeToDelete();
  footer.innerHTML = `
    <div class="space-y-3">
      <!-- Subtotal Box -->
      <div class="bg-slate-50 rounded-xl p-3.5 border border-slate-200/60">
        <div class="flex justify-between items-center text-xs text-slate-500 font-semibold mb-1">
          <span>Tổng số lượng:</span>
          <span class="font-bold text-slate-700">${totalItemsCount} sản phẩm (${cart.length} loại)</span>
        </div>
        <div class="flex justify-between items-baseline pt-2 border-t border-slate-200/60">
          <span class="text-sm font-bold text-slate-700">Tổng thanh toán:</span>
          <span class="text-xl xs:text-2xl font-black text-slate-900 tracking-tight">${formatPrice(total)}</span>
        </div>
      </div>

      <!-- Main CTA Button -->
      <button class="w-full py-3.5 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-slate-950 rounded-xl font-extrabold text-sm sm:text-base shadow-lg shadow-amber-500/25 transition flex items-center justify-center gap-2" onclick="openOrderForm()">
        <span><i class="fa-solid fa-arrow-right-to-bracket text-slate-950"></i></span>
        <span>Tiến hành đặt hàng</span>
      </button>

      <!-- Secondary Links -->
      <div class="flex items-center justify-between pt-1 px-1">
        <button class="text-xs font-semibold text-slate-400 hover:text-rose-600 transition flex items-center gap-1.5" onclick="clearCart()">
          <i class="fa-regular fa-trash-can"></i> Xóa giỏ hàng
        </button>
        <button class="text-xs font-semibold text-slate-500 hover:text-slate-800 transition flex items-center gap-1" onclick="closeCart()">
          Tiếp tục xem hàng <i class="fa-solid fa-arrow-right text-[10px]"></i>
        </button>
      </div>
    </div>
  `;
}

function changeQty(ma, delta) {
  const item = cart.find(x => x.ma === ma);
  if (!item) return;
  if (item.qty === 1 && delta === -1) {
    removeFromCart(ma);
    return;
  }
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(x => x.ma !== ma);
  updateCartBadge();
  saveCart();
  renderCart();
}

async function removeFromCart(ma) {
  const item = cart.find(x => x.ma === ma);
  if (!item) return;

  const confirmed = await showDeleteConfirmModal({
    title: 'Xóa sản phẩm khỏi giỏ',
    target: `${item.ten} (Số lượng: ${item.qty})`,
    desc: 'Bạn có chắc chắn muốn xóa sản phẩm này ra khỏi giỏ hàng?',
    confirmText: 'Xóa món này',
    cancelText: 'Giữ lại',
    icon: 'fa-trash-can'
  });
  if (!confirmed) return;

  cart = cart.filter(x => x.ma !== ma);
  updateCartBadge();
  saveCart();
  renderCart();
  showToast(`<i class="fa-solid fa-trash-can"></i> Đã xóa "${item.ten.substring(0, 25)}..." khỏi giỏ`, 'info');
}

// ==============================
// ORDER
// ==============================
function openOrderForm() {
  closeCart();
  const warningEl = document.getElementById('orderModalWarning');
  if (warningEl) warningEl.classList.add('hidden');
  const confirmItems = document.getElementById('confirmItems');
  const total = cart.reduce((s, x) => s + (x.gia * x.qty), 0);

  const recs = getCartRecommendations(cart, 2);
  const upsellHtml = (recs && recs.length > 0) ? `
    <div class="p-3 bg-amber-50/70 dark:bg-amber-950/20 border-t border-amber-200/60 dark:border-amber-900/40">
      <div class="text-[11px] font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <i class="fa-solid fa-bolt text-amber-500"></i> Ưu đãi phút chót (Mua thêm phụ kiện):
      </div>
      <div class="space-y-1.5">
        ${recs.map(item => `
          <div class="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded-lg border border-amber-200/70 dark:border-slate-700 text-xs">
            <div class="min-w-0 flex-1 pr-2 truncate">
              <span class="font-bold text-slate-800 dark:text-slate-200">${item.ten}</span>
              <span class="text-amber-600 dark:text-amber-400 font-black font-mono ml-1">${formatPrice(item.gia)}</span>
            </div>
            <button type="button" onclick="quickAddUpsellInOrder('${item.ma.replace(/'/g, "\\'")}')" class="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] rounded-md shadow-xs transition active:scale-95 cursor-pointer">
              + Thêm
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  confirmItems.innerHTML = `
    ${cart.map(item => `
      <div class="px-3 py-2 xxs:px-4 xxs:py-3 flex justify-between items-start gap-2 xxs:gap-3 text-xs xxs:text-sm font-medium text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
        <span class="flex-1">${item.ten} <strong class="text-slate-800 dark:text-white whitespace-nowrap ml-1">× ${item.qty}</strong></span>
        <span class="font-bold text-amber-600 dark:text-amber-400 flex-shrink-0 text-right mt-0.5 font-mono">${item.gia ? formatPrice(item.gia * item.qty) : 'Liên hệ'}</span>
      </div>
    `).join('')}
    ${upsellHtml}
  `;
  document.getElementById('confirmTotal').textContent = formatPrice(total);
  document.getElementById('orderModal').classList.add('open');
}

function quickAddUpsellInOrder(ma) {
  const p = products.find(x => x.ma === ma);
  if (!p) return;
  const existing = cart.find(x => x.ma === ma);
  if (existing) existing.qty += 1;
  else cart.push({ ...p, qty: 1 });
  updateCartBadge();
  saveCart();
  showToast(`<i class="fa-solid fa-cart-plus text-amber-500"></i> Đã thêm "${p.ten.substring(0, 25)}..." vào đơn hàng`, 'success');
  openOrderForm();
}

function closeOrderModal() {
  document.getElementById('orderModal').classList.remove('open');
  const warningEl = document.getElementById('orderModalWarning');
  if (warningEl) warningEl.classList.add('hidden');
}

function dismissOrderWarning() {
  const warningEl = document.getElementById('orderModalWarning');
  if (warningEl) warningEl.classList.add('hidden');
  const btn = document.getElementById('submitOrderBtn');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span><i class="fa-solid fa-calendar-check" style="color: rgb(99, 230, 190);"></i></span><span> Xác nhận đặt hàng</span>';
  }
}

function getOrCreateDeviceId() {
  let devId = localStorage.getItem('device_id');
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
    localStorage.setItem('device_id', devId);
  }
  return devId;
}

function getBrowserFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = "top";
  ctx.font = "14px 'Arial'";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f60";
  ctx.fillRect(125, 1, 62, 20);
  ctx.fillStyle = "#069";
  ctx.fillText("antigravity-fingerprint", 2, 15);
  const canvasData = canvas.toDataURL();

  const parts = [
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    navigator.language,
    navigator.platform,
    new Date().getTimezoneOffset(),
    canvasData.substring(0, 100)
  ];
  const str = parts.join('|||');

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'fp_' + Math.abs(hash).toString(36);
}

function showTailwindConfirm(message) {
  return new Promise((resolve) => {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 opacity-0';

    // Create modal box
    const box = document.createElement('div');
    box.className = 'bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform scale-95 transition-all duration-300 opacity-0 flex flex-col p-6';

    box.innerHTML = `
      <div class="flex items-center gap-3 mb-4 text-amber-500">
        <span class="text-3xl"><i class="fa-solid fa-triangle-exclamation"></i></span>
        <h4 class="text-lg font-extrabold text-slate-900">Xác nhận đặt hàng</h4>
      </div>
      <p class="text-sm text-slate-600 font-medium leading-relaxed mb-6">${message}</p>
      <div class="flex items-center justify-end gap-3 mt-auto">
        <button id="twConfirmCancel" class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition active:scale-95">Hủy</button>
        <button id="twConfirmOk" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-900 font-extrabold rounded-xl text-sm transition shadow-md shadow-amber-500/20">Tiếp tục đặt</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.classList.remove('opacity-0');
      box.classList.remove('opacity-0', 'scale-95');
    });

    const cleanup = (value) => {
      overlay.classList.add('opacity-0');
      box.classList.add('opacity-0', 'scale-95');
      setTimeout(() => {
        overlay.remove();
      }, 300);
      resolve(value);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    overlay.querySelector('#twConfirmCancel').addEventListener('click', () => cleanup(false));
    overlay.querySelector('#twConfirmOk').addEventListener('click', () => cleanup(true));
  });
}

async function submitOrder(force = false) {
  const warningEl = document.getElementById('orderModalWarning');
  if (warningEl) warningEl.classList.add('hidden');

  const name = document.getElementById('orderName').value.trim();
  const phone = document.getElementById('orderPhone').value.trim();
  const address = document.getElementById('orderAddress').value.trim();
  const note = document.getElementById('orderNote').value.trim();

  // === Hàm tiện ích validate inline ===
  function showFieldError(inputId, errorId, message) {
    const input = document.getElementById(inputId);
    const errorEl = document.getElementById(errorId);
    if (input) input.classList.add('!border-red-400');
    if (errorEl) { errorEl.textContent = message; errorEl.classList.remove('hidden'); }
  }
  function clearFieldError(inputId, errorId) {
    const input = document.getElementById(inputId);
    const errorEl = document.getElementById(errorId);
    if (input) input.classList.remove('!border-red-400');
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
  }
  function clearAllFieldErrors() {
    clearFieldError('orderName', 'orderNameError');
    clearFieldError('orderPhone', 'orderPhoneError');
    clearFieldError('orderAddress', 'orderAddressError');
  }

  clearAllFieldErrors();
  let hasError = false;

  // Họ tên: bắt buộc, 2–50 ký tự
  if (!name) {
    showFieldError('orderName', 'orderNameError', 'Vui lòng nhập họ tên');
    hasError = true;
  } else if (name.length < 2) {
    showFieldError('orderName', 'orderNameError', 'Họ tên tối thiểu 2 ký tự');
    hasError = true;
  } else if (name.length > 50) {
    showFieldError('orderName', 'orderNameError', 'Họ tên tối đa 50 ký tự');
    hasError = true;
  }

  // Số điện thoại: bắt buộc, 9–15 chữ số
  if (!phone) {
    showFieldError('orderPhone', 'orderPhoneError', 'Vui lòng nhập số điện thoại');
    hasError = true;
  } else if (!/^[0-9]{9,15}$/.test(phone)) {
    showFieldError('orderPhone', 'orderPhoneError', 'Số điện thoại phải gồm 9–15 chữ số');
    hasError = true;
  }

  // Địa chỉ: bắt buộc, 5–200 ký tự
  if (!address) {
    showFieldError('orderAddress', 'orderAddressError', 'Vui lòng nhập địa chỉ giao hàng');
    hasError = true;
  } else if (address.length < 5) {
    showFieldError('orderAddress', 'orderAddressError', 'Địa chỉ tối thiểu 5 ký tự');
    hasError = true;
  } else if (address.length > 200) {
    showFieldError('orderAddress', 'orderAddressError', 'Địa chỉ tối đa 200 ký tự');
    hasError = true;
  }

  // Ghi chú: không bắt buộc, tối đa 300 ký tự
  if (note.length > 300) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Ghi chú tối đa 300 ký tự', 'error');
    hasError = true;
  }

  if (hasError) return;
  if (cart.length === 0) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Giỏ hàng trống', 'error'); return; }

  const btn = document.getElementById('submitOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Đang gửi...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': getOrCreateDeviceId(),
        'X-Browser-Fingerprint': getBrowserFingerprint()
      },
      body: JSON.stringify({
        customer: name,
        phone,
        address,
        note,
        items: cart.map(x => ({ ma: x.ma, qty: x.qty })),
        force: force
      }),
    });

    let data = null;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.warn('Phản hồi từ server không phải JSON hợp lệ:', parseErr);
    }

    if (data && data.requireConfirmation) {
      // Hiện cảnh báo trùng đơn ngay trong tab Thông tin đặt hàng (cho cả Mobile và Desktop/DC)
      const warningEl = document.getElementById('orderModalWarning');
      const warningTextEl = document.getElementById('orderModalWarningText');
      if (warningEl && warningTextEl) {
        warningTextEl.textContent = data.message;
        warningEl.classList.remove('hidden');
        const bodyEl = document.getElementById('orderModalBody');
        if (bodyEl) bodyEl.scrollTop = 0;
      }
      btn.disabled = false;
      btn.innerHTML = '<span><i class="fa-solid fa-calendar-check" style="color: rgb(99, 230, 190);"></i></span><span> Xác nhận đặt hàng</span>';
      return;
    }

    if (!res.ok || !data || !data.ok) {
      const errorMsg = (data && data.message)
        ? data.message
        : (res.status === 504
            ? 'Máy chủ phản hồi chậm (504 Gateway Timeout). Vui lòng thử lại sau giây lát.'
            : (res.status >= 500
                ? `Máy chủ tạm thời bận (${res.status}). Vui lòng thử lại.`
                : 'Đặt hàng thất bại. Vui lòng thử lại.'));
      showToast('<i class="fa-solid fa-xmark"></i> ' + errorMsg, 'error');
      btn.disabled = false;
      btn.innerHTML = '<span><i class="fa-solid fa-calendar-check" style="color: rgb(99, 230, 190);"></i></span><span> Xác nhận đặt hàng</span>';
      return;
    }
    cart = [];
    updateCartBadge();
    saveCart();
    closeOrderModal();
    ['orderName', 'orderPhone', 'orderAddress', 'orderNote'].forEach(id => document.getElementById(id).value = '');

    // Hiển thị Popup đặt hàng thành công
    const createdOrderId = (data.order && data.order.id) || data.orderId || '';
    showOrderSuccessModal(createdOrderId);

    btn.disabled = false;
    btn.innerHTML = '<span><i class="fa-solid fa-calendar-check" style="color: rgb(99, 230, 190);"></i></span><span> Xác nhận đặt hàng</span>';
  } catch (err) {
    console.error('Lỗi khi gửi đơn hàng:', err);
    showToast('<i class="fa-solid fa-xmark"></i> Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng.', 'error');
    btn.disabled = false;
    btn.innerHTML = '<span><i class="fa-solid fa-calendar-check" style="color: rgb(99, 230, 190);"></i></span><span> Xác nhận đặt hàng</span>';
  }
}

// ==============================
// ORDER SUCCESS POPUP
// ==============================
function showOrderSuccessModal(orderId) {
  const modal = document.getElementById('orderSuccessModal');
  const orderIdSpan = document.getElementById('successOrderId');
  if (modal && orderIdSpan) {
    orderIdSpan.textContent = orderId;
    modal.style.display = 'flex';
    modal.classList.add('open');
  }
}

function closeOrderSuccessModal() {
  const modal = document.getElementById('orderSuccessModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('open');
  }
}

async function copySuccessOrderId() {
  const orderIdSpan = document.getElementById('successOrderId');
  const btn = document.getElementById('btnCopySuccessId');
  if (!orderIdSpan) return;

  try {
    await navigator.clipboard.writeText(orderIdSpan.textContent);
    showToast('<i class="fa-solid fa-check"></i> Đã sao chép mã đơn hàng!', 'success');
    if (btn) {
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Đã chép';
      setTimeout(() => {
        btn.innerHTML = originalHTML;
      }, 2000);
    }
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Không thể sao chép', 'error');
  }
}

// ==============================
// TOAST (Industrial Refinement)
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

  // Extract clean text from msg
  const cleanText = msg.replace(/<[^>]*>?/gm, '').trim();
  const isError = type === 'error';
  const isInfo = type === 'info';
  const isCartAction = !isError && (cleanText.includes('Đã thêm') || cleanText.includes('giỏ'));

  let title = 'Thông báo';
  let iconClass = 'fa-solid fa-circle-info';
  let iconColorClass = 'text-sky-400 bg-sky-500/20';
  let accentClass = isError ? 'toast-error' : (isInfo ? 'toast-info' : 'toast-success');

  if (isError) {
    title = 'Thông báo lỗi';
    iconClass = 'fa-solid fa-circle-exclamation';
    iconColorClass = 'text-rose-400 bg-rose-500/20';
  } else if (isCartAction) {
    title = 'Đã thêm vào giỏ hàng';
    iconClass = 'fa-solid fa-circle-check';
    iconColorClass = 'text-amber-400 bg-amber-500/20';
  } else if (type === 'success') {
    title = 'Thành công';
    iconClass = 'fa-solid fa-circle-check';
    iconColorClass = 'text-amber-400 bg-amber-500/20';
  }

  // Display text
  let displayMessage = cleanText;
  if (isCartAction && displayMessage.startsWith('Đã thêm ')) {
    displayMessage = displayMessage.replace(/^Đã thêm\s*/, '');
  }

  t.className = `toast ${accentClass}`;
  t.innerHTML = `
    <div class="toast-card">
      <div class="toast-accent-line"></div>
      
      <!-- Icon -->
      <div class="w-8 h-8 rounded-xl ${iconColorClass} flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5">
        <i class="${iconClass}"></i>
      </div>

      <!-- Text & Action -->
      <div class="flex-1 min-w-0 pr-1">
        <div class="text-xs font-bold text-white leading-tight uppercase tracking-wider">${title}</div>
        <div class="text-[12px] text-slate-300 font-medium leading-relaxed mt-0.5 break-words line-clamp-2" title="${displayMessage}">${displayMessage}</div>
        ${isCartAction ? `
          <button onclick="openCart(); hideToast();" class="mt-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-extrabold text-[11px] rounded-lg transition inline-flex items-center gap-1.5 shadow-xs">
            <i class="fa-solid fa-bag-shopping"></i> Xem giỏ hàng
          </button>
        ` : ''}
      </div>

      <!-- Close Button -->
      <button onclick="hideToast()" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80 transition flex-shrink-0 text-xs" title="Đóng">✕</button>

      <!-- Progress bar -->
      <div class="toast-progress"></div>
    </div>
  `;

  // Force reflow to restart CSS progress animation
  void t.offsetWidth;
  t.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
  }, 3500);
}

// ==============================
// LOAD SETTINGS (FOOTER)
// ==============================
const SETTINGS_CACHE_KEY = 'cached_settings_v1';
const SLIDES_CACHE_KEY = 'cached_slides_v1';

function applySettingsUI(settings) {
  if (!settings) return;
  const addr = document.getElementById('footer-address');
  const phone = document.getElementById('footer-phone');
  const email = document.getElementById('footer-email');
  const map = document.getElementById('footer-map-container');
  if (addr) addr.innerHTML = `<span class="text-amber-400 flex-shrink-0"><i class="fa-solid fa-location-dot"></i></span><span><strong>Địa chỉ:</strong> ${settings.address || '-'}</span>`;
  if (phone) phone.innerHTML = `<span class="text-amber-400 flex-shrink-0"><i class="fa-solid fa-phone"></i></span><span><strong>SĐT:</strong> ${settings.phone || '-'}</span>`;
  if (email) email.innerHTML = `<span class="text-amber-400 flex-shrink-0"><i class="fa-solid fa-envelope"></i></span><span><strong>Email:</strong> ${settings.email || '-'}</span>`;
  if (map) {
    if (settings.mapUrl) {
      map.innerHTML = `<iframe src="${settings.mapUrl}" width="100%" height="250" style="border:0; border-radius:8px;" allowfullscreen="" loading="lazy"></iframe>`;
    } else {
      map.innerHTML = `<p style="color:var(--muted)">Chưa cấu hình bản đồ.</p>`;
    }
  }
}

async function loadSettings() {
  try {
    const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (cached) applySettingsUI(JSON.parse(cached));
  } catch (e) {}

  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const settings = await res.json();
      applySettingsUI(settings);
      try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings)); } catch (e) {}
    }
  } catch (err) {
    console.error('Không tải được cài đặt footer:', err);
  }
}

let currentSlideIdx = 0;
let slideInterval;

function renderSliderDOM(slideUrls) {
  const slidesContainer = document.getElementById('heroSlides');
  const dotsContainer = document.getElementById('slideDots');
  if (!slidesContainer || !dotsContainer || !Array.isArray(slideUrls) || slideUrls.length === 0) return false;

  slidesContainer.innerHTML = slideUrls.map((url, i) =>
    `<div class="hero-slide${i === 0 ? ' active' : ''}" style="background-image:url('${url}');"></div>`
  ).join('');

  dotsContainer.innerHTML = slideUrls.map((_, i) =>
    `<span class="dot${i === 0 ? ' active' : ''}" onclick="setSlide(${i})"></span>`
  ).join('');
  return true;
}

async function initSlider() {
  const slidesContainer = document.getElementById('heroSlides');
  if (!slidesContainer) return;

  // Hiển thị từ cache ngay lập tức nếu có
  let cachedUrls = null;
  try {
    const cached = localStorage.getItem(SLIDES_CACHE_KEY);
    if (cached) {
      cachedUrls = JSON.parse(cached);
      if (Array.isArray(cachedUrls) && cachedUrls.length > 0) {
        renderSliderDOM(cachedUrls);
      }
    }
  } catch (e) {}

  // Fetch mới trong nền
  let slideUrls = [];
  try {
    const res = await fetch('/api/slides');
    if (res.ok) {
      slideUrls = await res.json();
      if (Array.isArray(slideUrls) && slideUrls.length > 0) {
        try { localStorage.setItem(SLIDES_CACHE_KEY, JSON.stringify(slideUrls)); } catch (e) {}
        if (!cachedUrls || JSON.stringify(slideUrls) !== JSON.stringify(cachedUrls)) {
          renderSliderDOM(slideUrls);
        }
      }
    }
  } catch (err) {
    console.warn('Không tải được danh sách slide:', err);
  }

  // Nếu không có cả cache lẫn API thì giữ placeholder
  if ((!slideUrls || slideUrls.length === 0) && (!cachedUrls || cachedUrls.length === 0)) return;

  // Lấy lại các element sau khi render
  function getSlides() { return slidesContainer.querySelectorAll('.hero-slide'); }
  function getDots() { return dotsContainer.querySelectorAll('.dot'); }

  function showSlide(idx) {
    getSlides().forEach((slide, i) => slide.classList.toggle('active', i === idx));
    getDots().forEach((dot, i) => dot.classList.toggle('active', i === idx));
  }

  function resetSlideTimer() {
    clearInterval(slideInterval);
    slideInterval = setInterval(() => {
      const total = getSlides().length;
      if (total === 0) return;
      currentSlideIdx = (currentSlideIdx + 1) % total;
      showSlide(currentSlideIdx);
    }, 5000);
  }

  window.moveSlide = function (direction) {
    const total = getSlides().length;
    if (total === 0) return;
    currentSlideIdx = (currentSlideIdx + direction + total) % total;
    showSlide(currentSlideIdx);
    resetSlideTimer();
  };

  window.setSlide = function (idx) {
    currentSlideIdx = idx;
    showSlide(currentSlideIdx);
    resetSlideTimer();
  };

  currentSlideIdx = 0;
  resetSlideTimer();
}

// ==============================
// INIT
// ==============================
loadCart();
loadProducts();
loadSettings();
initSlider();

document.getElementById('cartModal').addEventListener('click', function (e) {
  if (e.target === this) this.classList.remove('open');
});

document.getElementById('orderModal').addEventListener('click', function (e) {
  if (e.target === this) this.classList.remove('open');
});

// Premium gradual swipe-to-close implementation for Mobile drawer modals
function enableGradualSwipeToClose(modalId, closeFn) {
  const overlay = document.getElementById(modalId);
  if (!overlay) return;
  const panel = overlay.querySelector('.modal');
  if (!panel) return;

  let startX = 0;
  let startY = 0;
  let currentTranslate = 0;
  let isDragging = false;

  overlay.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = false;
    panel.style.transition = 'none';
  }, { passive: true });

  overlay.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 1) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startX;
    const diffY = currentY - startY;

    if (!isDragging && diffX > 10 && Math.abs(diffX) > Math.abs(diffY)) {
      isDragging = true;
    }

    if (isDragging) {
      if (e.cancelable) e.preventDefault();
      if (diffX > 0) {
        currentTranslate = diffX;
        panel.style.transform = `translateX(${diffX}px)`;
        const opacity = Math.max(0, 0.5 - (diffX / panel.offsetWidth) * 0.5);
        overlay.style.backgroundColor = `rgba(0,0,0,${opacity})`;
      }
    }
  }, { passive: false });

  overlay.addEventListener('touchend', function (e) {
    if (!isDragging) return;
    isDragging = false;
    panel.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    overlay.style.transition = 'background-color 0.25s ease';

    const threshold = panel.offsetWidth * 0.35;
    if (currentTranslate > threshold) {
      panel.style.transform = `translateX(100%)`;
      overlay.style.backgroundColor = 'rgba(0,0,0,0)';
      setTimeout(() => {
        closeFn();
        panel.style.transform = '';
        panel.style.transition = '';
        overlay.style.backgroundColor = '';
        overlay.style.transition = '';
      }, 250);
    } else {
      panel.style.transform = `translateX(0)`;
      overlay.style.backgroundColor = '';
      setTimeout(() => {
        panel.style.transition = '';
        overlay.style.transition = '';
      }, 250);
    }
    currentTranslate = 0;
  });
}

// Enable for both Cart and Order drawer modals
enableGradualSwipeToClose('cartModal', closeCart);
enableGradualSwipeToClose('orderModal', closeOrderModal);

// ============================================================
// UP-SELLING & CROSS-SELLING ENGINE (INDUSTRIAL REFINEMENT)
// ============================================================
const UPSELL_RULES = [
  {
    id: 'plumbing',
    match: (p) => p.loai === 'Ống nước' || /(^|\s)(ống|co|lơi|tê|van|luppe|ren|bít|măng)(\s|[0-9]|$)/i.test(p.ten),
    boost: (cand) => (cand.loai === 'Ống nước' ? 6 : 0) + (/(^|\s)(keo dán|băng keo non|co|tê|van|lưỡi cưa)(\s|[0-9]|$)/i.test(cand.ten) ? 14 : 0),
    penalize: (cand) => ['Đồ điện', 'Dây điện', 'Đèn Led'].includes(cand.loai) ? -20 : 0
  },
  {
    id: 'electrical',
    match: (p) => ['Đồ điện', 'Dây điện', 'Đèn Led', 'Bóng đèn'].includes(p.loai) || /(^|\s)(điện|cầu dao|mcb|dây|ổ cắm|công tắc|đèn|led|bóng)(\s|[0-9]|$)/i.test(p.ten),
    boost: (cand) => (['Đồ điện', 'Dây điện', 'Đèn Led', 'Bóng đèn'].includes(cand.loai) ? 6 : 0) + (/(^|\s)(băng keo|bút thử|phích|ổ cắm|công tắc|kìm)(\s|[0-9]|$)/i.test(cand.ten) ? 14 : 0),
    penalize: (cand) => (cand.loai === 'Ống nước' ? -20 : 0)
  },
  {
    id: 'tools',
    match: (p) => p.loai === 'Dụng cụ' || /(^|\s)(khoan|mũi|vít|ốc|kìm|búa|tô vít|thước|đá cắt)(\s|[0-9]|$)/i.test(p.ten),
    boost: (cand) => (cand.loai === 'Dụng cụ' ? 6 : 0) + (/(^|\s)(mũi khoan|vít|tắc kê|thước|đá cắt|đá mài)(\s|[0-9]|$)/i.test(cand.ten) ? 14 : 0),
    penalize: (cand) => 0
  },
  {
    id: 'paint',
    match: (p) => p.loai === 'Nước sơn' || /(^|\s)(sơn|chống thấm)(\s|[0-9]|$)/i.test(p.ten),
    boost: (cand) => /(^|\s)(cọ|lăn|rulo|keo giấy|nhám|xăng)(\s|[0-9]|$)/i.test(cand.ten) ? 14 : 0,
    penalize: (cand) => 0
  }
];

function getSmartRecommendations(targetProduct, limit = 2) {
  if (!targetProduct || !Array.isArray(products) || products.length === 0) return [];

  const activeRule = UPSELL_RULES.find(r => r.match(targetProduct));
  const excludeCodes = new Set([targetProduct.ma, ...(cart || []).map(x => x.ma)]);
  const candidates = products.filter(p => !excludeCodes.has(p.ma) && p.gia > 0 && p.trangthai !== 'Ngừng kinh doanh');

  const scored = candidates.map(cand => {
    let score = 0;
    if (activeRule) {
      score += activeRule.boost(cand);
      score += activeRule.penalize(cand);
    }
    if (cand.loai === targetProduct.loai) score += 5;
    // Upgrade in same category
    if (cand.loai === targetProduct.loai && cand.gia > targetProduct.gia && cand.gia <= targetProduct.gia * 3) {
      score += 6;
    }
    if (cand.isBestSeller) score += 3;
    if (cand.image) score += 2;
    return { cand, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.cand);
}

function getCartRecommendations(currentCart, limit = 3) {
  if (!Array.isArray(products) || products.length === 0) return [];
  const cartCodes = new Set((currentCart || []).map(x => x.ma));
  const candidates = products.filter(p => !cartCodes.has(p.ma) && p.gia > 0 && p.trangthai !== 'Ngừng kinh doanh');

  if (!currentCart || currentCart.length === 0) {
    return candidates.filter(p => p.isBestSeller || p.gia < 50000).slice(0, limit);
  }

  const matchedRules = UPSELL_RULES.filter(rule => (currentCart || []).some(item => rule.match(item)));

  const scored = candidates.map(cand => {
    let score = 0;
    matchedRules.forEach(rule => {
      score += rule.boost(cand);
      score += rule.penalize(cand);
    });

    if (cand.gia <= 50000) score += 4;
    else if (cand.gia <= 120000) score += 2;

    if (cand.isBestSeller) score += 4;
    if (cand.image) score += 2;

    return { cand, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.cand);
}

// In-Cart Incentive Progress Bar
function renderIncentiveProgressBar(total) {
  const THRESHOLD = 300000;
  const isUnlocked = total >= THRESHOLD;
  const percent = Math.min(100, Math.round((total / THRESHOLD) * 100));

  if (isUnlocked) {
    return `
      <div class="cart-progress-wrap unlocked mb-3 select-none">
        <div class="flex items-center justify-between text-xs">
          <span class="font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
            <i class="fa-solid fa-circle-check text-emerald-600 text-sm"></i> Đủ điều kiện Miễn phí giao hàng!
          </span>
          <span class="text-[10px] font-black text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full uppercase">Đạt chuẩn</span>
        </div>
        <div class="cart-progress-track">
          <div class="cart-progress-fill" style="width: 100%"></div>
        </div>
      </div>
    `;
  }

  const remaining = THRESHOLD - total;
  return `
    <div class="cart-progress-wrap mb-3 select-none">
      <div class="flex justify-between items-center text-xs">
        <span class="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <i class="fa-solid fa-truck-fast text-amber-600 dark:text-amber-400"></i> Miễn phí giao hàng KV Thốt Nốt
        </span>
        <span class="font-bold text-amber-700 dark:text-amber-400">Mua thêm ${formatPrice(remaining)}</span>
      </div>
      <div class="cart-progress-track">
        <div class="cart-progress-fill" style="width: ${percent}%"></div>
      </div>
    </div>
  `;
}

// In-Cart Recommended Add-ons Section
function renderCartUpsellSection() {
  const recs = getCartRecommendations(cart, 3);
  if (!recs || recs.length === 0) return '';

  return `
    <div class="cart-upsell-container mt-4">
      <div class="flex items-center justify-between mb-2.5">
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          <span class="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">Gợi ý mua kèm tiện ích</span>
        </div>
        <span class="text-[11px] text-slate-400 font-medium">Thường dùng cùng</span>
      </div>
      <div class="space-y-2">
        ${recs.map(item => `
          <div class="cart-upsell-item">
            <div class="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
              ${item.image ? `<img src="${getProductImageUrl(item)}" class="w-full h-full object-contain" />` : `<span class="text-base">${getIcon(item.ten)}</span>`}
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title="${item.ten}">${item.ten}</div>
              <div class="text-[10px] text-slate-400 font-mono">${item.ma} · <span class="font-bold text-slate-900 dark:text-white font-mono text-xs">${formatPrice(item.gia)}</span></div>
            </div>
            <button class="btn-quick-add" onclick="quickAddUpsellToCart('${item.ma.replace(/'/g, "\\'")}', this)" title="Thêm ngay vào giỏ">
              <i class="fa-solid fa-plus"></i> Thêm
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function quickAddUpsellToCart(ma, btnEl) {
  const p = products.find(x => x.ma === ma);
  if (!p) return;

  const existing = cart.find(x => x.ma === ma);
  if (existing) existing.qty += 1;
  else cart.push({ ...p, qty: 1 });

  updateCartBadge();
  saveCart();

  if (btnEl) {
    btnEl.classList.add('added');
    btnEl.innerHTML = '<i class="fa-solid fa-check"></i> Đã thêm';
    setTimeout(() => {
      renderCart();
    }, 400);
  } else {
    renderCart();
  }

  showToast(`<i class="fa-solid fa-cart-plus text-amber-500"></i> Đã thêm "${p.ten.substring(0, 25)}..." vào giỏ`, 'success');
}

// Combo (Frequently Bought Together) in Product Details Modal
let currentComboItems = [];

function renderComboSection(mainProduct) {
  const recs = getSmartRecommendations(mainProduct, 2);
  if (!recs || recs.length === 0) return '';

  currentComboItems = [
    { product: mainProduct, isMain: true, checked: true },
    ...recs.map(p => ({ product: p, isMain: false, checked: true }))
  ];

  const totalComboPrice = currentComboItems.reduce((s, it) => it.checked ? s + it.product.gia : s, 0);

  return `
    <div class="combo-section-wrap" id="detailComboSection">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <span class="combo-badge">
            <i class="fa-solid fa-layer-group"></i> Combo Thường Mua Cùng
          </span>
          <span class="text-xs text-slate-500 font-semibold hidden xs:inline">Tiết kiệm thời gian & thi công đồng bộ</span>
        </div>
        <span class="text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/60">
          Gợi ý thi công
        </span>
      </div>

      <!-- Combo Items List -->
      <div class="space-y-2 mb-3">
        ${currentComboItems.map((item) => `
          <div class="combo-item-card ${item.checked ? 'selected' : ''}" id="combo_row_${item.product.ma.replace(/'/g, "\\'")}">
            <label class="flex items-center gap-2.5 flex-1 cursor-pointer min-w-0">
              <input type="checkbox" ${item.checked ? 'checked' : ''} ${item.isMain ? 'disabled' : ''} 
                onchange="toggleComboCheckbox('${item.product.ma.replace(/'/g, "\\'")}', this.checked)"
                class="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-slate-300 accent-amber-500 cursor-pointer" />
              <div class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-200/60 dark:border-slate-700">
                ${item.product.image ? `<img src="${getProductImageUrl(item.product)}" class="w-full h-full object-contain" />` : `<span class="text-base">${getIcon(item.product.ten)}</span>`}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${item.product.ten}</div>
                <div class="text-[10px] text-slate-400 flex items-center gap-1.5 font-medium">
                  <span class="font-mono text-amber-600 dark:text-amber-400 font-bold">${item.product.ma}</span>
                  ${item.isMain ? '<span class="text-amber-700 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.2 rounded text-[9px] font-black uppercase">Sản phẩm chính</span>' : '<span class="text-slate-500">Phụ kiện mua kèm</span>'}
                </div>
              </div>
            </label>
            <div class="text-right flex-shrink-0">
              <div class="text-xs font-black text-slate-900 dark:text-white font-mono">${formatPrice(item.product.gia)}</div>
              ${item.product.donvi ? `<div class="text-[10px] text-slate-400 font-semibold">${item.product.donvi}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Combo Action Bar -->
      <div class="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-800 flex-wrap gap-2">
        <div>
          <span class="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tổng combo:</span>
          <span class="text-base font-black text-slate-900 dark:text-amber-400 font-mono" id="comboTotalPrice">${formatPrice(totalComboPrice)}</span>
        </div>
        <button type="button" onclick="addComboToCart()" class="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-amber-400 font-extrabold text-xs rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer">
          <i class="fa-solid fa-cart-arrow-down"></i>
          <span>Thêm cả bộ vào giỏ</span>
        </button>
      </div>
    </div>
  `;
}

function toggleComboCheckbox(ma, isChecked) {
  const item = currentComboItems.find(x => x.product.ma === ma);
  if (!item) return;
  item.checked = isChecked;

  const row = document.getElementById(`combo_row_${ma}`);
  if (row) row.classList.toggle('selected', isChecked);

  const total = currentComboItems.reduce((s, it) => it.checked ? s + it.product.gia : s, 0);
  const totalEl = document.getElementById('comboTotalPrice');
  if (totalEl) totalEl.textContent = formatPrice(total);
}

function addComboToCart() {
  const selectedItems = currentComboItems.filter(it => it.checked);
  if (selectedItems.length === 0) return;

  selectedItems.forEach(it => {
    const existing = cart.find(x => x.ma === it.product.ma);
    if (existing) existing.qty += 1;
    else cart.push({ ...it.product, qty: 1 });
  });

  updateCartBadge();
  saveCart();
  showToast(`<i class="fa-solid fa-layer-group text-amber-500"></i> Đã thêm trọn bộ combo (${selectedItems.length} sản phẩm) vào giỏ!`, 'success');
  closeProductDetailModal();
}

// ==============================
// PRODUCT DETAILS MODAL LOGIC
// ==============================
let currentViewingProduct = null;
let currentDetailQty = 1;

function showProductDetails(ma) {
  const p = products.find(x => x.ma === ma);
  if (!p) return;

  currentViewingProduct = p;
  currentDetailQty = 1;

  const contentEl = document.getElementById('productDetailContent');
  if (!contentEl) return;

  // Render content
  contentEl.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-stretch">
      <!-- Cột trái: Hình ảnh -->
      <div class="w-full md:w-1/2 bg-slate-50 dark:bg-slate-850 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 flex items-center justify-center p-6 min-h-[260px] md:min-h-[360px] relative">
        ${p.image ? `
          <div class="relative w-full h-[220px] md:h-[310px] flex items-center justify-center group/img overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-3 border border-slate-200/50 dark:border-slate-700 shadow-inner">
            <img src="${getProductImageUrl(p)}" alt="${p.ten}" class="max-w-full max-h-full object-contain transition duration-300 group-hover/img:scale-105 cursor-zoom-in" onclick="openFullScreenImage('${getProductImageUrl(p)}')" />
            <button onclick="openFullScreenImage('${getProductImageUrl(p)}')" class="absolute bottom-3 right-3 bg-white/95 dark:bg-slate-700 text-slate-800 dark:text-white w-8 h-8 rounded-lg shadow-sm border border-slate-150 dark:border-slate-600 transition flex items-center justify-center" title="Xem ảnh đầy đủ">
              <i class="fa-solid fa-up-right-and-down-left-from-center text-[11px]"></i>
            </button>
          </div>
        ` : `
          <div class="flex flex-col items-center justify-center text-center p-8">
            <div class="w-24 h-24 rounded-full bg-slate-200/50 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4 shadow-inner">
              <span class="text-5xl select-none opacity-80">${getIcon(p.ten)}</span>
            </div>
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Không có hình ảnh</span>
          </div>
        `}
      </div>
      
      <!-- Cột phải: Thông tin sản phẩm -->
      <div class="w-full md:w-1/2 p-5 xs:p-6 flex flex-col justify-between">
        <div>
          <!-- Loại sản phẩm -->
          <div class="mb-2">
            <span class="text-[10px] font-extrabold tracking-wide uppercase px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-100/70 dark:border-indigo-800 inline-block">
              ${p.loai || 'Hàng hóa'}
            </span>
          </div>
          
          <!-- Tên sản phẩm -->
          <h2 class="text-base xs:text-lg md:text-xl font-extrabold text-slate-900 dark:text-white leading-tight mb-2 select-text" title="${p.ten}">
            ${p.ten}
          </h2>
          
          <!-- Mã sản phẩm & Trạng thái -->
          <div class="flex items-center gap-2 mb-4 flex-wrap">
            <span class="text-[11px] font-mono text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-2 py-0.5 rounded flex items-center gap-1 font-semibold select-all">
              <i class="fa-solid fa-hashtag text-slate-400"></i> ${p.ma}
            </span>
            <button onclick="copyToClipboard('${p.ma.replace(/'/g, "\\'")}', this)" class="text-slate-400 hover:text-amber-500 transition text-[11px] p-1" title="Sao chép mã">
              <i class="fa-regular fa-copy"></i>
            </button>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${p.trangthai === 'Đang theo dõi' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-100 dark:border-amber-800'}">
              ${p.trangthai || 'Có sẵn'}
            </span>
          </div>
          
          <!-- Khung Giá & Đơn vị -->
          <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700 flex items-center justify-between mb-5">
            <div>
              <span class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Đơn giá</span>
              <span class="text-lg md:text-xl font-black text-blue-600 dark:text-amber-400">${formatPrice(p.gia)}</span>
            </div>
            <div class="text-right">
              <span class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Đơn vị tính</span>
              <span class="inline-block px-2.5 py-0.5 bg-slate-200/60 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold rounded-lg">${p.donvi || 'Cái'}</span>
            </div>
          </div>
        </div>
        
        <!-- Chọn số lượng & Thêm vào giỏ -->
        <div class="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Số lượng mua</span>
            <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700">
              <button onclick="changeDetailQty(-1)" class="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 flex items-center justify-center font-bold text-slate-600 dark:text-slate-200 hover:bg-slate-50 active:scale-95 transition">
                <i class="fa-solid fa-minus text-[10px]"></i>
              </button>
              <input type="number" id="detailQtyInput" value="1" min="1" class="w-10 text-center font-extrabold text-slate-800 dark:text-white bg-transparent focus:outline-none text-xs" onchange="validateDetailQty(this)" />
              <button onclick="changeDetailQty(1)" class="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 flex items-center justify-center font-bold text-slate-600 dark:text-slate-200 hover:bg-slate-50 active:scale-95 transition">
                <i class="fa-solid fa-plus text-[10px]"></i>
              </button>
            </div>
          </div>
          
          <button onclick="addDetailProductToCart('${p.ma.replace(/'/g, "\\'")}')" class="w-full py-3 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-slate-900 font-extrabold rounded-xl text-sm shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-2">
            <i class="fa-solid fa-cart-plus text-base"></i>
            <span id="detailAddToCartText">Thêm vào giỏ hàng</span>
          </button>
        </div>
      </div>
    </div>
    <!-- Frequently Bought Together / Combo Section -->
    ${renderComboSection(p)}
  `;

  document.getElementById('productDetailModal').classList.add('open');
  updateDetailPriceTotal();
}

function closeProductDetailModal() {
  document.getElementById('productDetailModal').classList.remove('open');
  currentViewingProduct = null;
}

function closeProductDetailOnOutsideClick(e) {
  if (e.target.id === 'productDetailModal') {
    closeProductDetailModal();
  }
}

// Lắng nghe phím ESC để đóng các modal
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeDeleteConfirmModal(false);
    closeProductDetailModal();
    closeCart();
    closeOrderModal();
    closeFullScreenImage();
  }
});

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const icon = btn.querySelector('i');
    icon.className = 'fa-solid fa-check text-emerald-500';
    showToast('<i class="fa-solid fa-circle-check"></i> Đã sao chép mã sản phẩm', 'success');
    setTimeout(() => {
      icon.className = 'fa-regular fa-copy text-slate-400';
    }, 2000);
  }).catch(err => {
    console.error('Không thể sao chép: ', err);
  });
}

function changeDetailQty(delta) {
  const input = document.getElementById('detailQtyInput');
  if (!input) return;
  let val = parseInt(input.value) || 1;
  val += delta;
  if (val < 1) val = 1;
  input.value = val;
  currentDetailQty = val;
  updateDetailPriceTotal();
}

function validateDetailQty(input) {
  let val = parseInt(input.value) || 1;
  if (val < 1) val = 1;
  input.value = val;
  currentDetailQty = val;
  updateDetailPriceTotal();
}

function updateDetailPriceTotal() {
  const textSpan = document.getElementById('detailAddToCartText');
  if (!textSpan || !currentViewingProduct) return;

  const total = currentViewingProduct.gia * currentDetailQty;
  if (total) {
    textSpan.textContent = `Thêm vào giỏ - ${formatPrice(total)}`;
  } else {
    textSpan.textContent = 'Thêm vào giỏ - Liên hệ';
  }
}

function addDetailProductToCart(ma) {
  const p = products.find(x => x.ma === ma);
  if (!p) return;
  const qty = currentDetailQty;
  const existing = cart.find(x => x.ma === ma);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ ...p, qty: qty });
  }
  updateCartBadge();
  saveCart();
  showToast(`<i class="fa-solid fa-circle-check"></i> Đã thêm ${qty} sản phẩm vào giỏ`, 'success');
  closeProductDetailModal();
}

// Lightbox xem ảnh full-screen
function openFullScreenImage(src) {
  let overlay = document.getElementById('fullscreenImageOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'fullscreenImageOverlay';
    overlay.className = 'fixed inset-0 bg-black/90 z-[10000] flex items-center justify-center p-4 cursor-zoom-out opacity-0 transition-opacity duration-200 pointer-events-none';
    overlay.onclick = closeFullScreenImage;
    overlay.innerHTML = `
      <button class="absolute top-4 right-4 text-white text-3xl font-light hover:text-slate-300 transition w-10 h-10 flex items-center justify-center" onclick="closeFullScreenImage()">✕</button>
      <img id="fullscreenImage" src="" class="max-w-full max-h-full object-contain rounded shadow-2xl transition-transform duration-200 scale-95" />
    `;
    document.body.appendChild(overlay);
  }

  const img = document.getElementById('fullscreenImage');
  img.src = src;
  overlay.classList.remove('pointer-events-none');
  overlay.classList.add('opacity-100');
  setTimeout(() => {
    img.classList.remove('scale-95');
    img.classList.add('scale-100');
  }, 50);
}

function closeFullScreenImage() {
  const overlay = document.getElementById('fullscreenImageOverlay');
  const img = document.getElementById('fullscreenImage');
  if (overlay && img) {
    img.classList.remove('scale-100');
    img.classList.add('scale-95');
    overlay.classList.remove('opacity-100');
    overlay.classList.add('pointer-events-none');
  }
}

// ==============================
// REALTIME UPDATES LISTENERS
// ==============================
// ==============================
// REALTIME UPDATES (POLLING)
// ==============================
let shopLastKnownUpdates = {};

async function pollShopUpdates() {
  try {
    const res = await fetch('/api/updates/poll');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;

    for (const topic in data.updates) {
      const newTs = data.updates[topic];
      if (shopLastKnownUpdates[topic] === undefined) {
        // Lần đầu: chỉ ghi nhận mốc thời gian, không trigger reload
        shopLastKnownUpdates[topic] = newTs;
        continue;
      }
      if (shopLastKnownUpdates[topic] !== newTs) {
        shopLastKnownUpdates[topic] = newTs;
        if (topic === 'products') {
          console.log('⚡ Nhận cập nhật sản phẩm...');
          await loadProducts();
        } else if (topic === 'settings') {
          console.log('⚡ Nhận cập nhật cấu hình...');
          await loadSettings();
        }
        // topic === 'orders' bị bỏ qua có chủ đích — trang shop không cần theo dõi
      }
    }
  } catch (err) {
    console.warn('Lỗi khi poll cập nhật:', err);
  }
}

function initRealtimeUpdates() {
  pollShopUpdates(); // lấy mốc thời gian ban đầu
  setInterval(pollShopUpdates, 8000); // poll mỗi 8 giây — trang shop ít khẩn cấp hơn admin
}

function initSwipeToDelete() {
  const containers = document.querySelectorAll('.swipe-container');
  containers.forEach(container => {
    const content = container.querySelector('.swipe-content');
    const ma = container.getAttribute('data-ma');
    if (!content || !ma) return;

    let startX = 0;
    let startY = 0;
    let isDragging = false;
    let isOpen = false;
    let currentTranslate = 0;

    container.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      content.style.transition = 'none';
      isDragging = false;
    }, { passive: true });

    container.addEventListener('touchmove', function (e) {
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = currentX - startX;
      const diffY = currentY - startY;

      if (!isDragging && Math.abs(diffX) > 10 && Math.abs(diffX) > Math.abs(diffY)) {
        isDragging = true;
      }

      if (isDragging) {
        currentTranslate = isOpen ? -64 + diffX : diffX;
        if (currentTranslate > 0) currentTranslate = 0;
        if (currentTranslate < -120) currentTranslate = -120;

        content.style.transform = `translateX(${currentTranslate}px)`;
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    container.addEventListener('touchend', function (e) {
      if (!isDragging) return;
      content.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';

      const currentX = e.changedTouches[0].clientX;
      const diffX = currentX - startX;

      // Nếu kéo rất xa sang trái, xóa thẳng sản phẩm khỏi giỏ hàng
      if (currentTranslate < -100) {
        content.style.transform = 'translateX(-100%)';
        setTimeout(() => {
          removeFromCart(ma);
        }, 150);
        return;
      }

      if (diffX < -30) {
        content.style.transform = 'translateX(-64px)';
        isOpen = true;
      } else if (diffX > 30) {
        content.style.transform = 'translateX(0)';
        isOpen = false;
      } else {
        if (isOpen) {
          content.style.transform = 'translateX(-64px)';
        } else {
          content.style.transform = 'translateX(0)';
        }
      }
    });
  });
}

initRealtimeUpdates();

// ==============================
// BACK TO TOP
// ==============================
// 1. Biến toàn cục kiểm tra trạng thái
let isScrollingTop = false;

// 2. Sự kiện theo dõi cuộn trang để ẩn/hiện nút
window.addEventListener('scroll', () => {
  // Nếu đang trong quá trình tự động cuộn lên, giữ nút luôn ẩn và thoát ra luôn
  if (isScrollingTop) return;

  const btn = document.getElementById('backToTopBtn');
  if (!btn) return; // Phòng trường hợp id nút chưa đúng

  // Cuộn xuống hơn 300px thì hiện nút
  if (window.scrollY > 300) {
    btn.classList.add('opacity-100', 'translate-y-0');
    btn.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
  } else {
    btn.classList.remove('opacity-100', 'translate-y-0');
    btn.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
  }
});

// 3. Hàm cuộn lên đỉnh trang TỰ CHỈNH TỐC ĐỘ (Chậm và Mượt)
function scrollToTop() {
  const btn = document.getElementById('backToTopBtn');
  if (btn) {
    // Ẩn ngay lập tức khi vừa bấm
    btn.classList.remove('opacity-100', 'translate-y-0');
    btn.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
  }

  // Bật cờ hiệu đang tự động cuộn lên
  isScrollingTop = true;

  // Xác định vị trí đích cần cuộn về
  let targetTop = 0;
  if (window.innerWidth <= 900) {
    const target = document.getElementById('shopControls') || document.getElementById('searchInput');
    if (target) {
      const navH = document.querySelector('nav')?.offsetHeight || 72;
      targetTop = target.getBoundingClientRect().top + window.scrollY - navH - 12;
      targetTop = Math.max(0, targetTop);
    }
  }

  // --- THUẬT TOÁN TỰ LÀM MƯỢT VÀ GIẢM TỐC ĐỘ ---
  const startPosition = window.scrollY;
  const distance = targetTop - startPosition;
  const duration = 1500; // <--- CHỈNH TỐC ĐỘ: 1000ms = 1 giây (Số càng lớn cuộn càng chậm)
  let startTime = null;

  function animation(currentTime) {
    if (startTime === null) startTime = currentTime;
    const timeElapsed = currentTime - startTime;

    // Công thức toán học giúp chuyển động chậm dần đều ở đuôi
    const run = easeOutQuad(timeElapsed, startPosition, distance, duration);

    window.scrollTo(0, run);

    if (timeElapsed < duration) {
      requestAnimationFrame(animation);
    } else {
      // KHI ĐÃ ĐẾN ĐÍCH HOÀN TOÀN:
      window.scrollTo(0, targetTop);

      // Tắt cờ hiệu ngay lập tức để giải phóng cho nút có thể hiện lại lần sau
      isScrollingTop = false;
    }
  }

  function easeOutQuad(t, b, c, d) {
    t /= d;
    return -c * t * (t - 2) + b;
  };

  requestAnimationFrame(animation);
}

// ==============================
// ORDER LOOKUP CONTROLLER
// ==============================
let isLookupView = false;

function toggleLookupView() {
  const shopView = document.getElementById('view-shop');
  const lookupView = document.getElementById('view-lookup');
  const lookupBtn = document.getElementById('lookupBtn');

  if (!shopView || !lookupView) return;

  isLookupView = !isLookupView;

  if (isLookupView) {
    // Chuyển sang trang tra cứu
    shopView.style.display = 'none';
    lookupView.style.display = 'block';
    if (lookupBtn) {
      lookupBtn.innerHTML = '<span><i class="fa-solid fa-store"></i></span><span class="max-sm:hidden">Trang chủ cửa hàng</span>';
      lookupBtn.className = "bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-900 font-bold px-3 py-2 xs:px-4 xs:py-2 sm:px-5 sm:py-2.5 rounded-xl transition duration-150 flex items-center gap-1.5 xxs:gap-2 text-sm sm:text-base shadow-lg shadow-amber-500/20";
    }
    // Auto-focus input
    const input = document.getElementById('lookupInput');
    if (input) input.focus();
  } else {
    // Quay lại trang cửa hàng
    shopView.style.display = 'block';
    lookupView.style.display = 'none';
    if (lookupBtn) {
      lookupBtn.innerHTML = '<span><i class="fa-solid fa-receipt" style="color: rgb(255, 212, 59);"></i></span><span class="max-sm:hidden">Tra cứu đơn</span>';
      lookupBtn.className = "bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-400 font-bold px-3 py-2 xs:px-4 xs:py-2 sm:px-5 sm:py-2.5 rounded-xl transition duration-150 flex items-center gap-1.5 xxs:gap-2 text-sm sm:text-base border border-amber-400/30 hover:border-amber-400/60 shadow-lg";
    }
  }
}

// Mở trực tiếp tra cứu đơn bằng ID (ví dụ click từ popup thành công)
function openLookupWithOrderId(orderId) {
  const shopView = document.getElementById('view-shop');
  const lookupView = document.getElementById('view-lookup');
  const lookupBtn = document.getElementById('lookupBtn');
  const lookupInput = document.getElementById('lookupInput');

  if (!shopView || !lookupView) return;

  isLookupView = true;
  shopView.style.display = 'none';
  lookupView.style.display = 'block';
  if (lookupBtn) {
    lookupBtn.innerHTML = '<span><i class="fa-solid fa-store"></i></span><span class="max-sm:hidden">Trang chủ cửa hàng</span>';
    lookupBtn.className = "bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-900 font-bold px-3 py-2 xs:px-4 xs:py-2 sm:px-5 sm:py-2.5 rounded-xl transition duration-150 flex items-center gap-1.5 xxs:gap-2 text-sm sm:text-base shadow-lg shadow-amber-500/20";
  }

  if (lookupInput) {
    lookupInput.value = orderId;
  }

  performOrderLookup();
}

async function performOrderLookup() {
  const input = document.getElementById('lookupInput');
  const resultDiv = document.getElementById('lookupResult');
  if (!input || !resultDiv) return;

  const orderId = input.value.trim();
  if (!orderId) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng nhập mã đơn hàng', 'error');
    return;
  }

  resultDiv.innerHTML = `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex items-center justify-center">
      <div class="flex items-center gap-3 text-slate-500">
        <i class="fa-solid fa-spinner fa-spin text-2xl text-amber-500"></i>
        <span class="font-bold text-sm">Đang tìm kiếm thông tin đơn hàng...</span>
      </div>
    </div>
  `;
  resultDiv.classList.remove('hidden');

  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      resultDiv.innerHTML = `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div class="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h4 class="font-bold text-slate-800 text-base mb-1">Không tìm thấy đơn hàng</h4>
          <p class="text-xs text-slate-500">${data.message || 'Vui lòng kiểm tra lại mã đơn hàng.'}</p>
        </div>
      `;
      return;
    }

    const order = data.order;

    // Bản đồ màu sắc trạng thái
    let statusClass = 'bg-amber-100 text-amber-800';
    if (order.status === 'Đã xác nhận') statusClass = 'bg-emerald-100 text-emerald-800';
    if (order.status === 'Đã huỷ') statusClass = 'bg-red-100 text-red-800';

    // HTML danh sách sản phẩm kèm ảnh
    const itemsHtml = order.items.map(item => `
      <div class="flex gap-3 py-3 border-b border-slate-100 last:border-0 items-start">
        <div class="w-14 h-14 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
          <img src="${item.image}" alt="${item.ten}" class="w-full h-full object-cover" onerror="this.src='/img/placeholder.png'">
        </div>
        <div class="flex-1 min-w-0">
          <h5 class="text-sm font-bold text-slate-700 truncate">${item.ten}</h5>
          <span class="text-[11px] font-mono text-slate-400 block">${item.ma}</span>
          <div class="flex items-center justify-between mt-1">
            <span class="text-xs text-slate-500 font-semibold">${item.qty} ${item.donvi}</span>
            <span class="text-xs font-bold text-blue-600">${formatPrice(item.gia)}</span>
          </div>
        </div>
      </div>
    `).join('');

    resultDiv.innerHTML = `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <!-- Header thông tin chung -->
        <div class="bg-slate-900 text-white p-4 sm:p-5 flex flex-col xs:flex-row justify-between items-start xs:items-center gap-3">
          <div>
            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Mã đơn hàng</span>
            <span class="text-lg font-black text-amber-400 font-mono">${order.id}</span>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-bold ${statusClass}">${order.status}</span>
        </div>

        <!-- Body -->
        <div class="p-4 sm:p-6 space-y-5">
          <!-- Thông tin khách -->
          <div class="border-b border-slate-100 pb-4">
            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Thông tin khách hàng</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
              <div>
                <span class="text-slate-400 block">Họ và tên</span>
                <span class="font-bold text-slate-700">${order.customer}</span>
              </div>
              <div>
                <span class="text-slate-400 block">Số điện thoại</span>
                <span class="font-bold text-slate-700">${order.phone}</span>
              </div>
              <div class="sm:col-span-2">
                <span class="text-slate-400 block">Địa chỉ nhận hàng</span>
                <span class="font-bold text-slate-700">${order.address}</span>
              </div>
              ${order.note ? `
                <div class="sm:col-span-2">
                  <span class="text-slate-400 block">Ghi chú từ khách hàng</span>
                  <span class="font-semibold text-amber-600">${order.note}</span>
                </div>
              ` : ''}
              <div>
                <span class="text-slate-400 block">Thời gian đặt</span>
                <span class="font-medium text-slate-600">${order.createdAt}</span>
              </div>
            </div>
          </div>

          <!-- Chi tiết sản phẩm -->
          <div>
            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Sản phẩm đã đặt</h4>
            <div class="border border-slate-100 rounded-xl px-4 py-2 bg-slate-50/50 max-h-[300px] overflow-y-auto">
              ${itemsHtml}
            </div>
          </div>

          <!-- Tổng tiền -->
          <div class="bg-amber-50/50 rounded-xl p-4 flex justify-between items-center border border-amber-100">
            <span class="text-sm font-bold text-slate-600">Tổng thanh toán:</span>
            <span class="text-lg sm:text-xl font-black text-amber-600">${formatPrice(order.total)}</span>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    resultDiv.innerHTML = `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div class="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h4 class="font-bold text-slate-800 text-base mb-1">Lỗi kết nối</h4>
        <p class="text-xs text-slate-500">Đã xảy ra sự cố khi kết nối tới máy chủ. Vui lòng thử lại sau.</p>
      </div>
    `;
  }
}




