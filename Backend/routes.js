import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";
import { optionalAuth, requireAuth, requireAdmin, httpError } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS = process.env.UPLOADS_DIR || path.join(__dirname, "uploads");
export const PRESETS = process.env.PRESETS_DIR || path.join(__dirname, "..", "Frontend", "Backgrounds");

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"];
const MEDIA_RE = /\.(jpe?g|png|webp|gif|mp4|webm)$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const typeOf = (name) => (/\.(mp4|webm)$/i.test(name) ? "video" : "image");

const router = express.Router();

/* ============ Cài đặt theo tài khoản ============ */
const D = { font: "ui-monospace, 'Source Code Pro', Consolas, monospace", bg: "#9e4545", accent: "#ff6b5e", text: "#ffffff", focus: 25, short: 5, long: 15 };
const mins = (v, d) => (Number.isInteger(v) && v >= 1 && v <= 180 ? v : d);

router.get("/api/settings", requireAuth, async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM settings WHERE user_id = ?", [req.user.id]);
  const s = rows[0];
  if (!s) return res.json(null); // chưa lưu bao giờ -> frontend dùng mặc định
  res.json({
    font: s.font,
    bg: s.bg_color,
    accent: s.accent,
    text: s.text_color,
    focus: s.focus_min,
    short: s.short_min,
    long: s.long_min,
    background: s.bg_url ? { url: s.bg_url, type: s.bg_type } : null,
  });
});

router.put("/api/settings", requireAuth, async (req, res) => {
  const b = req.body || {};
  const s = {
    font: typeof b.font === "string" && b.font.length <= 255 ? b.font : D.font,
    bg: HEX_RE.test(b.bg) ? b.bg : D.bg,
    accent: HEX_RE.test(b.accent) ? b.accent : D.accent,
    text: HEX_RE.test(b.text) ? b.text : D.text,
    focus: mins(b.focus, D.focus),
    short: mins(b.short, D.short),
    long: mins(b.long, D.long),
  };
  const bgUrl = typeof b.background?.url === "string" ? b.background.url.slice(0, 255) : null;
  const bgType = bgUrl ? (b.background.type === "video" ? "video" : "image") : null;

  await pool.query(
    `INSERT INTO settings (user_id, font, bg_color, accent, text_color, focus_min, short_min, long_min, bg_url, bg_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE font = VALUES(font), bg_color = VALUES(bg_color), accent = VALUES(accent),
       text_color = VALUES(text_color), focus_min = VALUES(focus_min), short_min = VALUES(short_min),
       long_min = VALUES(long_min), bg_url = VALUES(bg_url), bg_type = VALUES(bg_type)`,
    [req.user.id, s.font, s.bg, s.accent, s.text, s.focus, s.short, s.long, bgUrl, bgType]
  );
  res.status(204).end();
});

/* ============ Ghi chú theo tài khoản ============ */
router.get("/api/notes", requireAuth, async (req, res) => {
  const [notes] = await pool.query(
    "SELECT id, text FROM notes WHERE user_id = ? ORDER BY position", [req.user.id]
  );
  if (!notes.length) return res.json([]);
  const [items] = await pool.query(
    "SELECT id, note_id, text, done FROM note_items WHERE note_id IN (?) ORDER BY position",
    [notes.map((n) => n.id)]
  );
  res.json(
    notes.map((n) => ({
      id: String(n.id),
      text: n.text,
      items: items
        .filter((i) => i.note_id === n.id)
        .map((i) => ({ id: String(i.id), text: i.text, done: !!i.done })),
    }))
  );
});

router.put("/api/notes", requireAuth, async (req, res) => {
  if (!Array.isArray(req.body)) throw httpError("Dữ liệu ghi chú không hợp lệ");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM notes WHERE user_id = ?", [req.user.id]); // note_items tự xóa theo (CASCADE)
    for (let i = 0; i < req.body.length; i++) {
      const n = req.body[i];
      const [r] = await conn.query(
        "INSERT INTO notes (user_id, text, position) VALUES (?, ?, ?)",
        [req.user.id, String(n.text || ""), i]
      );
      const items = Array.isArray(n.items) ? n.items : [];
      for (let j = 0; j < items.length; j++) {
        await conn.query(
          "INSERT INTO note_items (note_id, text, done, position) VALUES (?, ?, ?, ?)",
          [r.insertId, String(items[j].text || "").slice(0, 500), items[j].done ? 1 : 0, j]
        );
      }
    }
    await conn.commit();
    res.status(204).end();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

/* ============ Thống kê Pomodoro ============ */
async function statsOf(userId) {
  const [[r]] = await pool.query(
    "SELECT COUNT(*) AS sessions, COALESCE(SUM(minutes), 0) AS minutes FROM pomodoro_sessions WHERE user_id = ?",
    [userId]
  );
  return { sessions: Number(r.sessions), minutes: Number(r.minutes) };
}

router.post("/api/sessions", requireAuth, async (req, res) => {
  const minutes = Number(req.body?.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) throw httpError("Số phút không hợp lệ");
  await pool.query("INSERT INTO pomodoro_sessions (user_id, minutes) VALUES (?, ?)", [req.user.id, minutes]);
  res.status(201).json(await statsOf(req.user.id));
});

router.get("/api/stats", requireAuth, async (req, res) => {
  res.json(await statsOf(req.user.id));
});

/* ============ Hình nền ============ */
const fileFilter = (req, file, cb) => cb(null, ALLOWED.includes(file.mimetype));
const LIMITS = { fileSize: 200 * 1024 * 1024 }; // tối đa 200MB

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `u${req.user.id}__${Date.now()}${ext}`);
    },
  }),
  limits: LIMITS,
  fileFilter,
});

