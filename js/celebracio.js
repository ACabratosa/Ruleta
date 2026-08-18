/* ════════════════════════════════════════════════════════════════
   REVELACIÓ I CELEBRACIÓ
   Tres fases: impacte (0-0,5 s) → revelació (0,5-3 s) → celebració.
   El zero té la seva pròpia cerimònia, més exagerada.
   ════════════════════════════════════════════════════════════════ */
const Celebracio = (() => {
  let el, elIncident, elText, elNom, elFrase, elRatxa, elOdo, elFlaix, elBombetes;
  let oberta = false, tancable = false, resolTancament = null, temporitzadors = [];

  const FRASES_RATXA = [
    'La sort acaba de trobar-te.',
    'La fortuna insisteix.',
    'Això comença a fer sospitar.',
    'NO HI HA TRAMPA. NOMÉS MALA SORT DELS ALTRES.',
  ];

  function init() {
    el = document.getElementById('celebracio');
    elIncident = document.getElementById('celIncident');
    elText = document.getElementById('celText');
    elNom = document.getElementById('celNom');
    elFrase = document.getElementById('celFrase');
    elRatxa = document.getElementById('celRatxa');
    elOdo = document.getElementById('celOdometre');
    elFlaix = document.getElementById('flaix');
    elBombetes = el.querySelector('.cel-bombetes');
    el.addEventListener('click', () => tanca());
  }

  const t = (fn, ms) => temporitzadors.push(setTimeout(fn, ms));
  const netejaTimers = () => { temporitzadors.forEach(clearTimeout); temporitzadors = []; };

  /* bombetes de marquesina al voltant de la carta */
  function posaBombetes() {
    elBombetes.innerHTML = '';
    const frag = document.createDocumentFragment();
    const posa = (x, y, i) => {
      const b = document.createElement('div');
      b.className = 'bombeta';
      b.style.left = `calc(${x}% - 3px)`;
      b.style.top = `calc(${y}% - 3px)`;
      b.style.animationDelay = `${(i % 2) * 0.55}s`;
      frag.appendChild(b);
    };
    let i = 0;
    for (let c = 0; c <= 13; c++) { posa(3 + (c * 94) / 13, 1.5, i++); }
    for (let c = 0; c <= 13; c++) { posa(3 + (c * 94) / 13, 98.5, i++); }
    for (let c = 1; c <= 4; c++) { posa(1, 8 + (c * 84) / 5, i++); }
    for (let c = 1; c <= 4; c++) { posa(99, 8 + (c * 84) / 5, i++); }
    elBombetes.appendChild(frag);
  }

  /* odòmetre mecànic que puja fins al total */
  function rodaOdometre(final) {
    const dígits = Math.max(3, String(final).length);
    elOdo.innerHTML = '';
    const columnes = [];
    for (let d = 0; d < dígits; d++) {
      const col = document.createElement('div');
      col.className = 'odo-columna';
      const cinta = document.createElement('div');
      cinta.className = 'odo-cinta';
      cinta.innerHTML = Array.from({ length: 10 }, (_, n) => `<div>${n}</div>`).join('');
      col.appendChild(cinta);
      elOdo.appendChild(col);
      columnes.push(cinta);
    }
    const mostra = v => {
      const s = String(v).padStart(dígits, '0');
      for (let d = 0; d < dígits; d++) {
        columnes[d].style.transform = `translateY(${-parseInt(s[d], 10) * 32}px)`;
      }
    };
    mostra(0);
    /* comptem des de zero amb passos que s'alenteixen al final */
    const inici = Math.max(0, final - Math.min(18, final));
    let v = inici, pasN = 0;
    const totalPassos = final - inici;
    const seguent = () => {
      if (!oberta) return;
      v++; pasN++;
      mostra(v);
      Audio.ticOdometre();
      if (v < final) t(seguent, 55 + Math.pow(pasN / Math.max(1, totalPassos), 2.2) * 260);
    };
    if (final > 0) t(seguent, 260);
  }

  function flaix(verd) {
    elFlaix.classList.toggle('verd', !!verd);
    elFlaix.classList.add('actiu');
    t(() => elFlaix.classList.remove('actiu'), 140);
  }
  function sacseja(fort) {
    const app = document.getElementById('app');
    app.classList.remove('tremola', 'tremola-fort');
    void app.offsetWidth; /* reinicia l'animació */
    app.classList.add(fort ? 'tremola-fort' : 'tremola');
    t(() => app.classList.remove('tremola', 'tremola-fort'), 800);
  }

  /* ─── mostra la celebració; resol quan l'usuari la tanca ─── */
  function mostra({ entrada, total, ratxa, esZero }) {
    return new Promise(res => {
      resolTancament = res;
      oberta = true; tancable = false;
      netejaTimers();
      const calma = Estat.d.config.calma;
      el.classList.remove('fase-revela', 'fase-nom', 'fase-celebra', 'zero');
      if (esZero) el.classList.add('zero');
      posaBombetes();

      elIncident.textContent = `INCIDÈNCIA #${U.tresDigits(entrada.num)}`;
      elText.textContent = entrada.text;
      if (esZero) {
        elNom.textContent = 'LA BANCA GUANYA';
        elFrase.textContent = `EL ${entrada.guanyador.toUpperCase()} S'HO MENJA`;
        elRatxa.textContent = '';
      } else {
        elNom.textContent = entrada.guanyador;
        elFrase.textContent = 'AQUESTA INCIDÈNCIA ÉS TEVA';
        const fr = FRASES_RATXA[U.clamp(ratxa, 1, 4) - 1];
        elRatxa.textContent = fr;
        elRatxa.classList.toggle('ratxa-forta', ratxa >= 4);
      }

      if (esZero) {
        /* primer, silenci total: un segon sencer amb la sala apagada */
        Audio.ducA(0, 200);
        el.classList.add('visible');
        el.setAttribute('aria-hidden', 'false');
        t(() => {
          flaix(true);
          Audio.ducA(1, 250);
          Audio.impacte();
          Audio.alarma(3);
          sacseja(true);
          Cine.copCamera(true);
          Cine.aberra(360);
          document.body.classList.add('tema-zero');
          el.classList.add('fase-revela');
          Cine.carta(el.querySelector('.cel-carta'));
        }, 1050);
        t(() => { el.classList.add('fase-nom'); Cine.nom(elNom); }, 1900);
        t(() => {
          el.classList.add('fase-celebra');
          Particules.celebra({ zero: true, calma });
          Audio.cascadaMonedes(calma ? 3.5 : 6.6, calma ? 0.4 : 1.3);
          Audio.fanfarria(true);
          Audio.ovacio(calma ? 3 : 7);
          rodaOdometre(total);
          tancable = true;
        }, 3100);
      } else {
        /* IMPACTE: 0 - 0,5 s */
        Audio.ducA(1, 120);
        Audio.impacte();
        flaix(false);
        sacseja(ratxa >= 3);
        Cine.copCamera(ratxa >= 3);
        el.classList.add('visible');
        el.setAttribute('aria-hidden', 'false');
        /* REVELACIÓ: 0,5 - 3 s — cada element amb el seu aire */
        t(() => {
          el.classList.add('fase-revela');
          Cine.carta(el.querySelector('.cel-carta'));
        }, 420);
        t(() => { el.classList.add('fase-nom'); Cine.nom(elNom); }, 1550);
        /* CELEBRACIÓ: 3 s → */
        t(() => {
          el.classList.add('fase-celebra');
          Particules.celebra({ zero: false, calma });
          Audio.cascadaMonedes(calma ? 3.5 : 6.2, calma ? 0.4 : 1.1);
          Audio.fanfarria(false);
          Audio.ovacio(calma ? 3 : 6);
          rodaOdometre(total);
          tancable = true;
        }, 2950);
      }
    });
  }

  function tanca(força) {
    if (!oberta || (!tancable && !força)) return false;
    oberta = false;
    netejaTimers();
    el.classList.remove('visible');
    el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('tema-zero');
    Particules.buida();
    const r = resolTancament;
    resolTancament = null;
    r && r();
    return true;
  }

  return { init, mostra, tanca, get oberta() { return oberta; } };
})();
