'use strict';
/* ════════════════════════════════════════════════════════════════
   UTILITATS
   ════════════════════════════════════════════════════════════════ */
const U = {
  TAU: Math.PI * 2,
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  /* Normalitza un angle a [0, TAU) */
  wrap(a) { a %= U.TAU; return a < 0 ? a + U.TAU : a; },
  /* Diferència angular mínima amb signe, dins (-PI, PI] */
  difAngular(a, b) {
    let d = U.wrap(a - b);
    if (d > Math.PI) d -= U.TAU;
    return d;
  },
  easeInQuad: t => t * t,
  easeOutQuad: t => 1 - (1 - t) * (1 - t),
  easeInOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  easeInCubic: t => t * t * t,
  easeOutElastic(t) {
    if (t <= 0) return 0; if (t >= 1) return 1;
    const c = U.TAU / 3.6;
    return Math.pow(2, -9 * t) * Math.sin((t * 9 - 0.75) * c) + 1;
  },
  dosDigits: n => String(n).padStart(2, '0'),
  tresDigits: n => String(n).padStart(3, '0'),

  MESOS: ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol',
          'agost', 'setembre', 'octubre', 'novembre', 'desembre'],
  dataCurta(ts) {
    const d = new Date(ts);
    return `${U.dosDigits(d.getDate())}/${U.dosDigits(d.getMonth() + 1)}/${d.getFullYear()}`;
  },
  horaCurta(ts) {
    const d = new Date(ts);
    return `${U.dosDigits(d.getHours())}:${U.dosDigits(d.getMinutes())}`;
  },
  horaSegons(ts) {
    const d = new Date(ts);
    return `${U.dosDigits(d.getHours())}:${U.dosDigits(d.getMinutes())}:${U.dosDigits(d.getSeconds())}`;
  },
  /* «18 d'agost de 2026» — els mesos que comencen amb vocal duen apòstrof */
  dataLlarga(ts) {
    const d = new Date(ts);
    const mes = U.MESOS[d.getMonth()];
    const de = /^[aeiou]/.test(mes) ? "d'" : 'de ';
    return `${d.getDate()} ${de}${mes} de ${d.getFullYear()}`;
  },
  /* Percentatge amb un decimal i coma decimal; mai NaN */
  percentatge(n, total) {
    if (!total || total <= 0) return '0,0%';
    return ((n / total) * 100).toFixed(1).replace('.', ',') + '%';
  },
  /* Escapament CSV: cometes dobles, comes i salts de línia */
  csvCamp(v) {
    const s = String(v == null ? '' : v);
    if (/[",\n\r;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  },
  escapaHTML(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  /* Soroll visual (mai per a resultats): interval [a,b) */
  visual: (a, b) => a + Math.random() * (b - a),
  visualEnter: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  tria: arr => arr[Math.floor(Math.random() * arr.length)],
};
