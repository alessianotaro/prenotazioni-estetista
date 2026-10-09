// Impostazioni modificabili
module.exports = {
  treatments: [
    { name: "Semipermanente / Semipermanente rinforzato mani", minutes: 40 },
    { name: "Semipermanente piedi", minutes: 20 },
    { name: "Refill mani", minutes: 60 },
    { name: "Ricostruzione", minutes: 60 },
    { name: "Ceretta", minutes: 30 }, // Durata media, personalizzabile
    { name: "Extension ciglia", minutes: 120 },
    { name: "Make up", minutes: 60 },
    { name: "Laminazione ciglia", minutes: 45 }
  ],

  open: 8 * 60,       // apertura 08:00 (480 minuti)
  close: 19 * 60,     // chiusura 19:00 (1140 minuti)
  step: 15,           // un orario ogni 15 minuti
  closedDays: [0, 6], // 0 = domenica, 6 = sabato (sabato e domenica chiusi)

  port: process.env.PORT || 10000,
  adminPassword: process.env.ADMIN_PASSWORD || "cambiami123", // CAMBIALA!
};