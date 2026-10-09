const $ = document.getElementById("app");
const pad = n => String(n).padStart(2, "0"), hm = m => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const it = d => new Date(d + "T12:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
const tok = () => sessionStorage.getItem("tk");

function loginView(err = "") {
  $.innerHTML = `<h1>Area estetista</h1><div class="c"><input id="pw" type="password" placeholder="Password"><p class="e">${err}</p><button onclick="login()">Entra</button></div><a href="/">← Torna alla prenotazione</a>`;
}

async function login() {
  const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: document.getElementById("pw").value }) });
  const j = await r.json();
  if (r.ok) { sessionStorage.setItem("tk", j.token); agenda(); } else loginView(j.error);
}

async function agenda() {
  const r = await fetch("/api/admin/bookings", { headers: { Authorization: "Bearer " + tok() } });
  if (r.status === 401) { sessionStorage.removeItem("tk"); return loginView(); }
  const data = await r.json();
  const bookings = data.bookings || [];
  const blocks = data.blocks || [];

  let h = `<h1>Agenda</h1>
  <div class="c">
    <b>Blocca orario / Chiusura</b>
    <input type="date" id="b-date">
    <div style="display:flex;gap:8px">
      <input type="time" id="b-start" value="09:00">
      <input type="time" id="b-end" value="13:00">
    </div>
    <input type="text" id="b-reason" placeholder="Motivo (es. Visita, Chiusura straordinaria)">
    <button onclick="addBlock()">Blocca fascia oraria</button>
  </div>`;

  const items = [
    ...bookings.map(b => ({ ...b, type: 'booking' })),
    ...blocks.map(b => ({ ...b, type: 'block', name: b.reason || 'Chiusura', phone: '', treat: 'Orario bloccato' }))
  ].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);

  let cur = "";
  items.forEach(item => {
    if (item.date !== cur) {
      if (cur !== "") h += "</div>";
      cur = item.date;
      h += `<div class="c"><b>${it(item.date)}</b>`;
    }
    if (item.type === 'booking') {
      // Creazione del link WhatsApp precompilato (pulisce il numero rimuovendo spazi/trattini)
      const cleanPhone = (item.phone || "").replace(/\D/g, "");
      const waMsg = encodeURIComponent(`Ciao ${item.name}, ti ricordo il tuo appuntamento per ${item.treat} il giorno ${it(item.date)} alle ore ${hm(item.start)}. A presto! ✨`);
      const waLink = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('3') && cleanPhone.length === 10 ? '39' + cleanPhone : cleanPhone}?text=${waMsg}` : '';

      h += `<div class="r">
        <b>${hm(item.start)}–${hm(item.start + item.dur)}</b> · ${esc(item.name)}<br>
        <span class="m">${esc(item.treat)}${item.phone ? " · " + esc(item.phone) : ""}</span><br>
        <div style="margin-top:4px;display:flex;gap:8px;align-items:center;">
          ${waLink ? `<a href="${waLink}" target="_blank" style="background:#25d366;color:#fff;padding:4px 8px;border-radius:6px;text-decoration:none;font-size:12px">💬 WhatsApp</a>` : ''}
          <a onclick="delBooking(${item.id})" style="color:#c0392b;">annulla</a>
        </div>
      </div>`;
    } else {
      h += `<div class="r block-box"><b>${hm(item.start)}–${hm(item.start + item.dur)}</b> · 🔒 <i>${esc(item.name)}</i><br><span class="m">Fascia bloccata</span> <a onclick="delBlock(${item.id})">rimuovi blocco</a></div>`;
    }
  });

  $.innerHTML = h + (items.length ? "</div>" : '<p class="m">Nessun impegno in programma.</p>') + `<a onclick="sessionStorage.removeItem('tk');loginView()">Esci</a>`;
}

async function addBlock() {
  const date = document.getElementById("b-date").value;
  const startStr = document.getElementById("b-start").value;
  const endStr = document.getElementById("b-end").value;
  const reason = document.getElementById("b-reason").value;

  if (!date || !startStr || !endStr) {
    alert("Inserisci data e orari validi");
    return;
  }

  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const dur = end - start;

  if (dur <= 0) {
    alert("L'orario di fine deve essere successivo a quello di inizio");
    return;
  }

  const r = await fetch("/api/admin/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok() },
    body: JSON.stringify({ date, start, dur, reason })
  });

  if (r.ok) {
    agenda();
  } else {
    const j = await r.json();
    alert(j.error || "Errore durante il blocco");
  }
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function delBooking(id) {
  if (!confirm("Annullare questa prenotazione?")) return;
  await fetch("/api/admin/bookings/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + tok() } });
  agenda();
}

async function delBlock(id) {
  if (!confirm("Rimuovere questo blocco orario?")) return;
  await fetch("/api/admin/blocks/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + tok() } });
  agenda();
}

tok() ? agenda() : loginView();