/* ════════════════════════════════════════════════════════════════
   ATZAR CRIPTOGRÀFIC
   Tot resultat (casella guanyadora i obertura de la trampa) surt
   d'aquí. Math.random() només s'usa per a soroll visual i sonor que
   no decideix mai res.
   ════════════════════════════════════════════════════════════════ */
const RNG = (() => {
  const disponible = (typeof crypto !== 'undefined') &&
                     (typeof crypto.getRandomValues === 'function');
  const buf = new Uint32Array(1);
  /* Enter uniforme a [0, n) amb mostreig de rebuig: es descarta la cua
     superior de l'espai de 2^32 que no és múltiple exacte de n, perquè
     el mòdul no esbiaixi cap valor. */
  function enter(n) {
    if (!disponible) throw new Error('crypto.getRandomValues no disponible');
    if (n <= 0 || !Number.isInteger(n)) throw new Error('RNG.enter: n invàlid');
    const limit = Math.floor(4294967296 / n) * n;
    let x;
    do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
    return x % n;
  }
  return { disponible, enter };
})();
