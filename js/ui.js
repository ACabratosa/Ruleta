/* ════════════════════════════════════════════════════════════════
   INTERFÍCIE — botó START, llegenda, croupier, teclat, ajustos
   ════════════════════════════════════════════════════════════════ */
const UI = (() => {
  const $ = id => document.getElementById(id);
  let btnTirar, btnTirarText, croupierEl, avisEl, avisTimer = 0;
  let confirmaResol = null;
  let reduitMoviment = false; // prefers-reduced-motion actiu al sistema

  /* textures per distingir colors semblants: la mateixa sèrie que a la roda */
  function texturaCss(i) {
    const t = i % 4, c = 'rgba(241,231,204,.16)';
    if (t === 0) return `repeating-linear-gradient(45deg, ${c} 0 1px, transparent 1px 4px)`;
    if (t === 1) return `repeating-linear-gradient(-45deg, ${c} 0 1px, transparent 1px 4px)`;
    if (t === 2) return `repeating-linear-gradient(0deg, ${c} 0 1px, transparent 1px 4px)`;
    return `radial-gradient(${c} 1px, transparent 1.5px)`;
  }

  /* tessel·la de gra generada per codi (cap fitxer extern) */
  function generaSoroll() {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    const img = g.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 118 + Math.floor(Math.random() * 34);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 26;
    }
    g.putImageData(img, 0, 0);
    document.documentElement.style.setProperty('--soroll', `url(${c.toDataURL()})`);
  }

  /* ─── portada d'entrada ─── */
  function entrada() {
    const el = $('entrada');
    let fora = false;
    const marxa = () => {
      if (fora) return;
      fora = true;
      el.classList.add('fora');
      setTimeout(() => el.remove(), 800);
      window.removeEventListener('keydown', marxa, true);
      window.removeEventListener('pointerdown', marxa, true);
    };
    setTimeout(marxa, 1900);
    window.addEventListener('keydown', marxa, true);
    window.addEventListener('pointerdown', marxa, true);
  }

  /* ─── comptadors i llegenda ─── */
  function refrescaComptadors() {
    $('numSessio').textContent = '#' + U.dosDigits(Estat.d.sessio);
    $('numIncidencia').textContent = '#' + U.tresDigits(Estat.numSeguent());
  }

  function refrescaLlegenda() {
    const el = $('llegenda');
    const compta = new Map();
    for (const e of Estat.d.entrades) {
      const c = e.guanyadorId || 'nom:' + e.guanyador;
      compta.set(c, (compta.get(c) || 0) + 1);
    }
    const fila = (chip, nom, sub, n, classes) => `
      <div class="lleg-fila ${classes || ''}">
        ${chip}
        <span class="lleg-nom">${U.escapaHTML(nom)}${sub ? `<small>${sub}</small>` : ''}</span>
        <span class="lleg-compt">${n}</span>
      </div>`;
    let html = Estat.d.participants.map((p, i) => fila(
      `<span class="lleg-chip" style="background-color:${p.color};background-image:${texturaCss(i)}">${U.escapaHTML((p.nom[0] || '?').toUpperCase())}</span>`,
      p.nom || '—', p.absent ? 'ABSENT' : '', compta.get(p.id) || 0,
      p.absent ? 'absent' : ''
    )).join('');
    html += fila(
      `<span class="lleg-chip" style="background-color:${COLOR_JEFE}">0</span>`,
      Estat.d.jefe.nom, 'LA BANCA', compta.get('jefe') || 0, 'jefe-fila');
    el.innerHTML = html;
  }

  /* ─── croupier ─── */
  function croupier(text) {
    if (croupierEl.textContent === text) return;
    croupierEl.style.opacity = '0';
    setTimeout(() => {
      croupierEl.textContent = text;
      croupierEl.style.opacity = '';
    }, 180);
  }

  /* ─── el botó START: l'única crida a l'acció de la taula ─── */
  function refrescaBoto() {
    if (Main.estat() !== 'repos') return;
    btnTirar.disabled = Estat.actius().length < 2;
    btnTirarText.textContent = 'START';
    croupier('Les apostes estan tancades.');
  }

  function bloquejaTirada() {
    btnTirar.disabled = true;
  }
  function alliberaTirada() {
    refrescaBoto();
  }

  /* ─── avisos ─── */
  function avis(text, ms = 3200) {
    clearTimeout(avisTimer);
    avisEl.textContent = text;
    const nou = !avisEl.classList.contains('visible');
    avisEl.classList.add('visible');
    avisEl.classList.remove('persistent');
    if (nou) Cine.avis(avisEl);
    avisTimer = setTimeout(() => avisEl.classList.remove('visible'), ms);
  }
  function avisPersistent(text) {
    clearTimeout(avisTimer);
    avisEl.textContent = text;
    avisEl.classList.add('visible', 'persistent');
  }

  /* ─── confirmació ─── */
  function confirma(titol, text, boto) {
    return new Promise(res => {
      confirmaResol = res;
      $('confirmTitol').textContent = titol;
      $('confirmText').textContent = text;
      $('confirmAccepta').textContent = boto || 'CONFIRMAR';
      $('confirmacio').classList.add('visible');
      $('confirmacio').setAttribute('aria-hidden', 'false');
      Cine.confirmacio($('confirmacio').querySelector('.confirm-placa'));
      $('confirmAccepta').focus();
    });
  }
  function tancaConfirma(valor) {
    $('confirmacio').classList.remove('visible');
    $('confirmacio').setAttribute('aria-hidden', 'true');
    const r = confirmaResol; confirmaResol = null;
    r && r(valor);
  }
  const confirmaOberta = () => $('confirmacio').classList.contains('visible');

  /* ─── ajustos ─── */
  const ajustosEl = () => $('pantallaAjustos');
  function obreAjustos() {
    pintaAjustos();
    ajustosEl().classList.add('visible');
    ajustosEl().setAttribute('aria-hidden', 'false');
    Cine.calaix(ajustosEl().querySelector('.ajustos-panell'));
  }
  function tancaAjustos() {
    ajustosEl().classList.remove('visible');
    ajustosEl().setAttribute('aria-hidden', 'true');
  }
  const ajustosOberts = () => ajustosEl().classList.contains('visible');

  function pintaAjustos() {
    const cont = $('llistaParticipants');
    cont.innerHTML = '';
    Estat.d.participants.forEach((p, i) => {
      const fila = document.createElement('div');
      fila.className = 'part-fila';
      fila.innerHTML = `
        <button type="button" class="part-swatch" title="Canviar el color"
          style="background-color:${p.color};background-image:${texturaCss(i)}">${U.escapaHTML((p.nom[0] || '?').toUpperCase())}</button>
        <input class="camp-ajust part-nom" type="text" maxlength="14" value="${U.escapaHTML(p.nom)}"
          placeholder="Nom…" aria-label="Nom del participant">
        <button type="button" class="part-absent" aria-pressed="${p.absent}">${p.absent ? 'ABSENT' : 'PRESENT'}</button>
        <button type="button" class="part-elimina" aria-label="Eliminar" ${Estat.d.participants.length <= 2 ? 'disabled' : ''}>×</button>
        <div class="paleta" role="listbox" aria-label="Colors disponibles"></div>`;
      cont.appendChild(fila);

      const paleta = fila.querySelector('.paleta');
      fila.querySelector('.part-swatch').addEventListener('click', () => {
        const oberta = paleta.classList.contains('oberta');
        cont.querySelectorAll('.paleta').forEach(x => x.classList.remove('oberta'));
        if (!oberta) {
          paleta.innerHTML = PALETA.map(c => {
            const usat = Estat.d.participants.some(q => q.id !== p.id && q.color === c.hex);
            return `<button type="button" class="paleta-mostra ${p.color === c.hex ? 'triada' : ''}"
              style="background:${c.hex}" title="${c.nom}" data-hex="${c.hex}" ${usat ? 'disabled' : ''}></button>`;
          }).join('');
          paleta.querySelectorAll('.paleta-mostra:not(:disabled)').forEach(b => {
            b.addEventListener('click', () => {
              p.color = b.dataset.hex;
              Estat.desa();
              Main.refrescaRoda();
              pintaAjustos();
            });
          });
          paleta.classList.add('oberta');
        }
      });
      const inp = fila.querySelector('.part-nom');
      inp.addEventListener('change', () => {
        let v = inp.value.trim().slice(0, 14);
        if (!v) v = 'Jugador ' + (i + 1);
        p.nom = v; inp.value = v;
        Estat.desa();
        Main.refrescaRoda();
      });
      fila.querySelector('.part-absent').addEventListener('click', () => {
        p.absent = !p.absent;
        Estat.desa();
        Main.refrescaRoda();
        pintaAjustos();
        comprovaActius();
      });
      fila.querySelector('.part-elimina').addEventListener('click', async () => {
        if (Estat.d.participants.length <= 2) return;
        const ok = await confirma('ELIMINAR PARTICIPANT',
          `${p.nom} sortirà de la roda. El seu registre queda al llibre.`, 'ELIMINAR');
        if (ok) {
          Estat.eliminaParticipant(p.id);
          Main.refrescaRoda();
          pintaAjustos();
        }
      });
    });

    $('campJefe').value = Estat.d.jefe.nom;
    $('ctrlProbTrampa').value = Estat.d.config.probTrampa;
    $('valProbTrampa').textContent = Estat.d.config.probTrampa + '%';
    $('ctrlDurada').value = Estat.d.config.durada;
    $('valDurada').textContent = String(Estat.d.config.durada).replace('.', ',') + ' s';
    $('ctrlCalma').setAttribute('aria-checked', String(!!Estat.d.config.calma));
    comprovaActius();
  }

  function comprovaActius() {
    const n = Estat.actius().length;
    $('avisParticipants').textContent =
      n === 0 ? 'Tots els participants són absents: la taula no pot obrir.'
      : n === 1 ? 'Amb un sol participant actiu la roda no té sentit: la taula queda tancada.'
      : Estat.d.participants.length >= 12 ? 'La taula admet fins a 12 participants.' : '';
  }

  function muntaAjustos() {
    $('btnAjustos').addEventListener('click', () => {
      if (Main.estat() !== 'repos') { avis('La bola és a la pista. Els ajustos esperen que la tirada acabi.'); return; }
      obreAjustos();
    });
    $('btnTancarAjustos').addEventListener('click', tancaAjustos);
    ajustosEl().addEventListener('click', e => { if (e.target === ajustosEl()) tancaAjustos(); });
    $('btnAfegirParticipant').addEventListener('click', () => {
      if (Estat.d.participants.length >= 12) { comprovaActius(); return; }
      const p = Estat.nouParticipant();
      p.nom = 'Jugador ' + Estat.d.participants.length;
      Estat.desa();
      Main.refrescaRoda();
      pintaAjustos();
      const inputs = $('llistaParticipants').querySelectorAll('.part-nom');
      const ult = inputs[inputs.length - 1];
      if (ult) { ult.focus(); ult.select(); }
    });
    $('campJefe').addEventListener('change', () => {
      const v = $('campJefe').value.trim().slice(0, 14) || 'Jefe';
      Estat.d.jefe.nom = v;
      $('campJefe').value = v;
      Estat.desa();
      Main.refrescaRoda();
    });
    $('ctrlProbTrampa').addEventListener('input', () => {
      Estat.d.config.probTrampa = parseInt($('ctrlProbTrampa').value, 10);
      $('valProbTrampa').textContent = Estat.d.config.probTrampa + '%';
      Estat.desa();
    });
    $('ctrlDurada').addEventListener('input', () => {
      Estat.d.config.durada = parseFloat($('ctrlDurada').value);
      $('valDurada').textContent = String(Estat.d.config.durada).replace('.', ',') + ' s';
      Estat.desa();
    });
    $('ctrlCalma').addEventListener('click', () => {
      Estat.d.config.calma = !Estat.d.config.calma;
      $('ctrlCalma').setAttribute('aria-checked', String(Estat.d.config.calma));
      document.body.classList.toggle('mode-calma', Estat.d.config.calma || reduitMoviment);
      Estat.desa();
    });
    $('btnNovaSessio').addEventListener('click', async () => {
      const ok = await confirma('OBRIR UNA SESSIÓ NOVA',
        `La sessió #${U.dosDigits(Estat.d.sessio)} quedarà arxivada al registre i la numeració tornarà a #001.`,
        'OBRIR SESSIÓ');
      if (!ok) return;
      tancaAjustos();
      const cortina = $('cortina');
      cortina.querySelector('.cortina-sub').textContent =
        `S'OBRE LA SESSIÓ #${U.dosDigits(Estat.d.sessio + 1)}`;
      cortina.classList.add('visible');
      cortina.setAttribute('aria-hidden', 'false');
      Cine.cortina(cortina.querySelector('.cortina-retol'));
      setTimeout(() => {
        Estat.novaSessio();
        refrescaComptadors();
        refrescaBoto();
      }, 700);
      setTimeout(() => {
        cortina.classList.remove('visible');
        cortina.setAttribute('aria-hidden', 'true');
      }, 2300);
    });
  }

  /* ─── botó de silenci ─── */
  function refrescaSilenci() {
    $('btnSilenci').classList.toggle('silenciat', !!Estat.d.config.silenci);
    $('btnSilenci').setAttribute('aria-label',
      Estat.d.config.silenci ? 'Activar el so' : 'Silenciar el so');
  }
  function commutaSilenci() {
    Estat.d.config.silenci = !Estat.d.config.silenci;
    Estat.desa();
    Audio.assegura();
    Audio.silencia(Estat.d.config.silenci);
    refrescaSilenci();
  }

  /* ─── teclat ─── */
  function muntaTeclat() {
    window.addEventListener('keydown', e => {
      const alCamp = /^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
      if (e.key === 'Escape') {
        if (confirmaOberta()) { tancaConfirma(false); return; }
        if (Celebracio.oberta) { if (Celebracio.tanca()) return; }
        if (Registre.fitxaOberta()) { Registre.tancaFitxa(); return; }
        if (ajustosOberts()) { tancaAjustos(); return; }
        if (Registre.oberta()) { Registre.tanca(); return; }
        return;
      }
      if (e.key === 'Enter' && confirmaOberta()) { tancaConfirma(true); return; }
      /* barra espaiadora: tira (fora dels camps dels ajustos) */
      if (e.code === 'Space' && !alCamp) {
        if (confirmaOberta() || Registre.oberta() || ajustosOberts() || Celebracio.oberta) return;
        e.preventDefault();
        Main.tirar();
        return;
      }
      if ((e.key === 'm' || e.key === 'M') && !alCamp) commutaSilenci();
    });
  }

  /* ─── inicialització ─── */
  function init() {
    btnTirar = $('btnTirar');
    btnTirarText = $('btnTirarText');
    croupierEl = $('croupier');
    avisEl = $('avis');
    generaSoroll();
    entrada();
    refrescaSilenci();
    /* qui demana moviment reduït rep el mode calma visual, sense
       tocar la seva configuració desada */
    reduitMoviment = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.body.classList.toggle('mode-calma', !!Estat.d.config.calma || reduitMoviment);

    btnTirar.addEventListener('click', () => Main.tirar());
    btnTirar.addEventListener('pointerenter', () => { if (!btnTirar.disabled) Audio.hoverBoto(); });
    /* reflex especular del llautó que segueix el ratolí */
    btnTirar.addEventListener('pointermove', e => {
      const r = btnTirar.getBoundingClientRect();
      btnTirar.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      btnTirar.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
    $('btnSilenci').addEventListener('click', commutaSilenci);
    $('btnRegistre').addEventListener('click', () => {
      if (Main.estat() !== 'repos') { avis('La bola és a la pista. El llibre s’obre quan la tirada acabi.'); return; }
      Registre.obre();
    });
    $('confirmAccepta').addEventListener('click', () => tancaConfirma(true));
    $('confirmCancella').addEventListener('click', () => tancaConfirma(false));
    $('confirmacio').addEventListener('click', e => { if (e.target === $('confirmacio')) tancaConfirma(false); });
    muntaAjustos();
    muntaTeclat();

    /* el so només pot néixer d'un gest de l'usuari */
    const gest = () => {
      Audio.assegura();
      Audio.silencia(Estat.d.config.silenci);
    };
    window.addEventListener('pointerdown', gest, { once: true, capture: true });
    window.addEventListener('keydown', gest, { once: true, capture: true });
  }

  function refresca() {
    refrescaComptadors();
    refrescaLlegenda();
    refrescaBoto();
  }

  return {
    init, refresca, refrescaBoto, croupier,
    bloquejaTirada, alliberaTirada,
    avis, avisPersistent, confirma,
    ajustosOberts, tancaAjustos,
    botoTirar: () => btnTirar,
  };
})();
