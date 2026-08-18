/* ════════════════════════════════════════════════════════════════
   SORTEIG
   El resultat es decideix sencer ABANS de començar cap animació.
   ════════════════════════════════════════════════════════════════ */

/* Cadena completa de la tirada:
     casella A → trampa? → casella B → trampa? → ... → casella final
   · Cada casella surt uniforme sobre el CONJUNT DE CASELLES (1/37),
     mai triant primer un nom: el Jefe ha de tenir exactament 1/37.
   · La trampa s'obre amb probabilitat fixa idèntica a totes les
     caselles, inclòs el 0. Com que és independent de la identitat,
     la distribució final és exactament la mateixa.
   · Es repeteix mentre surti trampa, sense límit. */
function planificaCadena(roda, probTrampa) {
  const llindar = Math.round(probTrampa * 100); // sobre 10000
  const passos = [];
  for (;;) {
    const idx = RNG.enter(roda.total);
    const trampa = RNG.enter(10000) < llindar;
    passos.push({ idx, trampa });
    if (!trampa) break;
  }
  return passos;
}
