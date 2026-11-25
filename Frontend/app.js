const API = ""; 

const $ = (s) => document.querySelector(s);
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const load = (k, d) => { try { return JSON.parse(sessionStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => sessionStorage.setItem(k, JSON.stringify(v));
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");
const clearToken = () => { localStorage.removeItem("token"); sessionStorage.removeItem("token"); };
const setToken = (t, remember) => { clearToken(); (remember ? localStorage : sessionStorage).setItem("token", t); };
const authHeaders = () => { const t = getToken(); return t ? { Authorization: "Bearer " + t } : {}; };

async function api(path, { method = "GET", body } = {}) {
  const headers = authHeaders();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || "Lỗi " + res.status), { status: res.status });
  return data;
}

let currentUser = null;       
let currentBg = null;          

["settings", "notes", "bg", "sid"].forEach((k) => sessionStorage.removeItem(k));

const DEFAULTS = { font: "ui-monospace, 'Source Code Pro', Consolas, monospace", bg: "#9e4545", accent: "#ff6b5e", text: "#ffffff", focus: 25, short: 5, long: 15 };
let settings = { ...DEFAULTS };

let settingsTimer = null;
function persistSettings() {
  if (!currentUser) return;
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    api("/api/settings", { method: "PUT", body: { ...settings, background: currentBg } }).catch(() => {});
  }, 400);
}
function persistBg() {
  persistSettings();
}

function applySettings() {
  const r = document.documentElement.style;
  r.setProperty("--bg", settings.bg);
  r.setProperty("--accent", settings.accent);
  r.setProperty("--text", settings.text);
  r.setProperty("--font", settings.font);
}

const FIELDS = [["#font", "font"], ["#bgColor", "bg"], ["#accentColor", "accent"], ["#textColor", "text"]];
const MIN_FIELDS = [["#focusMin", "focus"], ["#shortMin", "short"], ["#longMin", "long"]];

function syncSettingsInputs() {
  if (![...$("#font").options].some((o) => o.value === settings.font)) settings.font = DEFAULTS.font;
  [...FIELDS, ...MIN_FIELDS].forEach(([id, key]) => { $(id).value = settings[key]; });
}

FIELDS.forEach(([id, key]) => {
  $(id).addEventListener("input", () => {
    settings[key] = $(id).value;
    persistSettings();
    applySettings();
  });
});

MIN_FIELDS.forEach(([id, key]) => {
  const input = $(id);
  input.addEventListener("change", () => {
    const v = Number(input.value);
    if (!Number.isInteger(v) || v < 1 || v > 180) { input.value = settings[key]; return; } // sai -> trả về số cũ
    settings[key] = v;
    persistSettings();

    if (mode === key) {
      stop();
      remaining = total();
      render();
    }
  });
});

/* ============ Đồng hồ ============ */
let mode = "focus";
let remaining = settings.focus * 60;
let endAt = 0, tick = null;
const total = () => settings[mode] * 60;

function render() {
  const m = String(Math.floor(remaining / 60)).padStart(2, "0");
  const s = String(remaining % 60).padStart(2, "0");
  $("#timer").textContent = `${m}:${s}`;
  document.title = `${m}:${s} - Pomodoro`;
}
function stop() {
  clearInterval(tick); tick = null;
  $("#start").textContent = "Start";
}
function start() {
  if (tick) return stop();
  if (remaining <= 0) remaining = total();
  endAt = Date.now() + remaining * 1000;
  $("#start").textContent = "Pause";
  tick = setInterval(() => {
    remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    render();
    if (remaining === 0) {
      stop();
      if (mode === "focus") recordSession(); // tính 1 session Focus đã hoàn thành
      alert("Hết giờ!");
    }
  }, 250);
}
function setMode(m) {
  mode = m; stop(); remaining = total(); render();
  document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
}
document.querySelectorAll(".mode").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$("#start").onclick = start;
$("#reset").onclick = () => { stop(); remaining = total(); render(); };

/* ============ Ghi chú ============ */
let notes = [];

let notesTimer = null;
function saveNotes() {
  if (!currentUser) return;
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => {
    api("/api/notes", { method: "PUT", body: notes }).catch(() => {});
  }, 500);
}

