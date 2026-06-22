// ==============================
// STATE
// ==============================
let products = [];
let cart = [];
let currentType = ''; // selected category (empty = all)

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

  // ---- Sidebar buttons (#categoryList) ----
  const listEl = document.getElementById('categoryList');
  if (listEl) {
    listEl.innerHTML = [
      { label: 'Tất cả', value: '', count: totalValid },
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
      ...types.map(t => ({ label: t, value: t, count: counts[t] || 0 }))
    ].map(item => `
      <button class="cat-pill${item.value === currentType ? ' active' : ''}" data-type="${item.value}" onclick="setCategory(this.dataset.type)">
        ${item.label}
        <span style="font-size:0.7rem;opacity:0.75;">${item.count}</span>
      </button>
    `).join('');
  }
}

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    products = data.filter(p => p.trangthai !== 'Ngừng theo dõi');
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Không tải được danh sách sản phẩm', 'error');
    products = [];
  }
  populateTypeFilter();
  renderShop();
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
    const matchType = !currentType || p.loai === currentType;
    return match && matchType;
  });
  if (sort === 'name_asc') list.sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
  if (sort === 'price_asc') list.sort((a, b) => a.gia - b.gia);
  if (sort === 'price_desc') list.sort((a, b) => b.gia - a.gia);
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
    <div class="sm:hidden bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full hover:shadow-md transition duration-200 group relative w-full">
      <!-- Clickable details area -->
      <div class="cursor-pointer active:bg-slate-50 transition duration-150 p-2 pb-0 flex-1 flex flex-col relative" onclick="showProductDetails('${p.ma.replace(/'/g, "\\'")}')">
        <span class="absolute top-2 right-2 text-[9px] text-indigo-700 bg-indigo-50/90 border border-indigo-150 px-1.5 py-0.5 rounded font-black truncate max-w-[90px] z-10">
          ${p.loai || 'Hàng hóa'}
        </span>
        <div class="flex flex-row items-stretch gap-2 mb-2">
          <div class="bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center w-20 h-20 overflow-hidden flex-shrink-0">
            ${p.image ? `<img src="${getProductImageUrl(p)}" class="w-full h-full object-cover" />` : `<span class="text-3xl select-none filter drop-shadow-sm opacity-60">${getIcon(p.ten)}</span>`}
          </div>
          <div class="flex flex-col items-start justify-end flex-1 min-w-0">
            <div class="flex flex-col">
              <span class="text-base font-black text-blue-600 leading-none">${formatPriceMobile(p.gia)}</span>
              <span class="text-[10px] text-slate-400 font-medium mt-1">/${p.donvi || 'Cái'}</span>
            </div>
          </div>
        </div>
        <div class="border border-slate-200 rounded-xl flex items-center justify-center h-[42px] mb-2 px-2 bg-slate-50/50 w-full mt-auto">
          <div class="text-[11px] font-bold text-slate-800 leading-tight line-clamp-2 text-center" title="${p.ten}">${p.ten}</div>
        </div>
      </div>
      
      <!-- Cart button -->
      <div class="px-2.5 pb-2">
        <div class="pt-2 border-t border-slate-100">
          <button class="w-full h-8 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-900 font-bold rounded-xl flex items-center justify-center gap-1.5 transition shadow-sm text-[11px]" onclick="addToCart('${p.ma.replace(/'/g, "\\'")}')" title="Thêm vào giỏ">
            <i class="fa-solid fa-cart-plus"></i> Thêm
          </button>
        </div>
      </div>
    </div>

    <!-- ========== DESKTOP CARD (ẩn trên mobile) ========== -->
    <div class="max-sm:hidden flex bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-col h-full hover:shadow-md transition duration-200 group">
      <div class="bg-slate-50 border-b border-slate-100 flex items-center justify-center h-44 w-full overflow-hidden flex-shrink-0 relative transition p-3 cursor-pointer group/img overflow-hidden" onclick="showProductDetails('${p.ma.replace(/'/g, "\\'")}')">
        ${p.image ? `<img src="${getProductImageUrl(p)}" class="w-full h-full object-contain transition duration-300 group-hover/img:scale-105" />` : `<span class="text-6xl select-none filter drop-shadow-sm opacity-60 transition duration-300 group-hover/img:scale-105">${getIcon(p.ten)}</span>`}
        <!-- Hover Overlay -->
        <div class="absolute inset-0 bg-slate-950/10 opacity-0 group-hover/img:opacity-100 transition duration-200 flex items-center justify-center">
          <span class="w-10 h-10 rounded-full bg-white/95 text-slate-800 flex items-center justify-center shadow-md transform scale-90 group-hover/img:scale-100 transition duration-200">
            <i class="fa-solid fa-magnifying-glass-plus text-sm"></i>
          </span>
        </div>
      </div>
      <div class="p-4 flex flex-col flex-1">
        <div class="text-[15px] font-bold text-slate-800 leading-tight mb-1.5 line-clamp-2 h-[38px] cursor-pointer hover:text-blue-600 transition" title="${p.ten}" onclick="showProductDetails('${p.ma.replace(/'/g, "\\'")}')">${p.ten}</div>
        <div class="flex items-center gap-1.5 mb-3 flex-wrap">
          <span class="text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded flex items-center gap-1 font-semibold"><i class="fa-solid fa-hashtag text-slate-400/80"></i>${p.ma}</span>
          <span class="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded font-black truncate max-w-[120px]">${p.loai || 'Hàng hóa'}</span>
        </div>
        <div class="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div class="flex flex-col justify-center">
            <span class="text-lg font-black text-blue-600 leading-none">${formatPrice(p.gia)}</span>
            ${p.donvi ? `<span class="text-xs text-slate-400 mt-1 font-medium">/${p.donvi}</span>` : ''}
          </div>
          <button class="shrink-0 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-[0.97] text-slate-900 font-extrabold rounded-xl flex items-center justify-center gap-2 transition shadow-sm text-sm" onclick="addToCart('${p.ma.replace(/'/g, "\\'")}')" title="Thêm vào giỏ">
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