// Hình có sẵn (thư mục Frontend/Backgrounds): ai cũng xem được
router.get("/api/presets", (req, res) => {
  if (!fs.existsSync(PRESETS)) return res.json([]);
  const files = fs.readdirSync(PRESETS)
    .filter((name) => MEDIA_RE.test(name))
    .map((name) => ({ name, url: `/presets/${encodeURIComponent(name)}`, type: typeOf(name), preset: true }));
  res.json(files);
});

router.get("/api/backgrounds", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT filename, type FROM backgrounds WHERE user_id = ? ORDER BY id", [req.user.id]
  );
  res.json(rows.map((r) => ({ name: r.filename, url: `/uploads/${r.filename}`, type: r.type })));
});

router.post("/api/backgrounds", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) {
    throw httpError("File không hợp lệ (ảnh JPG/PNG/WEBP/GIF hoặc video MP4/WEBM, tối đa 200MB)");
  }
  const type = typeOf(req.file.filename);
  await pool.query(
    "INSERT INTO backgrounds (user_id, filename, type) VALUES (?, ?, ?)",
    [req.user.id, req.file.filename, type]
  );
  res.status(201).json({ name: req.file.filename, url: `/uploads/${req.file.filename}`, type });
});

router.delete("/api/backgrounds/:name", requireAuth, async (req, res) => {
  const name = path.basename(req.params.name);
  const [r] = await pool.query(
    "DELETE FROM backgrounds WHERE filename = ? AND user_id = ?", [name, req.user.id]
  );
  if (r.affectedRows) fs.rmSync(path.join(UPLOADS, name), { force: true });
  res.status(204).end();
});

/* ============ Admin ============ */
router.get("/api/admin/users", ...requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.email, u.role, u.created_at,
            COUNT(s.id) AS sessions, COALESCE(SUM(s.minutes), 0) AS minutes
     FROM users u LEFT JOIN pomodoro_sessions s ON s.user_id = u.id
     GROUP BY u.id, u.username, u.email, u.role, u.created_at
     ORDER BY u.id`
  );
  res.json(rows.map((r) => ({ ...r, sessions: Number(r.sessions), minutes: Number(r.minutes) })));
});

router.patch("/api/admin/users/:id/role", ...requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const role = req.body?.role;
  if (!["user", "admin"].includes(role)) throw httpError("Role phải là user hoặc admin");
  if (id === req.user.id) throw httpError("Không thể tự đổi role của chính mình");
  const [r] = await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, id]);
  if (!r.affectedRows) throw httpError("Không tìm thấy user", 404);
  res.status(204).end();
});

router.delete("/api/admin/users/:id", ...requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw httpError("Không thể tự xóa chính mình");
  const [files] = await pool.query("SELECT filename FROM backgrounds WHERE user_id = ?", [id]);
  const [r] = await pool.query("DELETE FROM users WHERE id = ?", [id]); // settings/notes/backgrounds tự xóa (CASCADE)
  if (!r.affectedRows) throw httpError("Không tìm thấy user", 404);
  for (const f of files) fs.rmSync(path.join(UPLOADS, path.basename(f.filename)), { force: true });
  res.status(204).end();
});

const presetUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync(PRESETS, { recursive: true }); cb(null, PRESETS); },
    filename: (req, file, cb) => cb(null, path.basename(file.originalname).replace(/[^\w.\-]+/g, "_")),
  }),
  limits: LIMITS,
  fileFilter,
});

router.post("/api/admin/presets", ...requireAdmin, presetUpload.single("file"), (req, res) => {
  if (!req.file) throw httpError("File không hợp lệ (ảnh JPG/PNG/WEBP/GIF hoặc video MP4/WEBM, tối đa 200MB)");
  const name = req.file.filename;
  res.status(201).json({ name, url: `/presets/${encodeURIComponent(name)}`, type: typeOf(name), preset: true });
});

router.delete("/api/admin/presets/:name", ...requireAdmin, (req, res) => {
  const name = path.basename(req.params.name);
  if (MEDIA_RE.test(name)) fs.rmSync(path.join(PRESETS, name), { force: true });
  res.status(204).end();
});

export default router;