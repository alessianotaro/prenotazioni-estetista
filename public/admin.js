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
    <b>Gestione Chiusure e Blocchi</b>
    <div style="margin: 8px 0;">
      <label style="font-size: 13px;">Tipo di blocco:</label>
      <select id="b-type" onchange="toggleBlockType(this)" style="width:100%; margin-top:4px; padding:6px;">
        <option value="slot">Fascia Oraria</option>
        <option value="day">Intera Giornata</option>
      </select>
    </div>

    <div style="margin: 8px 0;">
      <label style="font-size: 13px;">Data:</label>
      <input type="date" id="b-date" style="width:100%; margin-top:4px; padding:6px;">
    </div>

    <div id="slot-options" style="display:flex; gap:8px; margin: 8px 0;">
      <div style="flex:1;">
        <label style="font-size: 13px;">Orario Inizio:</label>
        <select id="b-start" style="width:100%; margin-top:4px; padding:6px;">
          <option value="09:00">09:00</option>
          <option value="10:00">10:00</option>
          <option value="11:00">11:00</option>
          <option value="12:00">12:00</option>
          <option value="13:00">13:00</option>
          <option value="14:30">14:30</option>
          <option value="15:30">15:30</option>
          <option value="16:30">16:30</option>
        </select>
      </div>
      <div style="flex:1;">
        <label style="font-size: 13px;">Durata:</label>
        <select id="b-hours" style="width:100%; margin-top:4px; padding:6px;">
          <option value="1">1 Ora</option>
          <option value="2">2 Ore</option>
          <option value="3">3 Ore</option>
          <option value="4">4 Ore</option>
          <option value="5">5 Ore</option>
        </select>
      </div>
    </div>

    <div style="margin: 8px 0;">
      <label style="font-size: 13px;">Motivazione (opzionale):</label>
      <input type="text" id="b-reason" placeholder="Es. Ferie, Visita, Riunione" style="width:100%; margin-top:4px; padding:6px;">
    </div>

    <button onclick="addBlock()" style="margin-top:8px; width:100%; padding:8px;">Aggiungi Blocco</button>
  </div>`;

  const items = [
    ...bookings.map(b => ({ ...b, type: 'booking' })),
    ...blocks.map(b => ({ ...b, type: 'block', name: b.reason || (b.type === 'day' ? 'Intera giornata bloccata' : 'Fascia oraria bloccata'), phone: '', treat: b.type === 'day' ? 'Chiusura intera giornata' : `Blocco (${b.dur / 60 || 1}h)` }))
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.start || 0) - (b.start || 0));

  let cur = "";
  items.forEach(item => {
    if (item.date !== cur) {
      if (cur !== "") h += "</div>";
      cur = item.date;
      h += `<div class="c"><b>${it(item.date)}</b>`;
    }
    if (item.type === 'booking') {
      const cleanPhone = (item.phone || "").replace(/\D/g, "");
      const waMsg = encodeURIComponent(`Ciao ${item.name}, ti ricordo il tuo appuntamento per ${item.treat} il giorno ${it(item.date)} alle ore ${hm(item.start)}. A presto! ✨`);
      const waLink = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('3') && cleanPhone.length === 10 ? '39' + cleanPhone : cleanPhone}?text=${waMsg}` : '';

      h += `<div class="r">
        <b>${hm(item.start)}–${hm(item.start + item.dur)}</b> · ${esc(item.name)}<br>
        <span class="m">${esc(item.treat)}${item.phone ? " · " + esc(item.phone) : ""}</span><br>
        <div style="margin-top:4px;display:flex;gap:8px;align-items:center;">
          ${waLink ? `<a href="${waLink}" target="_blank" style="background:#25d366;color:#fff;padding:4px 8px;border-radius:6px;text-decoration:none;font-size:12px">💬 WhatsApp</a>` : ''}
          <a onclick="delBooking(${item.id})" style="color:#c0392b; cursor:pointer;">annulla</a>
        </div>
      </div>`;
    } else {
      const timeText = item.type === 'day' ? 'Intera giornata' : `${hm(item.start)}–${hm(item.start + item.dur)}`;
      h += `<div class="r block-box"><b>${timeText}</b> · 🔒 <i>${esc(item.name)}</i><br><span class="m">Orario non disponibile</span> <a onclick="delBlock(${item.id})" style="cursor:pointer; color:#c0392b;">rimuovi blocco</a></div>`;
    }
  });

  $.innerHTML = h + (items.length ? "</div>" : '<p class="m">Nessun impegno in programma.</p>') + `<a onclick="sessionStorage.removeItem('tk');loginView()" style="cursor:pointer;">Esci</a>`;
}

