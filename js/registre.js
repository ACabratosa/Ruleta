/* ════════════════════════════════════════════════════════════════
   REGISTRE DE LA TAULA — llibre, estadístiques, rècords i CSV
   ════════════════════════════════════════════════════════════════ */
const Registre = (() => {
  let el, elLlista, elSessioNum, elAnt, elSeg, elFitxa;
  let sessioTriada = 1;
  let pestanyaActiva = 'registre';

  function init() {
    el = document.getElementById('pantallaRegistre');
    elLlista = document.getElementById('registreLlista');
    elSessioNum = document.getElementById('sessioTriada');
    elAnt = document.getElementById('sessioAnt');
    elSeg = document.getElementById('sessioSeg');
    elFitxa = document.getElementById('fitxa');

    elAnt.addEventListener('click', () => mouSessio(-1));
    elSeg.addEventListener('click', () => mouSessio(1));
    document.getElementById('pestRegistre').addEventListener('click', () => triaPestanya('registre'));
    document.getElementById('pestEstadistiques').addEventListener('click', () => triaPestanya('estadistiques'));
    document.getElementById('btnTancarRegistre').addEventListener('click', tanca);
    document.getElementById('btnExportar').addEventListener('click', exportaCSV);
    document.getElementById('btnTancarFitxa').addEventListener('click', tancaFitxa);
    elFitxa.addEventListener('click', e => { if (e.target === elFitxa) tancaFitxa(); });
    el.addEventListener('click', e => { if (e.target === el) tanca(); });
  }

  function obre() {
    sessioTriada = Estat.d.sessio;
    triaPestanya(pestanyaActiva, true);
    el.classList.add('visible');
    el.setAttribute('aria-hidden', 'false');
    Cine.llibre(el.querySelector('.llibre'));
  }
  function tanca() {
    el.classList.remove('visible');
    el.setAttribute('aria-hidden', 'true');
    tancaFitxa();
  }
  const oberta = () => el.classList.contains('visible');

  function triaPestanya(nom, força) {
    if (pestanyaActiva === nom && !força) return;
    pestanyaActiva = nom;
    const esReg = nom === 'registre';
    document.getElementById('pestRegistre').classList.toggle('activa', esReg);
    document.getElementById('pestRegistre').setAttribute('aria-selected', esReg);
    document.getElementById('pestEstadistiques').classList.toggle('activa', !esReg);
    document.getElementById('pestEstadistiques').setAttribute('aria-selected', !esReg);
    document.getElementById('pagRegistre').hidden = !esReg;
    document.getElementById('pagEstadistiques').hidden = esReg;
    if (esReg) pintaLlista(); else pintaEstadistiques();
  }

  function mouSessio(dir) {
    const llista = Estat.sessions();
    const i = llista.indexOf(sessioTriada);
    const nou = U.clamp(i + dir, 0, llista.length - 1);
    sessioTriada = llista[nou];
    pintaLlista();
  }

  const colorDe = (id, fallback) => {
    const p = Estat.perId(id);
    return p ? p.color : (fallback || '#6a6a6a');
  };
  const cadenaText = (cadena, fletxa) =>
    cadena.map(pas => Estat.nomDe(pas.id, pas.nom).toUpperCase()).join(fletxa);

  /* ─── pestanya REGISTRE ─── */
  function pintaLlista() {
    const llista = Estat.sessions();
    const i = llista.indexOf(sessioTriada);
    elSessioNum.textContent = '#' + U.dosDigits(sessioTriada);
    elAnt.disabled = i <= 0;
    elSeg.disabled = i >= llista.length - 1;

    const entrades = Estat.entradesSessio(sessioTriada);
    if (!entrades.length) {
      elLlista.innerHTML = `<div class="pagina-blanca"><div>
        Encara no s'hi ha destinat cap incidència.<span class="ornament"></span>
      </div></div>`;
      return;
    }
    /* ordre invers: la més recent a dalt */
    elLlista.innerHTML = entrades.slice().reverse().map(e => {
      const nom = Estat.nomDe(e.guanyadorId, e.guanyador);
      const cad = e.cadena && e.cadena.length > 1
        ? `<div class="entrada-cadena">${U.escapaHTML(cadenaText(e.cadena, ' → '))}</div>` : '';
      return `<button type="button" class="entrada-fila" data-ts="${e.timestamp}">
        <div class="entrada-meta">#${U.tresDigits(e.num)} · ${U.dataCurta(e.timestamp)} · ${U.horaCurta(e.timestamp)}</div>
        <div class="entrada-guanyador"><span class="punt-color" style="background:${colorDe(e.guanyadorId)}"></span>${U.escapaHTML(nom)}</div>
        ${cad}
        <div class="entrada-descripcio">${U.escapaHTML(e.text)}</div>
      </button>`;
    }).join('');
    elLlista.querySelectorAll('.entrada-fila').forEach(b => {
      b.addEventListener('click', () => {
        const e = Estat.d.entrades.find(x => String(x.timestamp) === b.dataset.ts);
        if (e) obreFitxa(e);
      });
    });
  }

  /* ─── fitxa individual ─── */
  function obreFitxa(e) {
    document.getElementById('fitxaNum').textContent =
      `SESSIÓ #${U.dosDigits(e.sessio)} · INCIDÈNCIA #${U.tresDigits(e.num)}`;
    document.getElementById('fitxaText').textContent = e.text;
    document.getElementById('fitxaGuanyador').textContent = Estat.nomDe(e.guanyadorId, e.guanyador).toUpperCase();
    const filaCad = document.getElementById('fitxaCadenaFila');
    if (e.cadena && e.cadena.length > 1) {
      filaCad.style.display = '';
      document.getElementById('fitxaCadena').textContent = cadenaText(e.cadena, ' → ');
    } else filaCad.style.display = 'none';
    document.getElementById('fitxaData').textContent = U.dataLlarga(e.timestamp);
    document.getElementById('fitxaHora').textContent = U.horaSegons(e.timestamp);
    elFitxa.classList.add('visible');
    elFitxa.setAttribute('aria-hidden', 'false');
    Cine.fitxa(elFitxa.querySelector('.fitxa-placa'));
  }
  function tancaFitxa() {
    elFitxa.classList.remove('visible');
    elFitxa.setAttribute('aria-hidden', 'true');
  }
  const fitxaOberta = () => elFitxa.classList.contains('visible');

  /* ─── pestanya ESTADÍSTIQUES ─── */
  function jugadors() {
    /* participants actuals + el Jefe + qualsevol nom del passat */
    const llista = Estat.d.participants.map(p => ({ clau: p.id, nom: p.nom, color: p.color, jefe: false }));
    llista.push({ clau: 'jefe', nom: Estat.d.jefe.nom, color: COLOR_JEFE, jefe: true });
    const coneguts = new Set(llista.map(j => j.clau));
    for (const e of Estat.d.entrades) {
      const clau = e.guanyadorId || 'nom:' + e.guanyador;
      if (!coneguts.has(clau)) {
        coneguts.add(clau);
        llista.push({ clau, nom: e.guanyador, color: '#6a6a6a', jefe: false, antic: true });
      }
    }
    return llista;
  }
  const clauDe = e => e.guanyadorId || 'nom:' + e.guanyador;

  function pintaEstadistiques() {
    const totes = Estat.d.entrades;
    const sessioActual = Estat.entradesSessio(Estat.d.sessio);
    const llista = jugadors();

    document.getElementById('statsTotals').innerHTML =
      `TOTAL · <b>${U.tresDigits(sessioActual.length)}</b> aquesta sessió · <b>${U.tresDigits(totes.length)}</b> històric`;

    /* recomptes */
    const compta = new Map(), ultima = new Map();
    for (const e of totes) {
      const c = clauDe(e);
      compta.set(c, (compta.get(c) || 0) + 1);
      ultima.set(c, e);
    }
    const files = llista
      .map(j => ({ ...j, n: compta.get(j.clau) || 0, ult: ultima.get(j.clau) || null }))
      .filter(j => !j.antic || j.n > 0)
      .sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom));

    document.getElementById('statsTaula').innerHTML = `<table>
      <thead><tr><th>JUGADOR</th><th>INCIDÈNCIES</th><th>%</th><th>ÚLTIMA</th></tr></thead>
      <tbody>${files.map(j => `<tr class="${j.jefe ? 'fila-jefe' : ''}">
        <td><span class="punt-color" style="background:${j.color}"></span>${U.escapaHTML(j.nom)}${j.antic ? ' *' : ''}</td>
        <td>${j.n}</td>
        <td>${U.percentatge(j.n, totes.length)}</td>
        <td class="ultima">${j.ult ? `#${U.tresDigits(j.ult.num)} · ${U.dataCurta(j.ult.timestamp)}` : '—'}</td>
      </tr>`).join('')}</tbody></table>`;

    pintaRecords(totes, files, compta);
  }

  function nomsMaxim(mapa, format) {
    /* retorna el(s) posseïdor(s) del màxim d'un Map clau→n */
    let màx = 0;
    for (const v of mapa.values()) màx = Math.max(màx, v);
    if (màx <= 0) return null;
    const qui = [...mapa.entries()].filter(([, v]) => v === màx)
      .map(([k]) => {
        if (k.startsWith('nom:')) return k.slice(4);
        return Estat.nomDe(k, null) || k;
      });
    const nom = qui.length > 2 ? `${qui[0]} i ${qui.length - 1} més` : qui.join(' i ');
    return format(nom, màx);
  }

  function pintaRecords(totes, files, compta) {
    const recs = [];
    const buit = '—';

    /* qui en té més */
    recs.push(['QUI EN TÉ MÉS', nomsMaxim(compta, (n, v) => `${n} · ${v}`) || buit]);

    /* ratxa consecutiva més llarga */
    let ratxaMax = 0, ratxaQui = null, act = 0, actQui = null;
    for (const e of totes) {
      const c = clauDe(e);
      if (c === actQui) act++; else { actQui = c; act = 1; }
      if (act > ratxaMax) { ratxaMax = act; ratxaQui = c; }
    }
    recs.push(['RATXA MÉS LLARGA', ratxaMax > 1
      ? `${Estat.nomDe(ratxaQui, ratxaQui && ratxaQui.startsWith('nom:') ? ratxaQui.slice(4) : null)} · ${ratxaMax} seguides`
      : buit]);

    /* últim guanyador */
    const ult = totes[totes.length - 1];
    recs.push(['ÚLTIM GUANYADOR', ult ? `${Estat.nomDe(ult.guanyadorId, ult.guanyador)} · #${U.tresDigits(ult.num)}` : buit]);

    /* qui porta més tirades seguides sense rebre'n cap (jugadors presents) */
    if (totes.length) {
      const sequera = new Map();
      for (const p of Estat.actius()) {
        let n = 0;
        for (let i = totes.length - 1; i >= 0; i--) {
          if (clauDe(totes[i]) === p.id) break;
          n++;
        }
        sequera.set(p.id, n);
      }
      recs.push(['MÉS TIRADES SENSE REBRE', nomsMaxim(sequera, (n, v) => `${n} · ${v} tirades`) || buit]);
    } else {
      recs.push(['MÉS TIRADES SENSE REBRE', buit]);
    }

    /* qui s'ha salvat més vegades per la trampa */
    const salvats = new Map();
    for (const e of totes) {
      if (!e.cadena) continue;
      for (const pas of e.cadena.slice(0, -1)) {
        const c = pas.id || 'nom:' + pas.nom;
        salvats.set(c, (salvats.get(c) || 0) + 1);
      }
    }
    recs.push(['MÉS SALVAT PER LA TRAMPA', nomsMaxim(salvats, (n, v) => `${n} · ${v} vegades`) || buit]);

    /* qui ha rebut més incidències que eren d'un altre */
    const heretades = new Map();
    for (const e of totes) {
      if (!e.cadena || e.cadena.length < 2) continue;
      const fi = clauDe(e);
      const dUnAltre = e.cadena.slice(0, -1).some(p => (p.id || 'nom:' + p.nom) !== fi);
      if (dUnAltre) heretades.set(fi, (heretades.get(fi) || 0) + 1);
    }
    recs.push(['MÉS HERETADES D’UN ALTRE', nomsMaxim(heretades, (n, v) => `${n} · ${v}`) || buit]);

    document.getElementById('statsRecords').innerHTML = recs.map(([e, v]) =>
      `<div class="record-fila"><span class="record-etiqueta">${e}</span><span class="record-valor">${U.escapaHTML(v)}</span></div>`
    ).join('');
  }

  /* ─── exportació CSV ─── */
  function exportaCSV() {
    const cap = ['sessió', 'número', 'data', 'hora', 'incidència', 'guanyador', 'cadena'];
    const files = Estat.d.entrades.map(e => [
      e.sessio,
      e.num,
      U.dataCurta(e.timestamp),
      U.horaCurta(e.timestamp),
      e.text,
      Estat.nomDe(e.guanyadorId, e.guanyador),
      e.cadena && e.cadena.length > 1 ? e.cadena.map(p => Estat.nomDe(p.id, p.nom)).join(' > ') : '',
    ]);
    const csv = '\ufeff' + [cap, ...files]
      .map(f => f.map(U.csvCamp).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'registre-taula-04.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  return { init, obre, tanca, oberta, fitxaOberta, tancaFitxa, pintaLlista };
})();
