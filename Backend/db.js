import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const cfg = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: "322006",
};
const DB_NAME = (process.env.DB_NAME || "pomodoro").replace(/[^a-z0-9_]/gi, "");

export const pool = mysql.createPool({
  ...cfg,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user','admin') NOT NULL DEFAULT 'user',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS settings (
    user_id INT PRIMARY KEY,
    font VARCHAR(255) NOT NULL,
    bg_color VARCHAR(7) NOT NULL,
    accent VARCHAR(7) NOT NULL,
    text_color VARCHAR(7) NOT NULL,
    focus_min INT NOT NULL,
    short_min INT NOT NULL,
    long_min INT NOT NULL,
    bg_url VARCHAR(255) NULL,
    bg_type VARCHAR(10) NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    text TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS note_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    note_id INT NOT NULL,
    text VARCHAR(500) NOT NULL,
    done TINYINT(1) NOT NULL DEFAULT 0,
    position INT NOT NULL DEFAULT 0,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS backgrounds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    filename VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(10) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    minutes INT NOT NULL,
    completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function initDb() {
  for (let i = 1; ; i++) {
    try {
      const conn = await mysql.createConnection(cfg);
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4`);
      await conn.end();
      break;
    } catch (e) {
      if (i >= 15) throw e;
      console.log(`Đang chờ MySQL... (${i}/15)`);
      await sleep(2000);
    }
  }
  for (const sql of SCHEMA) await pool.query(sql);
  await seedAdmin();
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || !password) return;

  const [rows] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
  if (rows.length) {
    await pool.query("UPDATE users SET role = 'admin' WHERE id = ?", [rows[0].id]);
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
    [process.env.ADMIN_USERNAME || "admin", email, hash]
  );
  console.log("Đã tạo tài khoản admin:", email);
}