function toggleBlockType(select) {
  const slotOptions = document.getElementById("slot-options");
  if (select.value === "day") {
    slotOptions.style.display = "none";
  } else {
    slotOptions.style.display = "flex";
  }
}

async function addBlock() {
  const type = document.getElementById("b-type").value;
  const date = document.getElementById("b-date").value;
  const reasonInput = document.getElementById("b-reason").value.trim();

  if (!date) {
    alert("Seleziona una data valida");
    return;
  }

  let payload = { type, date };

  if (type === "slot") {
    const startStr = document.getElementById("b-start").value;
    const hours = parseInt(document.getElementById("b-hours").value) || 1;
    const [sh, sm] = startStr.split(":").map(Number);
    const start = sh * 60 + sm;
    const dur = hours * 60;

    payload.start = start;
    payload.dur = dur;
    payload.reason = reasonInput !== "" ? reasonInput : "Fascia oraria riservata";
  } else {
    payload.start = 0;
    payload.dur = 24 * 60;
    payload.reason = reasonInput !== "" ? reasonInput : "Chiusura straordinaria";
  }

  const r = await fetch("/api/admin/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok() },
    body: JSON.stringify(payload)
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







// const $ = document.getElementById("app");
// const pad = n => String(n).padStart(2, "0"), hm = m => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
// const it = d => new Date(d + "T12:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
// const tok = () => sessionStorage.getItem("tk");

// function loginView(err = "") {
//     $.innerHTML = `<h1>Area estetista</h1><div class="c"><input id="pw" type="password" placeholder="Password"><p class="e">${err}</p><button onclick="login()">Entra</button></div><a href="/">← Torna alla prenotazione</a>`;
// }

// async function login() {
//     const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: document.getElementById("pw").value }) });
//     const j = await r.json();
//     if (r.ok) { sessionStorage.setItem("tk", j.token); agenda(); } else loginView(j.error);
// }

// async function agenda() {
//     const r = await fetch("/api/admin/bookings", { headers: { Authorization: "Bearer " + tok() } });
//     if (r.status === 401) { sessionStorage.removeItem("tk"); return loginView(); }
//     const data = await r.json();
//     const bookings = data.bookings || [];
//     const blocks = data.blocks || [];

//     let h = `<h1>Agenda</h1>
//     <div class="c">
//         <b>Blocca orario / Chiusura</b>
//         <input type="date" id="b-date">
//         <div style="margin: 8px 0;">
//             <label style="font-size: 13px; cursor: pointer;">
//                 <input type="checkbox" id="b-all-day" onchange="toggleAllDay(this)"> 📅 Intera giornata
//             </label>
//         </div>
//         <div id="time-inputs" style="display:flex;gap:8px">
//             <input type="time" id="b-start" value="09:00">
//             <input type="time" id="b-end" value="13:00">
//         </div>
//         <input type="text" id="b-reason" placeholder="Motivo (es. Ferie, Visita, Chiusura straordinaria)" style="margin-top:8px">
//         <button onclick="addBlock()" style="margin-top:8px">Blocca fascia oraria</button>
//     </div>`;

//     const items = [
//         ...bookings.map(b => ({ ...b, type: 'booking' })),
//         ...blocks.map(b => ({ ...b, type: 'block', name: b.reason || 'Chiusura', phone: '', treat: 'Orario bloccato' }))
//     ].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);

//     let cur = "";
//     items.forEach(item => {
//         if (item.date !== cur) {
//             if (cur !== "") h += "</div>";
//             cur = item.date;
//             h += `<div class="c"><b>${it(item.date)}</b>`;
//         }
//         if (item.type === 'booking') {
//             const cleanPhone = (item.phone || "").replace(/\D/g, "");
//             const waMsg = encodeURIComponent(`Ciao ${item.name}, ti ricordo il tuo appuntamento per ${item.treat} il giorno ${it(item.date)} alle ore ${hm(item.start)}. A presto! ✨`);
//             const waLink = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('3') && cleanPhone.length === 10 ? '39' + cleanPhone : cleanPhone}?text=${waMsg}` : '';

//             h += `<div class="r">
//                 <b>${hm(item.start)}–${hm(item.start + item.dur)}</b> · ${esc(item.name)}<br>
//                 <span class="m">${esc(item.treat)}${item.phone ? " · " + esc(item.phone) : ""}</span><br>
//                 <div style="margin-top:4px;display:flex;gap:8px;align-items:center;">
//                     ${waLink ? `<a href="${waLink}" target="_blank" style="background:#25d366;color:#fff;padding:4px 8px;border-radius:6px;text-decoration:none;font-size:12px">💬 WhatsApp</a>` : ''}
//                     <a onclick="delBooking(${item.id})" style="color:#c0392b;cursor:pointer;">annulla</a>
//                 </div>
//             </div>`;
//         } else {
//             h += `<div class="r block-box"><b>${hm(item.start)}–${hm(item.start + item.dur)}</b> · 🔒 <i>${esc(item.name)}</i><br><span class="m">Fascia bloccata</span> <a onclick="delBlock(${item.id})" style="cursor:pointer;">rimuovi blocco</a></div>`;
//         }
//     });

//     $.innerHTML = h + (items.length ? "</div>" : '<p class="m">Nessun impegno in programma.</p>') + `<a onclick="sessionStorage.removeItem('tk');loginView()" style="cursor:pointer;">Esci</a>`;
// }

// function toggleAllDay(checkbox) {
//     const timeInputs = document.getElementById("time-inputs");
//     if (checkbox.checked) {
//         document.getElementById("b-start").value = "08:00";
//         document.getElementById("b-end").value = "19:00";
//         timeInputs.style.opacity = "0.5";
//         document.getElementById("b-start").disabled = true;
//         document.getElementById("b-end").disabled = true;
//     } else {
//         timeInputs.style.opacity = "1";
//         document.getElementById("b-start").disabled = false;
//         document.getElementById("b-end").disabled = false;
//     }
// }

// async function addBlock() {
//     const date = document.getElementById("b-date").value;
//     const startStr = document.getElementById("b-start").value;
//     const endStr = document.getElementById("b-end").value;
//     const reason = document.getElementById("b-reason").value;

//     if (!date || !startStr || !endStr) {
//         alert("Inserisci data e orari validi");
//         return;
//     }

//     const [sh, sm] = startStr.split(":").map(Number);
//     const [eh, em] = endStr.split(":").map(Number);
//     const start = sh * 60 + sm;
//     const end = eh * 60 + em;
//     const dur = end - start;

//     if (dur <= 0) {
//         alert("L'orario di fine deve essere successivo a quello di inizio");
//         return;
//     }

//     const r = await fetch("/api/admin/blocks", {
//         method: "POST",
//         headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok() },
//         body: JSON.stringify({ date, start, dur, reason })
//     });

//     if (r.ok) {
//         agenda();
//     } else {
//         const j = await r.json();
//         alert(j.error || "Errore durante il blocco");
//     }
// }

// const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// async function delBooking(id) {
//     if (!confirm("Annullare questa prenotazione?")) return;
//     await fetch("/api/admin/bookings/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + tok() } });
//     agenda();
// }

// async function delBlock(id) {
//     if (!confirm("Rimuovere questo blocco orario?")) return;
//     await fetch("/api/admin/blocks/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + tok() } });
//     agenda();
// }

// tok() ? agenda() : loginView();

