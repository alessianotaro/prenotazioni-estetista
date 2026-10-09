const express = require("express");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const cfg = require("./config");

const db = new Database(process.env.DB_PATH || "prenotazioni.db");
db.exec(`CREATE TABLE IF NOT EXISTS bookings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, phone TEXT, date TEXT NOT NULL,
  start INTEGER NOT NULL, dur INTEGER NOT NULL, treat TEXT NOT NULL)`);

const app = express();
app.use(express.json());
app.use(express.static("public"));

const tokens = new Set(); // sessioni admin in memoria

// Dati pubblici di configurazione
app.get("/api/config", (req, res) => res.json({
  treatments: cfg.treatments, open: cfg.open, close: cfg.close,
  step: cfg.step, closedDays: cfg.closedDays,
}));

// Intervalli occupati di un giorno (senza dati personali)
app.get("/api/busy", (req, res) => {
  const date = String(req.query.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Data non valida" });
  res.json(db.prepare("SELECT start, dur FROM bookings WHERE date=?").all(date));
});

// Nuova prenotazione (controllo sovrapposizioni dentro una transazione)
const insert = db.transaction((b) => {
  const clash = db.prepare(
    "SELECT 1 FROM bookings WHERE date=? AND start < ? AND start + dur > ?"
  ).get(b.date, b.start + b.dur, b.start);
  if (clash) return false;
  db.prepare("INSERT INTO bookings(name,phone,date,start,dur,treat) VALUES(?,?,?,?,?,?)")
    .run(b.name, b.phone, b.date, b.start, b.dur, b.treat);
  return true;
});

app.post("/api/book", (req, res) => {
  const { name, phone, date, start, treatment } = req.body || {};
  const t = cfg.treatments[treatment];
  const day = new Date(date + "T12:00");
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || isNaN(day)) return res.status(400).json({ error: "Dati non validi" });
  if (!name || name.trim().split(/\s+/).length < 2) return res.status(400).json({ error: "Inserisci nome e cognome" });
  if (cfg.closedDays.includes(day.getDay())) return res.status(400).json({ error: "Giorno di chiusura" });
  if (!Number.isInteger(start) || start < cfg.open || start + t.minutes > cfg.close || (start - cfg.open) % cfg.step)
    return res.status(400).json({ error: "Orario non valido" });
  const ok = insert({ name: name.trim().slice(0, 80), phone: String(phone || "").slice(0, 30), date, start, dur: t.minutes, treat: t.name });
  if (!ok) return res.status(409).json({ error: "Orario appena occupato, scegline un altro" });
  res.json({ ok: true });
});

// ---- Area estetista ----
const auth = (req, res, next) => {
  const tk = (req.headers.authorization || "").replace("Bearer ", "");
  if (!tokens.has(tk)) return res.status(401).json({ error: "Non autorizzato" });
  next();
};

app.post("/api/admin/login", (req, res) => {
  const a = Buffer.from(String((req.body || {}).password || ""));
  const b = Buffer.from(cfg.adminPassword);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Password errata" });
  const tk = crypto.randomBytes(24).toString("hex");
  tokens.add(tk);
  res.json({ token: tk });
});

app.get("/api/admin/bookings", auth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.json(db.prepare("SELECT * FROM bookings WHERE date >= ? ORDER BY date, start").all(today));
});

app.delete("/api/admin/bookings/:id", auth, (req, res) => {
  db.prepare("DELETE FROM bookings WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.listen(cfg.port, () => console.log(`Server attivo su http://localhost:${cfg.port}`));