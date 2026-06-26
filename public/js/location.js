/* ===================================================================
 * location.js – Lay vi tri hien tai cua khach hang
 * Them nut "Su dung vi tri hien tai" ngay duoi o #orderAddress
 * =================================================================== */
(function () {
  'use strict';

  var addressInput = document.getElementById('orderAddress');
  if (!addressInput) return;

  /* ── Tao nut bam ──────────────────────────────────────────────────── */
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btnGetLocation';
  // btn.textContent = '\uD83D\uDCCD S\u1EED d\u1EE5ng v\u1ECB tr\u00ED hi\u1EC7n t\u1EA1i';
  btn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Sử dụng vị trí hiện tại';
  btn.style.cssText =
    'margin-top:6px;padding:6px 12px;font-size:12px;font-weight:700;' +
    'color:#92400e;background:#fef3c7;border:1.5px solid #fbbf24;' +
    'border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;' +
    'gap:4px;transition:all .15s;';

  btn.addEventListener('mouseenter', function () {
    btn.style.background = '#fde68a';
  });
  btn.addEventListener('mouseleave', function () {
    btn.style.background = '#fef3c7';
  });

  /* Chen nut ngay sau o input dia chi */
  addressInput.parentNode.insertBefore(btn, addressInput.nextSibling);

  /* ── Xu ly click ──────────────────────────────────────────────────── */
  btn.addEventListener('click', async function () {
    if (!navigator.geolocation) {
      alert('Tr\u00ECnh duy\u1EC7t kh\u00F4ng h\u1ED7 tr\u1EE3 \u0111\u1ECBnh v\u1ECB.');
      return;
    }

    var originalText = btn.textContent;
    btn.textContent = '\u23F3 \u0110ang l\u1EA5y v\u1ECB tr\u00ED...';
    btn.disabled = true;
    btn.style.opacity = '0.6';

    try {
      var pos = await new Promise(function (resolve, reject) {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      var lat = pos.coords.latitude;
      var lon = pos.coords.longitude;
      var coordStr = 'To\u1EA1 \u0111\u1ED9: ' + lat.toFixed(6) + ', ' + lon.toFixed(6);
      var addressStr = '';

      try {
        var resp = await fetch(
          'https://nominatim.openstreetmap.org/reverse?format=json' +
          '&lat=' + lat + '&lon=' + lon + '&addressdetails=1',
          { headers: { 'Accept-Language': 'vi' } }
        );
        var data = await resp.json();
        if (data && data.display_name) {
          addressStr = data.display_name;
        }
      } catch (_) {
        /* API loi – bo qua, se dung "Vi tri hien tai" */
      }

      if (addressStr) {
        addressInput.value = addressStr + ' (' + coordStr + ')';
      } else {
        addressInput.value = 'V\u1ECB tr\u00ED hi\u1EC7n t\u1EA1i (' + coordStr + ')';
      }

      /* Trigger input event de validation nhan duoc gia tri moi */
      addressInput.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (err) {
      var msg = 'Kh\u00F4ng l\u1EA5y \u0111\u01B0\u1EE3c v\u1ECB tr\u00ED.';
      if (err.code === 1) msg = 'B\u1EA1n \u0111\u00E3 t\u1EEB ch\u1ED1i quy\u1EC1n truy c\u1EADp v\u1ECB tr\u00ED.';
      else if (err.code === 2) msg = 'Kh\u00F4ng x\u00E1c \u0111\u1ECBnh \u0111\u01B0\u1EE3c v\u1ECB tr\u00ED.';
      else if (err.code === 3) msg = 'H\u1EBFt th\u1EDDi gian ch\u1EDD v\u1ECB tr\u00ED.';
      alert(msg);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  });
})();