function renderNotes(focusId) {
  const box = $("#noteList");
  box.innerHTML = "";
  notes.forEach((note) => {
    const card = el("div", "note");

    const ta = el("textarea");
    ta.placeholder = "Ghi chú...";
    ta.value = note.text;
    ta.oninput = () => { note.text = ta.value; saveNotes(); };
    card.append(ta);

    note.items.forEach((it, idx) => {
      const row = el("div", "item" + (it.done ? " done" : ""));
      const cb = el("input"); cb.type = "checkbox"; cb.checked = it.done;
      cb.onchange = () => { it.done = cb.checked; row.classList.toggle("done", it.done); saveNotes(); };

      const inp = el("input"); inp.type = "text"; inp.value = it.text; inp.dataset.id = it.id;
      inp.oninput = () => { it.text = inp.value; saveNotes(); };
      inp.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const n = { id: uid(), text: "", done: false };
          note.items.splice(idx + 1, 0, n);
          saveNotes(); renderNotes(n.id);
        } else if (e.key === "Backspace" && inp.value === "") {
          e.preventDefault();
          note.items.splice(idx, 1);
          saveNotes(); renderNotes(note.items[idx - 1]?.id);
        }
      };

      const x = el("button", "mini"); x.textContent = "×";
      x.onclick = () => { note.items.splice(idx, 1); saveNotes(); renderNotes(); };
      row.append(cb, inp, x);
      card.append(row);
    });

    const actions = el("div", "note-actions");
    const addItem = el("button", "mini"); addItem.textContent = "+ Checkbox";
    addItem.onclick = () => {
      const n = { id: uid(), text: "", done: false };
      note.items.push(n); saveNotes(); renderNotes(n.id);
    };
    const del = el("button", "mini"); del.textContent = "Xóa note";
    del.onclick = () => {
      notes = notes.filter((n) => n !== note);
      saveNotes(); renderNotes();
    };
    actions.append(addItem, del);
    card.append(actions);
    box.append(card);
  });
  if (focusId) box.querySelector(`[data-id="${focusId}"]`)?.focus();
}
$("#addNote").onclick = () => {
  notes.unshift({ id: uid(), text: "", items: [] });
  saveNotes(); renderNotes();
};

/* ============ Hình nền ============ */
const video = $("#bgVideo");
let presets = [];
let bgList = [];

function applyBg(bg) {
  video.pause(); video.removeAttribute("src"); video.load();
  video.style.display = "none";
  document.body.style.backgroundImage = "none";
  if (!bg) return;
  if (bg.type === "video") {
    video.src = API + bg.url;
    video.style.display = "block";
    video.play().catch(() => {});
  } else {
    document.body.style.backgroundImage = `url("${API}${bg.url}")`;
  }
}
function chooseBg(bg) {
  currentBg = bg; persistBg(); applyBg(bg); renderBgGrid();
}

async function loadBgs() {
  let ok = true;
  try { presets = await (await fetch(`${API}/api/presets`)).json(); } catch { presets = []; ok = false; }
  if (currentUser) {
    try { bgList = await (await fetch(`${API}/api/backgrounds`, { headers: authHeaders() })).json(); }
    catch { bgList = []; ok = false; }
  } else {
    bgList = [];
  }

  if (ok && currentBg && ![...presets, ...bgList].some((b) => b.url === currentBg.url)) {
    currentBg = null; persistBg(); applyBg(null);
  }
  renderBgGrid();
}

function makeTile(b, onDelete) {
  const t = el("div", "tile" + (currentBg?.url === b.url ? " sel" : ""));
  const m = el(b.type === "video" ? "video" : "img");
  m.src = API + b.url + (b.type === "video" ? "#t=0.5" : "");
  if (b.type === "video") { m.muted = true; m.preload = "metadata"; }
  t.append(m);
  t.onclick = () => chooseBg({ url: b.url, type: b.type });

  if (onDelete) { // chỉ hình mình tự upload mới có nút xóa
    const x = el("button", "mini x"); x.textContent = "×";
    x.onclick = (e) => { e.stopPropagation(); onDelete(); };
    t.append(x);
  }
  return t;
}

