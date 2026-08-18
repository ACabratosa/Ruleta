/* ════════════════════════════════════════════════════════════════
   MODEL DE LA RODA
   ════════════════════════════════════════════════════════════════ */

/* Seqüència física real de la ruleta europea, en ordre de roda */
const SEQ_EUROPEA = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
                     8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
                     28, 12, 35, 3, 26];

/* Ordre dels números per a M caselles no-zero.
   Amb M = 36 fem servir la seqüència europea real. Per a altres M no
   n'existeix cap de canònica: dispersem 1..M recorrent-los amb un pas g
   coprimer amb M proper a la raó àuria, cosa que separa els números
   consecutius per tota la roda, com fa la seqüència real. */
function seqNumeros(M) {
  if (M === 36) return SEQ_EUROPEA.slice(1);
  let g = Math.max(1, Math.round(M * 0.382));
  const mcd = (a, b) => (b ? mcd(b, a % b) : a);
  while (mcd(g, M) !== 1) g++;
  const seq = [];
  for (let j = 0; j < M; j++) seq.push(1 + (j * g) % M);
  return seq;
}

/* Construeix la roda a partir dels participants ACTIUS.
   k = round(36/N) amb mínim 3 → N·k + 1 caselles en total.
   Els colors s'assignen PER POSICIÓ FÍSICA: recorrent les N·k posicions
   no-zero i repartint els participants cíclicament. Així cadascú rep
   exactament k caselles i les seves queden sempre separades N posicions:
   equilibri exacte i cap sector concentrat. */
function generaRoda(actius) {
  const N = actius.length;
  const k = Math.max(3, Math.round(36 / N));
  const M = N * k;
  const nums = seqNumeros(M);
  const caselles = [{ num: 0, propietari: null }]; // el 0, verd: el Jefe
  for (let p = 0; p < M; p++) {
    caselles.push({ num: nums[p], propietari: actius[p % N] });
  }
  return {
    caselles,
    k,
    total: caselles.length,
    pas: U.TAU / caselles.length,
    /* angle local del centre de la casella i (la roda hi aplica la seva rotació) */
    angleCasella: i => i * (U.TAU / caselles.length),
  };
}