function clearCart() {
  cart = [];
  updateCartBadge();
  saveCart();
  renderCart();
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
  badge.textContent = total;
  badge.classList.toggle('visible', total > 0);
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

  if (cart.length === 0) {
    body.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-slate-400">
        <div class="text-6xl mb-4 select-none"><i class="fa-solid fa-cart-shopping"></i></div>
        <div class="text-lg font-bold text-slate-700">Giỏ hàng đang trống</div>
        <p class="mt-2 text-sm text-slate-500">Hãy thêm sản phẩm từ cửa hàng</p>
      </div>
    `;
    footer.innerHTML = '';
    return;
  }

  body.innerHTML = cart.map(item => `
    <div class="swipe-container relative overflow-hidden w-full touch-pan-y" data-ma="${item.ma.replace(/'/g, "\\'")}">
      <!-- Background Delete Action -->
      <div class="absolute right-0 top-0 bottom-0 bg-red-500 text-white flex items-center justify-center w-16 cursor-pointer rounded-xl my-1" onclick="removeFromCart('${item.ma.replace(/'/g, "\\'")}')">
        <i class="fa-solid fa-trash text-lg"></i>
      </div>
      <!-- Foreground content -->
      <div class="swipe-content relative bg-white transition-transform duration-150 ease-out flex gap-2 xxs:gap-3 items-start py-3 xxs:py-4 border-b border-slate-100 w-full">
        <div class="w-10 h-10 xxs:w-12 xxs:h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
          ${item.image ? `<img src="${getProductImageUrl(item)}" class="w-full h-full object-cover" />` : `<span class="text-xl xxs:text-2xl">${getIcon(item.ten)}</span>`}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs xxs:text-sm font-bold text-slate-800 leading-tight truncate" title="${item.ten}">${item.ten}</div>
          <div class="text-[10px] xxs:text-xs font-mono font-bold text-slate-400 mt-0.5">${item.ma}</div>
          <div class="flex items-center gap-1 xxs:gap-2 mt-2">
            <button class="w-6 h-6 xxs:w-7 xxs:h-7 rounded bg-slate-100 font-bold hover:bg-slate-200 active:scale-95 text-slate-700 transition flex items-center justify-center text-xs xxs:text-sm" onclick="changeQty('${item.ma.replace(/'/g, "\\'")}',-1)">−</button>
            <span class="w-6 xxs:w-8 text-center font-bold text-slate-800 text-xs xxs:text-sm">${item.qty}</span>
            <button class="w-6 h-6 xxs:w-7 xxs:h-7 rounded bg-slate-100 font-bold hover:bg-slate-200 active:scale-95 text-slate-700 transition flex items-center justify-center text-xs xxs:text-sm" onclick="changeQty('${item.ma.replace(/'/g, "\\'")}',1)">+</button>
            ${item.donvi ? `<span class="text-[10px] xxs:text-xs font-semibold text-slate-500 ml-0.5 xxs:ml-1">(${item.donvi})</span>` : ''}
          </div>
        </div>
        <div class="flex flex-col items-end gap-2 flex-shrink-0">
          <div class="text-xs xxs:text-sm font-extrabold text-blue-600">${item.gia ? formatPrice(item.gia * item.qty) : 'Liên hệ'}</div>
          <button class="w-6 h-6 xxs:w-7 xxs:h-7 rounded-lg text-red-500 hover:bg-red-50 active:scale-95 flex items-center justify-center text-sm xxs:text-base transition" onclick="removeFromCart('${item.ma.replace(/'/g, "\\'")}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>
  `).join('');

  initSwipeToDelete();

  const total = cart.reduce((s, x) => s + (x.gia * x.qty), 0);
  footer.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <span class="text-sm font-bold text-slate-600">Tổng cộng (${cart.length} loại):</span>
      <span class="text-xl font-extrabold text-blue-605">${formatPrice(total)}</span>
    </div>
    <button class="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl font-bold text-base shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2" onclick="openOrderForm()">
      <span><i class="fa-solid fa-cart-arrow-down" style="color: rgb(99, 230, 190);"></i>
</span> Đặt hàng ngay
    </button>
    <button class="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl font-bold text-sm transition mt-3" onclick="clearCart()">
      Xóa giỏ hàng
    </button>
  `;
}