function renderBgGrid() {
  const g = $("#bgGrid");
  g.innerHTML = "";

  const none = el("div", "tile" + (!currentBg ? " sel" : ""));
  none.textContent = "None";
  none.onclick = () => chooseBg(null);
  g.append(none);

  presets.forEach((b) => g.append(makeTile(b))); // hình có sẵn: không có nút xóa

  bgList.forEach((b) =>
    g.append(
      makeTile(b, async () => {
        await fetch(`${API}/api/backgrounds/${b.name}`, { method: "DELETE", headers: authHeaders() });
        if (currentBg?.url === b.url) chooseBg(null);
        loadBgs();
      })
    )
  );
}

async function uploadFile(url, file) {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch(url, { method: "POST", headers: authHeaders(), body: fd });
    const d = await res.json().catch(() => null);
    if (!res.ok) throw new Error(d?.error || "Upload thất bại");
    $("#bgMsg").textContent = "";
    return d;
  } catch (err) {
    $("#bgMsg").textContent = err.message;
    return null;
  }
}

$("#bgFile").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const d = await uploadFile(`${API}/api/backgrounds`, f);
  if (d) chooseBg({ url: d.url, type: d.type });
  e.target.value = "";
  loadBgs();
};

// Admin, đăng nhập/đăng ký và khởi động ứng dụng
document.querySelectorAll("details").forEach((d, i) => {
  const key = "open-" + (d.className || i);
  d.open = load(key, d.open);
  d.addEventListener("toggle", () => save(key, d.open));
});

/* ============ Hồ sơ người dùng + trang quản lý admin ============ */
const profilePanel = $("#profilePanel");
const adminModal = $("#adminModal");
let stats = { sessions: 0, minutes: 0 };

const fmtMinutes = (m) => (m >= 60 ? `≈ ${Math.floor(m / 60)}h ${m % 60}m` : "");

function renderStats() {
  $("#statMinutes").textContent = stats.minutes;
  $("#statHours").textContent = fmtMinutes(stats.minutes);
  $("#statSessions").textContent = stats.sessions;
}
async function loadStats() {
  try { stats = await api("/api/stats"); renderStats(); } catch {}
}
// Gọi khi đồng hồ Focus chạy hết giờ (chỉ ghi khi đã đăng nhập)
async function recordSession() {
  if (!currentUser) return;
  try {
    stats = await api("/api/sessions", { method: "POST", body: { minutes: settings.focus } });
    renderStats();
  } catch {}
}

function openProfile() {
  closeAdmin();
  $("#profileName").textContent = currentUser.username;
  $("#profileMeta").textContent = `${currentUser.email} · ${currentUser.role}`;
  $("#profileJoined").textContent = currentUser.created_at
    ? "Joined " + new Date(currentUser.created_at).toLocaleDateString() : "";
  profilePanel.hidden = false;
  loadStats();
}
function closeProfile() { profilePanel.hidden = true; }
function openAdmin() { closeProfile(); adminModal.hidden = false; loadAdminUsers(); }
function closeAdmin() { adminModal.hidden = true; }

$("#userBtn").onclick = () => (profilePanel.hidden ? openProfile() : closeProfile());
$("#roleBtn").onclick = () => (adminModal.hidden ? openAdmin() : closeAdmin());
$("#profileClose").onclick = closeProfile;
$("#adminClose").onclick = closeAdmin;
adminModal.addEventListener("click", (e) => { if (e.target === adminModal) closeAdmin(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeProfile(); closeAdmin(); } });

