const API = "http://localhost:5000"; // địa chỉ backend, phải khớp app.listen(5000)

const $ = (s) => document.querySelector(s);
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const load = (k, d) => { try { return JSON.parse(sessionStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => sessionStorage.setItem(k, JSON.stringify(v));

/* ============ Settings ============ */
const DEFAULTS = { font: "sans-serif", bg: "#9e4545", accent: "#ff6b5e", text: "#ffffff", focus: 25, short: 5, long: 15 };
let settings = { ...DEFAULTS, ...load("settings", {}) };

function applySettings() {
  const r = document.documentElement.style;
  r.setProperty("--bg", settings.bg);
  r.setProperty("--accent", settings.accent);
  r.setProperty("--text", settings.text);
  r.setProperty("--font", settings.font);
}

[["#font", "font"], ["#bgColor", "bg"], ["#accentColor", "accent"], ["#textColor", "text"]].forEach(([id, key]) => {
  const input = $(id);
  input.value = settings[key];
  input.addEventListener("input", () => {
    settings[key] = input.value;
    save("settings", settings);
    applySettings();
  });
});

[["#focusMin", "focus"], ["#shortMin", "short"], ["#longMin", "long"]].forEach(([id, key]) => {
  const input = $(id);
  input.value = settings[key];
  input.addEventListener("change", () => {
    const v = Number(input.value);
    if (!Number.isInteger(v) || v < 1 || v > 180) { input.value = settings[key]; return; } // sai -> trả về số cũ
    settings[key] = v;
    save("settings", settings);

    if (mode === key) {
      stop();
      remaining = total();
      render();
    }
  });
});
applySettings();

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
    if (remaining === 0) { stop(); alert("Hết giờ!"); }
  }, 250);
}
function setMode(m) {
  mode = m; stop(); remaining = total(); render();
  document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
}
document.querySelectorAll(".mode").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$("#start").onclick = start;
$("#reset").onclick = () => { stop(); remaining = total(); render(); };
render();

/* ============ Ghi chú ============ */
let notes = load("notes", []);
const saveNotes = () => save("notes", notes);

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
renderNotes();

/* ============ Hình nền ============ */
const video = $("#bgVideo");
let currentBg = load("bg", null); // { url, type }
let presets = []; 
let bgList = []; 

let sid = load("sid", null);
if (!sid) { sid = uid(); save("sid", sid); }

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
  currentBg = bg; save("bg", bg); applyBg(bg); renderBgGrid();
}

async function loadBgs() {
  let ok = true;
  try { presets = await (await fetch(`${API}/api/presets`)).json(); } catch { presets = []; ok = false; }
  try { bgList = await (await fetch(`${API}/api/backgrounds?sid=${sid}`)).json(); } catch { bgList = []; ok = false; }

  if (ok && currentBg && ![...presets, ...bgList].some((b) => b.url === currentBg.url)) {
    currentBg = null; save("bg", null); applyBg(null);
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

  if (onDelete) { // chỉ hình upload mới có nút xóa
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

  presets.forEach((b) => g.append(makeTile(b)));

  bgList.forEach((b) =>
    g.append(
      makeTile(b, async () => {
        await fetch(`${API}/api/backgrounds/${b.name}?sid=${sid}`, { method: "DELETE" });
        if (currentBg?.url === b.url) chooseBg(null);
        loadBgs();
      })
    )
  );
}

$("#bgFile").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append("file", f);
  try {
    const res = await fetch(`${API}/api/backgrounds?sid=${sid}`, { method: "POST", body: fd });
    const d = await res.json();
    if (res.ok) chooseBg({ url: d.url, type: d.type });
  } catch {}
  e.target.value = "";
  loadBgs();
};

applyBg(currentBg);
loadBgs();

document.querySelectorAll("details").forEach((d, i) => {
  const key = "open-" + (d.className || i);
  d.open = load(key, d.open);
  d.addEventListener("toggle", () => save(key, d.open));
});