function changeQty(ma, delta) {
  const item = cart.find(x => x.ma === ma);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(x => x.ma !== ma);
  updateCartBadge();
  saveCart();
  renderCart();
}

function removeFromCart(ma) {
  cart = cart.filter(x => x.ma !== ma);
  updateCartBadge();
  saveCart();
  renderCart();
}

// ==============================
// ORDER
// ==============================
function openOrderForm() {
  closeCart();
  const confirmItems = document.getElementById('confirmItems');
  const total = cart.reduce((s, x) => s + (x.gia * x.qty), 0);
  confirmItems.innerHTML = cart.map(item => `
    <div class="px-3 py-2 xxs:px-4 xxs:py-3 flex justify-between items-start gap-2 xxs:gap-3 text-xs xxs:text-sm font-medium text-slate-700 border-b border-slate-100 last:border-b-0">
      <span class="flex-1">${item.ten} <strong class="text-slate-800 whitespace-nowrap ml-1">× ${item.qty}</strong></span>
      <span class="font-bold text-blue-600 flex-shrink-0 text-right mt-0.5">${item.gia ? formatPrice(item.gia * item.qty) : 'Liên hệ'}</span>
    </div>
  `).join('');
  document.getElementById('confirmTotal').textContent = formatPrice(total);
  document.getElementById('orderModal').classList.add('open');
}

function closeOrderModal() {
  document.getElementById('orderModal').classList.remove('open');
}