async function loadAdminUsers() {
  const body = $("#adminUsers");
  let users;
  try { users = await api("/api/admin/users"); }
  catch (err) { body.innerHTML = ""; $("#adminMsg").textContent = err.message; return; }

  $("#adminMsg").textContent = `${users.length} account${users.length === 1 ? "" : "s"}`;
  body.innerHTML = "";

  users.forEach((u) => {
    const isMe = u.id === currentUser.id; // không tự đổi role / tự xóa mình
    const tr = el("tr", isMe ? "me" : "");
    const cell = (text) => { const td = el("td"); td.textContent = text; return td; };

    const sel = el("select");
    ["user", "admin"].forEach((r) => {
      const o = el("option"); o.value = r; o.textContent = r; sel.append(o);
    });
    sel.value = u.role;
    sel.disabled = isMe;
    sel.onchange = async () => {
      try {
        await api(`/api/admin/users/${u.id}/role`, { method: "PATCH", body: { role: sel.value } });
        u.role = sel.value;
      } catch (err) { alert(err.message); sel.value = u.role; }
    };
    const tdRole = el("td"); tdRole.append(sel);

    const x = el("button", "mini"); x.textContent = "×"; x.title = "Delete user"; x.disabled = isMe;
    x.onclick = async () => {
      if (!confirm(`Xóa "${u.username}" cùng toàn bộ dữ liệu của họ?`)) return;
      try { await api(`/api/admin/users/${u.id}`, { method: "DELETE" }); loadAdminUsers(); }
      catch (err) { alert(err.message); }
    };
    const tdDel = el("td"); tdDel.append(x);

    tr.append(
      cell(u.username + (isMe ? " (you)" : "")),
      cell(u.email),
      tdRole,
      cell(u.sessions),
      cell(u.minutes),
      cell(new Date(u.created_at).toLocaleDateString()),
      tdDel
    );
    body.append(tr);
  });
}

/* ============ Sign in / Sign up ============ */
const authPage = $("#authModal");

function setMsg(sel, text, isError) {
  const m = $(sel);
  m.textContent = text;
  m.className = "auth-msg" + (isError ? " error" : "");
}

function openAuth(which = "login") {
  authPage.hidden = false;
  $(which === "login" ? "#loginForm" : "#registerForm").querySelector("input").focus();
}
function closeAuth() {
  authPage.hidden = true;
  setMsg("#loginMsg", "");
  setMsg("#registerMsg", "");
}

function updateAuthBar() {
  document.querySelector(".auth-bar").classList.toggle("signed-in", !!currentUser);
  $("#authLinks").hidden = !!currentUser;
  $("#userBar").hidden = !currentUser;
  $("#bgUploadLabel").hidden = !currentUser; // upload hình nền chỉ cho tài khoản đăng nhập
  if (!currentUser) return;

  const isAdmin = currentUser.role === "admin";
  $("#userBtn").textContent = currentUser.username;
  $("#roleBtn").textContent = currentUser.role;
  $("#roleBtn").disabled = !isAdmin; // chỉ admin bấm được: mở trang quản lý user
  $("#roleBtn").title = isAdmin ? "Manage users" : "";
}
function signOut() {
  clearToken();
  location.reload(); 
}

$("#authLogo").onclick = () => { if (!currentUser) openAuth("login"); };
$("#signInLink").onclick = () => openAuth("login");
$("#signUpLink").onclick = () => openAuth("register");
$("#signOutLink").onclick = signOut;
$("#authClose").onclick = closeAuth;
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !authPage.hidden) closeAuth(); });

$("#registerForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.email.value !== f.verifyEmail.value) return setMsg("#registerMsg", "Emails do not match.", true);
  if (f.password.value !== f.verifyPassword.value) return setMsg("#registerMsg", "Passwords do not match.", true);
  try {
    const d = await api("/api/auth/register", {
      method: "POST",
      body: { username: f.username.value, email: f.email.value, password: f.password.value },
    });
    setToken(d.token, true);
    location.reload();
  } catch (err) {
    setMsg("#registerMsg", err.message, true);
  }
};

$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const d = await api("/api/auth/login", {
      method: "POST",
      body: { login: f.login.value, password: f.password.value },
    });
    setToken(d.token, f.remember.checked);
    location.reload();
  } catch (err) {
    setMsg("#loginMsg", err.message, true);
  }
};


/* ============ Khởi động ============ */
async function boot() {
  if (getToken()) {
    try {
      currentUser = (await api("/api/auth/me")).user;
    } catch (err) {
      if (err.status === 401) clearToken(); // token hết hạn hoặc user đã bị xóa
    }
  }

  if (currentUser) {
    try {
      const s = await api("/api/settings");
      if (s) {
        const { background, ...rest } = s;
        settings = { ...DEFAULTS, ...rest };
        currentBg = background;
      }
      notes = await api("/api/notes");
    } catch {}
  }

  syncSettingsInputs();
  applySettings();
  stop(); remaining = total(); render();
  renderNotes();
  applyBg(currentBg);
  updateAuthBar();
  loadBgs();
}
boot();