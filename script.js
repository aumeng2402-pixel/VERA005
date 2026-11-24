/* ==========================================================
   VERA — script.js (ใช้ร่วมกันทุกหน้า)
   - product.html : โหลดสินค้า + ฟิลเตอร์ mood
   - order.html   : เติม item/price จาก URL + ส่งออเดอร์
   - admin.html   : แสดงออเดอร์จาก Google Sheet (CSV)
   ========================================================== */

(function () {
  "use strict";

  /* ---------- Config ---------- */
  var PRODUCTS_URL = "products.json";
  var ORDER_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbxYRToNuoKtLzsoK0MY8YIpLsftR7A7SqxV7uRC19WYSqKcctD4op43OfaBAaf5MCOV/exec";
  var ORDERS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vR5nuXJkEqyEyoDYRpw10X82f332aavqnKBR1gQwdRnandnAQm3M64a5zqLxb7i7xUw_E8Oe37mP7Sa/pub?gid=0&single=true&output=csv";

  var MOODS = [
    { key: "all", label: "ทั้งหมด" },
    { key: "fresh", label: "Fresh" },
    { key: "sweet", label: "Sweet" },
    { key: "confident", label: "Confident" },
    { key: "romance", label: "Romance" }
  ];

  /* ---------- Helpers ---------- */
  function $(selector) {
    return document.querySelector(selector);
  }

  function formatPrice(value) {
    var n = Number(value);
    if (isNaN(n)) return String(value);
    return n.toLocaleString("th-TH") + " บาท";
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ==========================================================
     1) product.html
     ========================================================== */
  function initProductPage() {
    var filterBar = $("#filter-bar");
    var list = $("#product-list");
    if (!filterBar || !list) return;

    var products = [];
    var params = new URLSearchParams(window.location.search);
    var requested = (params.get("mood") || "all").toLowerCase();
    var validKeys = MOODS.map(function (m) { return m.key; });
    var activeMood = validKeys.indexOf(requested) !== -1 ? requested : "all";

    function buildOrderUrl(product) {
      var query = new URLSearchParams();
      query.set("item", product.name + " " + product.size);
      query.set("price", product.price);
      return "order.html?" + query.toString();
    }

    function createCard(product) {
      var card = el("article", "product-card");
      card.setAttribute("data-mood", product.mood);

      var media = el("div", "product-card__media");
      var img = el("img");
      img.src = product.image;
      img.alt = product.name;
      img.loading = "lazy";
      media.appendChild(img);

      var body = el("div", "product-card__body");

      var mood = el("span", "mood mood--" + product.mood, capitalize(product.mood));
      var name = el("h3", "product-card__name", product.name);

      var meta = el("div", "product-card__meta");
      meta.appendChild(el("span", "product-card__size", product.size));
      meta.appendChild(el("span", "product-card__price", formatPrice(product.price)));

      var buy = el("a", "btn btn--gold", "สั่งซื้อ");
      buy.href = buildOrderUrl(product);

      body.appendChild(mood);
      body.appendChild(name);
      body.appendChild(meta);
      body.appendChild(buy);

      card.appendChild(media);
      card.appendChild(body);
      return card;
    }

    function render() {
      list.innerHTML = "";
      var shown = products.filter(function (p) {
        return activeMood === "all" || p.mood === activeMood;
      });

      if (shown.length === 0) {
        list.appendChild(el("p", "muted", "ยังไม่มีสินค้าในหมวดนี้"));
        return;
      }
      shown.forEach(function (p) { list.appendChild(createCard(p)); });
    }

    function updateButtons() {
      var buttons = filterBar.querySelectorAll(".filter-btn");
      buttons.forEach(function (btn) {
        var isActive = btn.getAttribute("data-mood") === activeMood;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function buildFilterBar() {
      filterBar.innerHTML = "";
      filterBar.classList.add("filters");
      MOODS.forEach(function (m) {
        var btn = el("button", "filter-btn", m.label);
        btn.type = "button";
        btn.setAttribute("data-mood", m.key);
        btn.addEventListener("click", function () {
          activeMood = m.key;
          updateButtons();
          render();
          // อัปเดต URL ให้แชร์ลิงก์ที่กรองไว้ได้ โดยไม่โหลดหน้าใหม่
          var url = new URL(window.location.href);
          if (m.key === "all") url.searchParams.delete("mood");
          else url.searchParams.set("mood", m.key);
          window.history.replaceState(null, "", url.toString());
        });
        filterBar.appendChild(btn);
      });
      updateButtons();
    }

    buildFilterBar();
    list.appendChild(el("p", "muted", "กำลังโหลดสินค้า..."));

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        render();
      })
      .catch(function (error) {
        console.error(error);
        list.innerHTML = "";
        list.appendChild(el("p", "muted", "โหลดสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
      });
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /* ==========================================================
     2) order.html
     ========================================================== */
  function initOrderPage() {
    var form = $("#orderForm");
    if (!form) return;

    var itemsInput = $("#items");
    var totalInput = $("#total");

    // เติมค่าจาก URL ทันทีที่โหลดหน้า (ทั้ง items และ total)
    var params = new URLSearchParams(window.location.search);
    var item = params.get("item");
    var price = params.get("price");

    if (item !== null && itemsInput) itemsInput.value = item;
    if (price !== null && totalInput) totalInput.value = price;

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var payload = {
        customerName: $("#customerName").value,
        contact: $("#contact").value,
        items: $("#items").value,
        total: $("#total").value,
        note: $("#note") ? $("#note").value : ""
      };

      fetch(ORDER_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload)
      })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      });
    });
  }

  /* ==========================================================
     3) admin.html
     ========================================================== */

  // Parse CSV เอง: รองรับ "ข้อความในเครื่องหมายคำพูด", "" (quote ซ้อน),
  // เครื่องหมายจุลภาคและขึ้นบรรทัดใหม่ในช่อง, และ CRLF/LF
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // ตัด BOM

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }

    // แถวสุดท้าย (กรณีไม่มีขึ้นบรรทัดใหม่ปิดท้าย)
    if (field !== "" || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    // ตัดแถวว่าง
    return rows.filter(function (r) {
      return r.some(function (c) { return c.trim() !== ""; });
    });
  }

  function initAdminPage() {
    var tbody = $("#ordersTable tbody");
    if (!tbody) return;

    function showMessage(text) {
      tbody.innerHTML = "";
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 6;
      td.textContent = text;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showMessage("กำลังโหลดรายการสั่งซื้อ...");

    // ใส่ timestamp กัน cache เพื่อให้ได้ข้อมูลล่าสุด
    var url = ORDERS_CSV_URL + "&t=" + Date.now();

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);
        rows.shift(); // ตัดแถวหัวตาราง

        if (rows.length === 0) {
          showMessage("ยังไม่มีรายการสั่งซื้อ");
          return;
        }

        // Sheet เพิ่มแถวใหม่ต่อท้ายเสมอ → กลับลำดับให้รายการล่าสุดอยู่บนสุด
        rows.reverse();

        tbody.innerHTML = "";
        rows.forEach(function (r) {
          var tr = document.createElement("tr");
          // คอลัมน์: วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line, รายการสินค้า, จำนวนเงินรวม, หมายเหตุ
          for (var c = 0; c < 6; c++) {
            var td = document.createElement("td");
            td.textContent = r[c] !== undefined ? r[c] : "";
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (error) {
        console.error(error);
        showMessage("โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้านี้อีกครั้ง");
      });
  }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initProductPage();
    initOrderPage();
    initAdminPage();
  });
})();