async function submitOrder() {
  const name = document.getElementById('orderName').value.trim();
  const phone = document.getElementById('orderPhone').value.trim();
  const address = document.getElementById('orderAddress').value.trim();
  const note = document.getElementById('orderNote').value.trim();

  if (!name) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng nhập họ tên', 'error'); return; }
  if (!phone) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng nhập số điện thoại', 'error'); return; }
  if (!address) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng nhập địa chỉ', 'error'); return; }
  if (cart.length === 0) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Giỏ hàng trống', 'error'); return; }

  const btn = document.getElementById('submitOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Đang gửi...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: name,
        phone,
        address,
        note,
        items: cart.map(x => ({ ma: x.ma, qty: x.qty })),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast('<i class="fa-solid fa-xmark"></i> ' + (data.message || 'Đặt hàng thất bại'), 'error');
      return;
    }
    cart = [];
    updateCartBadge();
    saveCart();
    closeOrderModal();
    ['orderName', 'orderPhone', 'orderAddress', 'orderNote'].forEach(id => document.getElementById(id).value = '');
    showToast(`<i class="fa-solid fa-party-horn"></i> Đặt hàng thành công! Mã đơn: ${data.order.id}`, 'success');
  } catch (err) {
    showToast('<i class="fa-solid fa-xmark"></i> Lỗi kết nối tới server', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '<i class="fa-solid fa-circle-check"></i> Xác nhận đặt hàng';
  }
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
// LOAD SETTINGS (FOOTER)
// ==============================
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    document.getElementById('footer-address').innerHTML = `<span class="text-amber-400 flex-shrink-0"><i class="fa-solid fa-location-dot"></i></span><span><strong>Địa chỉ:</strong> ${settings.address || '-'}</span>`;
    document.getElementById('footer-phone').innerHTML = `<span class="text-amber-400 flex-shrink-0"><i class="fa-solid fa-phone"></i></span><span><strong>SĐT:</strong> ${settings.phone || '-'}</span>`;
    document.getElementById('footer-email').innerHTML = `<span class="text-amber-400 flex-shrink-0"><i class="fa-solid fa-envelope"></i></span><span><strong>Email:</strong> ${settings.email || '-'}</span>`;

    if (settings.mapUrl) {
      document.getElementById('footer-map-container').innerHTML = `
        <iframe src="${settings.mapUrl}" width="100%" height="250" style="border:0; border-radius:8px;" allowfullscreen="" loading="lazy"></iframe>
      `;
    } else {
      document.getElementById('footer-map-container').innerHTML = `<p style="color:var(--muted)">Chưa cấu hình bản đồ.</p>`;
    }
  } catch (err) {
    console.error('Không tải được cài đặt footer:', err);
  }
}

// ==============================
// HERO SLIDER
// ==============================
let currentSlideIdx = 0;
let slideInterval;

