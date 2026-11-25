import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "doi-chuoi-nay-khi-deploy";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const httpError = (message, status = 400) => Object.assign(new Error(message), { status });

/* ============ Xác thực ============ */
const makeToken = (u) => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: "30d" });

// Lấy user từ header "Authorization: Bearer <token>", luôn đọc lại role từ DB
async function userFromRequest(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  try {
    const { id } = jwt.verify(h.slice(7), JWT_SECRET);
    const [rows] = await pool.query("SELECT id, username, email, role, created_at FROM users WHERE id = ?", [id]);
    return rows[0] || null;
  } catch {
    return null;
  }
}
export const optionalAuth = async (req, res, next) => { req.user = await userFromRequest(req); next(); };
export const requireAuth = async (req, res, next) => {
  req.user = await userFromRequest(req);
  if (!req.user) return res.status(401).json({ error: "Chưa đăng nhập" });
  next();
};
export const requireAdmin = [
  requireAuth,
  (req, res, next) =>
    req.user.role === "admin" ? next() : res.status(403).json({ error: "Chỉ admin mới được phép" }),
];

const router = express.Router();

router.post("/api/auth/register", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (username.length < 3 || username.length > 30) throw httpError("Username phải từ 3 đến 30 ký tự");
  if (username.includes("@")) throw httpError("Username không được chứa ký tự @"); // để không nhầm với email
  if (!EMAIL_RE.test(email)) throw httpError("Email không hợp lệ");
  if (password.length < 6) throw httpError("Mật khẩu tối thiểu 6 ký tự");

  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users");
  const role = n === 0 ? "admin" : "user";
  const hash = await bcrypt.hash(password, 10);

  try {
    const [r] = await pool.query(
      "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [username, email, hash, role]
    );
    const user = { id: r.insertId, username, email, role };
    res.status(201).json({ token: makeToken(user), user });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      throw httpError(/username/i.test(e.sqlMessage) ? "Username đã tồn tại" : "Email đã được đăng ký", 409);
    }
    throw e;
  }
});

router.post("/api/auth/login", async (req, res) => {
  const login = String(req.body?.login ?? req.body?.email ?? "").trim();
  const password = String(req.body?.password || "");
  const [rows] = await pool.query(
    "SELECT * FROM users WHERE email = ? OR username = ? ORDER BY (email = ?) DESC LIMIT 1",
    [login.toLowerCase(), login, login.toLowerCase()]
  );
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    throw httpError("Sai tài khoản hoặc mật khẩu", 401);
  }
  const user = { id: u.id, username: u.username, email: u.email, role: u.role };
  res.json({ token: makeToken(user), user });
});

router.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));

export default router;