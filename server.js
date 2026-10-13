const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@libsql/client");

const cfg = require("./config");

// Connessione al Database Turso Cloud
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "libsql://prenotazioni-alessianotaro.aws-eu-west-1.turso.io",
  authToken: process.env.TURSO_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE4ODM4OTQsImlkIjoiMDFhMTM0OTktODIwMS03OGE1LTgxMmItNjA3MDlmMTk2Yzc2Iiwia2lkIjoiN0YyTVItbnlsZ1g0WWRWQmNYQndzSTktczJGcHhma09CQmd2RmNSTjI3ZyIsInJpZCI6IjM4MjgzNDEyLTE1NDAtNDIyNC1hM2E1LTkwY2M3YTc3NzYyOSJ9.vwg4OHXaiWRO8bwX3_d4bhSfT_byaDviB_a7FyMQ75zPJ4VhvetXuc2-Or_tR5ttFWwuKCmO_DaZgerJYK1LDw"
});

const app = express();
app.use(express.json());
app.use(express.static("public"));

const tokens = new Set(); // Sessioni admin in memoria

// Inizializzazione asincrona delle tabelle su Turso
async function initDB() {
  await db.execute(`CREATE TABLE IF NOT EXISTS bookings(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, phone TEXT, date TEXT NOT NULL,
    start INTEGER NOT NULL, dur INTEGER NOT NULL, treat TEXT NOT NULL)`);

  await db.execute(`CREATE TABLE IF NOT EXISTS blocks(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    start INTEGER NOT NULL,
    dur INTEGER NOT NULL,
    reason TEXT)`);
  console.log("[DB Turso] Tabelle verificate e pronte!");
}
initDB();

// Dati pubblici di configurazione
app.get("/api/config", (req, res) => res.json({
  treatments: cfg.treatments, open: cfg.open, close: cfg.close,
  step: cfg.step, closedDays: cfg.closedDays,
}));

// Intervalli occupati e blocchi di un giorno
app.get("/api/busy", async (req, res) => {
  try {
    const date = String(req.query.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Data non valida" });
    
    const bookingsRes = await db.execute({ sql: "SELECT start, dur FROM bookings WHERE date=?", args: [date] });
    const blocksRes = await db.execute({ sql: "SELECT start, dur FROM blocks WHERE date=?", args: [date] });
    
    res.json([...bookingsRes.rows, ...blocksRes.rows]);
  } catch (err) {
    res.status(500).json({ error: "Errore durante il recupero degli orari occupati" });
  }
});

// Nuova prenotazione
app.post("/api/book", async (req, res) => {
  try {
    const { name, phone, date, start, treatment } = req.body || {};
    const t = cfg.treatments[treatment];
    const day = new Date(date + "T12:00");
    
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || isNaN(day)) return res.status(400).json({ error: "Dati non validi" });
    if (!name || name.trim().split(/\s+/).length < 2) return res.status(400).json({ error: "Inserisci nome e cognome" });
    
    const dayOfWeek = day.getDay();
    if (cfg.closedDays.includes(dayOfWeek)) return res.status(400).json({ error: "Giorno di chiusura" });

    let dayOpen = cfg.open;
    let dayClose = cfg.close;

    if ([1, 3, 5].includes(dayOfWeek)) {
      dayOpen = 14 * 60; // 14:00 per Lun, Mer, Ven
    } else if ([2, 4].includes(dayOfWeek)) {
      dayOpen = 8 * 60;  // 08:00 per Mar, Gio
    } else {
      return res.status(400).json({ error: "Giorno di chiusura" });
    }

    if (!Number.isInteger(start) || start < dayOpen || start + t.minutes > dayClose || (start - dayOpen) % cfg.step)
      return res.status(400).json({ error: "Orario non valido per questo giorno" });
    
    // Controllo sovrapposizioni con prenotazioni o blocchi
    const clashBooking = await db.execute({
      sql: "SELECT 1 FROM bookings WHERE date=? AND start < ? AND start + dur > ?",
      args: [date, start + t.minutes, start]
    });

    const clashBlock = await db.execute({
      sql: "SELECT 1 FROM blocks WHERE date=? AND start < ? AND start + dur > ?",
      args: [date, start + t.minutes, start]
    });

    if (clashBooking.rows.length > 0 || clashBlock.rows.length > 0) {
      return res.status(409).json({ error: "Orario appena occupato o bloccato, scegline un altro" });
    }

    await db.execute({
      sql: "INSERT INTO bookings(name,phone,date,start,dur,treat) VALUES(?,?,?,?,?,?)",
      args: [name.trim().slice(0, 80), String(phone || "").slice(0, 30), date, start, t.minutes, t.name]
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Errore durante la prenotazione" });
  }
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

app.get("/api/admin/bookings", auth, async (req, res) => {
  try {
    const bookingsRes = await db.execute("SELECT * FROM bookings ORDER BY date, start");
    const blocksRes = await db.execute("SELECT * FROM blocks ORDER BY date, start");
    res.json({ bookings: bookingsRes.rows, blocks: blocksRes.rows });
  } catch (err) {
    res.status(500).json({ error: "Errore nel caricamento dell'agenda" });
  }
});

app.delete("/api/admin/bookings/:id", auth, async (req, res) => {
  try {
    await db.execute({ sql: "DELETE FROM bookings WHERE id=?", args: [req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Errore durante la cancellazione" });
  }
});

app.post("/api/admin/blocks", auth, async (req, res) => {
  try {
    const { date, start, dur, reason } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isInteger(start) || !Number.isInteger(dur)) {
      return res.status(400).json({ error: "Dati blocco non validi" });
    }
    await db.execute({
      sql: "INSERT INTO blocks(date, start, dur, reason) VALUES(?,?,?,?)",
      args: [date, start, dur, String(reason || "Imprevisto").slice(0, 100)]
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Errore durante il blocco" });
  }
});

app.delete("/api/admin/blocks/:id", auth, async (req, res) => {
  try {
    await db.execute({ sql: "DELETE FROM blocks WHERE id=?", args: [req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Errore durante la rimozione del blocco" });
  }
});

app.listen(cfg.port, () => console.log(`Server attivo su http://localhost:${cfg.port}`));