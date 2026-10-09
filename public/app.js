let cfg, mon = new Date(), sel = null, start = null, tr = null, busy = [], done = null, err = "";
mon.setDate(1);
const $ = document.getElementById("app");
const pad = n => String(n).padStart(2, "0"), hm = m => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const ds = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const it = d => new Date(d + "T12:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
const free = (t, dur) => !busy.some(b => b.start < t + dur && b.start + b.dur > t);

function slots() {
  const dur = tr !== null ? cfg.treatments[tr].minutes : cfg.step, now = new Date(), today = ds(now) === sel, r = [];
  
  // Calcolo del giorno della settimana per gli orari specifici
  const dayOfWeek = new Date(sel + "T12:00").getDay();
  let openTime = cfg.open;
  if ([1, 3, 5].includes(dayOfWeek)) {
    openTime = 14 * 60; // Lun, Mer, Ven solo pomeriggio dalle 14:00
  }

  for (let t = openTime; t + dur <= cfg.close; t += cfg.step) {
    const past = today && t <= now.getHours() * 60 + now.getMinutes();
    r.push([t, !past && free(t, dur)]);
  }
  return r;
}

function render() {
  if (done) {
    $.innerHTML = `<h1>Prenotazione confermata ✨</h1><div class="c ok"><p><b>${done.name}</b>, ti aspettiamo</p><p>${it(done.date)}<br>ore ${hm(done.start)} · ${done.treat}</p><button onclick="done=null;render()">Nuova prenotazione</button></div>`;
    return;
  }
  const y = mon.getFullYear(), mo = mon.getMonth(), first = (new Date(y, mo, 1).getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate(), td = ds(new Date());
  let cal = ""; ["L", "M", "M", "G", "V", "S", "D"].forEach(x => cal += `<span>${x}</span>`);
  for (let i = 0; i < first; i++) cal += "<i></i>";
  for (let d = 1; d <= dim; d++) {
    const k = y + "-" + pad(mo + 1) + "-" + pad(d), w = new Date(y, mo, d).getDay();
    cal += `<button class="${k === sel ? "on" : ""}" ${k < td || cfg.closedDays.includes(w) ? "disabled" : ""} onclick="pick('${k}')">${d}</button>`;
  }
  let h = `<h1>Prenota il tuo appuntamento</h1><p class="s">Scegli giorno, trattamento e orario</p>
  <div class="c"><div class="h"><button onclick="mv(-1)">‹</button><b>${mon.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</b><button onclick="mv(1)">›</button></div><div class="g">${cal}</div></div>`;
  if (sel) {
    h += `<div class="c"><b>${it(sel)}</b><p class="m">1. Trattamento</p>`;
    cfg.treatments.forEach((x, i) => h += `<button class="o ${tr === i ? "on" : ""}" onclick="tr=${i};start=null;render()">${x.name} · ${x.minutes} min</button>`);
    if (tr !== null) {
      h += `<p class="m">2. Orario</p><div class="t">`; let any = false;
      slots().forEach(([t, ok]) => { if (ok) any = true; h += `<button class="${start === t ? "on" : ""}" ${ok ? "" : "disabled"} onclick="start=${t};render()">${hm(t)}</button>` });
      h += `</div>${any ? "" : '<p class="m">Nessun orario disponibile, prova un altro giorno.</p>'}`;
    }
    if (start !== null) h += `<p class="m">3. I tuoi dati</p><input id="nm" placeholder="Nome e cognome"><input id="ph" placeholder="Telefono (facoltativo)" type="tel"><p class="e">${err}</p><button class="p" id="go" onclick="book()">Conferma ${hm(start)} – ${hm(start + cfg.treatments[tr].minutes)}</button>`;
    h += "</div>";
  }
  h += `<p style="text-align:center"><a class="l" href="admin.html">Area estetista</a></p>`;
  const a = document.activeElement && document.activeElement.id, v = a ? document.activeElement.value : "";
  $.innerHTML = h;
  if (a) { const e = document.getElementById(a); if (e) { e.value = v; e.focus() } }
}

function mv(n) { mon.setMonth(mon.getMonth() + n); render(); }
async function load() { busy = await (await fetch("/api/busy?date=" + sel)).json(); }
async function pick(k) { sel = k; start = null; await load(); render(); }
async function book() {
  const name = document.getElementById("nm").value, phone = document.getElementById("ph").value;
  document.getElementById("go").disabled = true;
  const r = await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone, date: sel, start, treatment: tr }) });
  const j = await r.json();
  if (r.ok) { done = { name: name.trim(), date: sel, start, treat: cfg.treatments[tr].name }; err = ""; }
  else { err = j.error; if (r.status === 409) { start = null; await load(); } }
  render();
}

fetch("/api/config").then(r => r.json()).then(c => { cfg = c; render(); });