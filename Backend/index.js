import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { initDb } from "./db.js";
import authRouter from "./auth.js";
import router, { UPLOADS, PRESETS } from "./routes.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

fs.mkdirSync(UPLOADS, { recursive: true });

app.use("/uploads", express.static(UPLOADS));
app.use("/presets", express.static(PRESETS));

app.use(authRouter); 
app.use(router);     

await initDb();
app.listen(5000, () => console.log("Server is running on port 5000"));