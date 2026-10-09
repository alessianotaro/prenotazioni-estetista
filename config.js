// Impostazioni modificabili
module.exports = {
  treatments: [
    { name: "Unghie mani", minutes: 40 },
    { name: "Ceretta completa gambe", minutes: 60 },
    // aggiungi qui altri trattamenti
  ],
  open: 9 * 60,     // apertura 09:00
  close: 18 * 60,   // chiusura 18:00
  step: 20,         // un orario ogni 20 minuti
  closedDays: [0],  // 0 = domenica, 1 = lunedì ...
  port: process.env.PORT || 3000,
  adminPassword: process.env.ADMIN_PASSWORD || "cambiami123", // CAMBIALA!
};