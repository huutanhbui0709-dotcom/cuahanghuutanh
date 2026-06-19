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
    return (tr % 1 === 0 ? tr.toFixed(0) : tr.toFixed(tr >= 10 ? 1 : 2).replace(/0+$/, '')) + 'Tr';
  }
  return p.toLocaleString('vi-VN') + '₫';
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
    products = await res.json();
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
    <div class="sm:hidden bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col self-start hover:shadow-md transition duration-200 group relative">
      <span class="absolute top-2 right-2 text-[9px] text-indigo-700 bg-indigo-50/90 border border-indigo-150 px-1.5 py-0.5 rounded font-black truncate max-w-[90px] z-10">
        ${p.loai || 'Hàng hóa'}
      </span>
      <div class="flex flex-row items-stretch p-2 gap-2">
        <div class="bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center w-20 h-20 overflow-hidden flex-shrink-0">
          ${p.image ? `<img src="${p.image}" class="w-full h-full object-cover" />` : `<span class="text-3xl select-none filter drop-shadow-sm opacity-60">${getIcon(p.ten)}</span>`}
        </div>
        <div class="flex flex-col items-start justify-end flex-1 min-w-0">
          <div class="flex flex-col">
            <span class="text-base font-black text-blue-600 leading-none">${formatPriceMobile(p.gia)}</span>
            <span class="text-[10px] text-slate-400 font-medium mt-1">/${p.donvi || 'Cái'}</span>
          </div>
        </div>
      </div>
      <div class="px-2.5 pb-2 flex flex-col flex-1">
        <div class="border border-slate-200 rounded-xl flex items-center justify-center h-[42px] mb-2 px-2 bg-slate-50/50">
          <div class="text-[11px] font-bold text-slate-800 leading-tight line-clamp-2 text-center" title="${p.ten}">${p.ten}</div>
        </div>
        <div class="mt-auto pt-2 border-t border-slate-100">
          <button class="w-full h-8 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-900 font-bold rounded-xl flex items-center justify-center gap-1.5 transition shadow-sm text-[11px]" onclick="addToCart('${p.ma.replace(/'/g, "\\'")}')" title="Thêm vào giỏ">
            <i class="fa-solid fa-cart-plus"></i> Thêm
          </button>
        </div>
      </div>
    </div>

    <!-- ========== DESKTOP CARD (ẩn trên mobile) ========== -->
    <div class="max-sm:hidden flex bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-col h-full hover:shadow-md transition duration-200 group">
      <div class="bg-slate-50 border-b border-slate-100 flex items-center justify-center h-44 w-full overflow-hidden flex-shrink-0 relative group-hover:opacity-95 transition p-3">
        ${p.image ? `<img src="${p.image}" class="w-full h-full object-contain" />` : `<span class="text-6xl select-none filter drop-shadow-sm opacity-60">${getIcon(p.ten)}</span>`}
      </div>
      <div class="p-4 flex flex-col flex-1">
        <div class="text-[15px] font-bold text-slate-800 leading-tight mb-1.5 line-clamp-2 h-[38px]" title="${p.ten}">${p.ten}</div>
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
    <div class="flex gap-2 xxs:gap-3 items-start py-3 xxs:py-4 border-b border-slate-100">
      <div class="w-10 h-10 xxs:w-12 xxs:h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
        ${item.image ? `<img src="${item.image}" class="w-full h-full object-cover" />` : `<span class="text-xl xxs:text-2xl">${getIcon(item.ten)}</span>`}
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-xs xxs:text-sm font-bold text-slate-800 leading-tight truncate" title="${item.ten}">${item.ten}</div>
        <div class="text-[10px] xxs:text-xs font-mono font-bold text-slate-400 mt-0.5">${item.ma}</div>
        <div class="flex items-center gap-1 xxs:gap-2 mt-2">
          <button class="w-6 h-6 xxs:w-7 xxs:h-7 rounded bg-slate-100 font-bold hover:bg-slate-200 active:scale-95 text-slate-700 transition flex items-center justify-center text-xs xxs:text-sm" onclick="changeQty('${item.ma}',-1)">−</button>
          <span class="w-6 xxs:w-8 text-center font-bold text-slate-800 text-xs xxs:text-sm">${item.qty}</span>
          <button class="w-6 h-6 xxs:w-7 xxs:h-7 rounded bg-slate-100 font-bold hover:bg-slate-200 active:scale-95 text-slate-700 transition flex items-center justify-center text-xs xxs:text-sm" onclick="changeQty('${item.ma}',1)">+</button>
          ${item.donvi ? `<span class="text-[10px] xxs:text-xs font-semibold text-slate-500 ml-0.5 xxs:ml-1">(${item.donvi})</span>` : ''}
        </div>
      </div>
      <div class="flex flex-col items-end gap-2 flex-shrink-0">
        <div class="text-xs xxs:text-sm font-extrabold text-blue-600">${item.gia ? formatPrice(item.gia * item.qty) : 'Liên hệ'}</div>
        <button class="w-6 h-6 xxs:w-7 xxs:h-7 rounded-lg text-red-500 hover:bg-red-50 active:scale-95 flex items-center justify-center text-sm xxs:text-base transition" onclick="removeFromCart('${item.ma}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('');

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