async function initSlider() {
  const slidesContainer = document.getElementById('heroSlides');
  const dotsContainer = document.getElementById('slideDots');
  if (!slidesContainer) return;

  // Load danh sách ảnh từ API
  let slideUrls = [];
  try {
    const res = await fetch('/api/slides');
    if (res.ok) slideUrls = await res.json();
  } catch (err) {
    console.warn('Không tải được danh sách slide:', err);
  }

  // Nếu không có ảnh nào thì giữ placeholder
  if (!slideUrls || slideUrls.length === 0) return;

  // Render slide elements
  slidesContainer.innerHTML = slideUrls.map((url, i) =>
    `<div class="hero-slide${i === 0 ? ' active' : ''}" style="background-image:url('${url}');"></div>`
  ).join('');

  // Render dot indicators
  dotsContainer.innerHTML = slideUrls.map((_, i) =>
    `<span class="dot${i === 0 ? ' active' : ''}" onclick="setSlide(${i})"></span>`
  ).join('');

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
      <div class="w-full md:w-1/2 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-100 flex items-center justify-center p-6 min-h-[260px] md:min-h-[360px] relative">
        ${p.image ? `
          <div class="relative w-full h-[220px] md:h-[310px] flex items-center justify-center group/img overflow-hidden rounded-2xl bg-white p-3 border border-slate-200/50 shadow-inner">
            <img src="${getProductImageUrl(p)}" alt="${p.ten}" class="max-w-full max-h-full object-contain transition duration-300 group-hover/img:scale-105 cursor-zoom-in" onclick="openFullScreenImage('${getProductImageUrl(p)}')" />
            <button onclick="openFullScreenImage('${getProductImageUrl(p)}')" class="absolute bottom-3 right-3 bg-white/95 hover:bg-white text-slate-800 w-8 h-8 rounded-lg shadow-sm border border-slate-150 transition flex items-center justify-center" title="Xem ảnh đầy đủ">
              <i class="fa-solid fa-up-right-and-down-left-from-center text-[11px]"></i>
            </button>
          </div>
        ` : `
          <div class="flex flex-col items-center justify-center text-center p-8">
            <div class="w-24 h-24 rounded-full bg-slate-200/50 flex items-center justify-center text-slate-400 mb-4 shadow-inner">
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
            <span class="text-[10px] font-extrabold tracking-wide uppercase px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100/70 inline-block">
              ${p.loai || 'Hàng hóa'}
            </span>
          </div>
          
          <!-- Tên sản phẩm -->
          <h2 class="text-base xs:text-lg md:text-xl font-extrabold text-slate-900 leading-tight mb-2 select-text" title="${p.ten}">
            ${p.ten}
          </h2>
          
          <!-- Mã sản phẩm & Trạng thái -->
          <div class="flex items-center gap-2 mb-4 flex-wrap">
            <span class="text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded flex items-center gap-1 font-semibold select-all">
              <i class="fa-solid fa-hashtag text-slate-400"></i> ${p.ma}
            </span>
            <button onclick="copyToClipboard('${p.ma.replace(/'/g, "\\'")}', this)" class="text-slate-400 hover:text-amber-500 transition text-[11px] p-1" title="Sao chép mã">
              <i class="fa-regular fa-copy"></i>
            </button>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${p.trangthai === 'Đang theo dõi' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}">
              ${p.trangthai || 'Có sẵn'}
            </span>
          </div>
          
          <!-- Khung Giá & Đơn vị -->
          <div class="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between mb-5">
            <div>
              <span class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Đơn giá</span>
              <span class="text-lg md:text-xl font-black text-blue-600">${formatPrice(p.gia)}</span>
            </div>
            <div class="text-right">
              <span class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Đơn vị tính</span>
              <span class="inline-block px-2.5 py-0.5 bg-slate-200/60 text-slate-700 text-xs font-extrabold rounded-lg">${p.donvi || 'Cái'}</span>
            </div>
          </div>
        </div>
        
        <!-- Chọn số lượng & Thêm vào giỏ -->
        <div class="mt-auto pt-4 border-t border-slate-100 space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Số lượng mua</span>
            <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
              <button onclick="changeDetailQty(-1)" class="w-7 h-7 rounded-lg bg-white shadow-sm border border-slate-200 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-50 active:scale-95 transition">
                <i class="fa-solid fa-minus text-[10px]"></i>
              </button>
              <input type="number" id="detailQtyInput" value="1" min="1" class="w-10 text-center font-extrabold text-slate-800 bg-transparent focus:outline-none text-xs" onchange="validateDetailQty(this)" />
              <button onclick="changeDetailQty(1)" class="w-7 h-7 rounded-lg bg-white shadow-sm border border-slate-200 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-50 active:scale-95 transition">
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
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
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
    overlay.className = 'fixed inset-0 bg-black/90 z-[300] flex items-center justify-center p-4 cursor-zoom-out opacity-0 transition-opacity duration-200 pointer-events-none';
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
function initRealtimeUpdates() {
  let source = null;

  function connect() {
    if (source) {
      source.close();
    }

    source = new EventSource('/api/updates/stream');

    source.onmessage = async function (event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'products_updated') {
          console.log('⚡ Nhận cập nhật sản phẩm realtime...');
          await loadProducts();
        } else if (msg.type === 'settings_updated') {
          console.log('⚡ Nhận cập nhật cấu hình realtime...');
          await loadSettings();
        }
      } catch (e) {
        console.error('Lỗi giải mã thông điệp realtime:', e);
      }
    };

    source.onerror = function () {
      console.warn('Mất kết nối realtime, đang kết nối lại sau 5 giây...');
      source.close();
      setTimeout(connect, 5000);
    };
  }

  connect();
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

    container.addEventListener('touchstart', function(e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      content.style.transition = 'none';
      isDragging = false;
    }, { passive: true });

    container.addEventListener('touchmove', function(e) {
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

    container.addEventListener('touchend', function(e) {
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
