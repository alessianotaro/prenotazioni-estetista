const express = require("express");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const cfg = require("./config");

const db = new Database(process.env.DB_PATH || "prenotazioni.db");
db.exec(`CREATE TABLE IF NOT EXISTS bookings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, phone TEXT, date TEXT NOT NULL,
  start INTEGER NOT NULL, dur INTEGER NOT NULL, treat TEXT NOT NULL)`);

// Tabella per i blocchi / chiusure straordinarie
db.exec(`CREATE TABLE IF NOT EXISTS blocks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start INTEGER NOT NULL,
  dur INTEGER NOT NULL,
  reason TEXT)`);

const app = express();
app.use(express.json());
app.use(express.static("public"));

const tokens = new Set(); // sessioni admin in memoria

// Dati pubblici di configurazione
app.get("/api/config", (req, res) => res.json({
  treatments: cfg.treatments, open: cfg.open, close: cfg.close,
  step: cfg.step, closedDays: cfg.closedDays,
}));

// Intervalli occupati e blocchi di un giorno (unificati per il calendario pubblico)
app.get("/api/busy", (req, res) => {
  const date = String(req.query.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Data non valida" });
  
  const bookings = db.prepare("SELECT start, dur FROM bookings WHERE date=?").all(date);
  const blocks = db.prepare("SELECT start, dur FROM blocks WHERE date=?").all(date);
  
  // Restituisce sia le prenotazioni che i blocchi come intervalli occupati
  res.json([...bookings, ...blocks]);
});

// Nuova prenotazione (controllo sovrapposizioni con prenotazioni E blocchi dentro una transazione)
const insert = db.transaction((b) => {
  const clashBooking = db.prepare(
    "SELECT 1 FROM bookings WHERE date=? AND start < ? AND start + dur > ?"
  ).get(b.date, b.start + b.dur, b.start);

  const clashBlock = db.prepare(
    "SELECT 1 FROM blocks WHERE date=? AND start < ? AND start + dur > ?"
  ).get(b.date, b.start + b.dur, b.start);

  if (clashBooking || clashBlock) return false;

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
  
  const dayOfWeek = day.getDay(); // 0=Dom, 1=Lun, 2=Mar, 3=Mer, 4=Gio, 5=Ven, 6=Sab
  if (cfg.closedDays.includes(dayOfWeek)) return res.status(400).json({ error: "Giorno di chiusura" });

  // Regola orari specifici per i giorni della settimana
  let dayOpen = cfg.open;
  let dayClose = cfg.close;

  if ([1, 3, 5].includes(dayOfWeek)) {
    dayOpen = 14 * 60; // Dalle 14:00 per Lun, Mer, Ven
  } else if ([2, 4].includes(dayOfWeek)) {
    dayOpen = 8 * 60;  // Dalle 08:00 per Mar, Gio
  } else {
    return res.status(400).json({ error: "Giorno di chiusura" });
  }

  if (!Number.isInteger(start) || start < dayOpen || start + t.minutes > dayClose || (start - dayOpen) % cfg.step)
    return res.status(400).json({ error: "Orario non valido per questo giorno" });
  
  const ok = insert({ name: name.trim().slice(0, 80), phone: String(phone || "").slice(0, 30), date, start, dur: t.minutes, treat: t.name });
  if (!ok) return res.status(409).json({ error: "Orario appena occupato o bloccato, scegline un altro" });
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
  const bookings = db.prepare("SELECT * FROM bookings WHERE date >= ? ORDER BY date, start").all(today);
  const blocks = db.prepare("SELECT * FROM blocks WHERE date >= ? ORDER BY date, start").all(today);
  res.json({ bookings, blocks });
});

app.delete("/api/admin/bookings/:id", auth, (req, res) => {
  db.prepare("DELETE FROM bookings WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Rotte per gestire i blocchi orari dall'admin
app.post("/api/admin/blocks", auth, (req, res) => {
  const { date, start, dur, reason } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isInteger(start) || !Number.isInteger(dur)) {
    return res.status(400).json({ error: "Dati blocco non validi" });
  }
  db.prepare("INSERT INTO blocks(date, start, dur, reason) VALUES(?,?,?,?)")
    .run(date, start, dur, String(reason || "Imprevisto").slice(0, 100));
  res.json({ ok: true });
});

app.delete("/api/admin/blocks/:id", auth, (req, res) => {
  db.prepare("DELETE FROM blocks WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.listen(cfg.port, () => console.log(`Server attivo su http://localhost:${cfg.port}`));