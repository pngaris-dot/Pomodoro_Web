import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.join(__dirname, "uploads");                     
const PRESETS = process.env.PRESETS_DIR || path.join(__dirname, "..", "Frontend", "Backgrounds");
const app = express();
app.use(cors());

fs.rmSync(UPLOADS, { recursive: true, force: true });
fs.mkdirSync(UPLOADS, { recursive: true });

app.use("/uploads", express.static(UPLOADS));
app.use("/presets", express.static(PRESETS));

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"];
const MEDIA_RE = /\.(jpe?g|png|webp|gif|mp4|webm)$/i;

const validSid = (s) => typeof s === "string" && /^[a-z0-9]{4,40}$/i.test(s);
const typeOf = (name) => (/\.(mp4|webm)$/i.test(name) ? "video" : "image");

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => {
      if (!validSid(req.query.sid)) return cb(new Error("Thiếu mã phiên (sid)"));
      cb(null, `${req.query.sid}__${Date.now()}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // tối đa 200MB
  fileFilter: (req, file, cb) => cb(null, ALLOWED.includes(file.mimetype)),
});

app.get("/api/presets", (req, res) => {
  if (!fs.existsSync(PRESETS)) return res.json([]);
  const files = fs.readdirSync(PRESETS)
    .filter((name) => MEDIA_RE.test(name))
    .map((name) => ({
      name,
      url: `/presets/${encodeURIComponent(name)}`,
      type: typeOf(name),
      preset: true,
    }));
  res.json(files);
});

app.get("/api/backgrounds", (req, res) => {
  const sid = req.query.sid;
  if (!validSid(sid)) return res.json([]);
  const files = fs.readdirSync(UPLOADS)
    .filter((name) => name.startsWith(sid + "__"))
    .map((name) => ({ name, url: `/uploads/${name}`, type: typeOf(name) }));
  res.json(files);
});

app.post("/api/backgrounds", upload.single("file"), (req, res) => {
  if (!req.file)
    return res.status(400).json({
      error: "File không hợp lệ (ảnh JPG/PNG/WEBP/GIF hoặc video MP4/WEBM, tối đa 200MB)",
    });
  res.status(201).json({
    name: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    type: typeOf(req.file.filename),
  });
});

app.delete("/api/backgrounds/:name", (req, res) => {
  const name = path.basename(req.params.name);
  if (validSid(req.query.sid) && name.startsWith(req.query.sid + "__")) {
    try { fs.rmSync(path.join(UPLOADS, name), { force: true }); } catch {}
  }
  res.status(204).end();
});

app.use((err, req, res, next) => res.status(400).json({ error: err.message }));

app.listen(5000, () => console.log("Server is running on port 5000"));