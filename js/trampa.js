/* ════════════════════════════════════════════════════════════════
   LA TRAMPA — vista de tall del tub pneumàtic sota la taula
   El fons de la casella cedeix, la bola viatja pel tub de llautó
   i és relançada a la pista. L'SVG es genera per codi.
   ════════════════════════════════════════════════════════════════ */
const Trampa = (() => {
  let elPanell, elEscena, elBanner, elL1, elL2;
  let svgBola = null, svgAgulla = null, svgResplendor = null, camí1 = null, camí2 = null;

  function init(refs) {
    elPanell = refs.panell;
    elEscena = refs.escena;
    elBanner = refs.banner;
    elL1 = elBanner.querySelector('.banner-linia1');
    elL2 = elBanner.querySelector('.banner-linia2');
  }

  /* construeix l'escena de tall (un cop; es reutilitza).
     Dos SVG sobreposats: el primer, amb preserveAspectRatio="none",
     estira les franges horitzontals del tall (tapet, fusta, foscor)
     fins a les vores de la pantalla; el segon, proporcionat, duu la
     maquinària. Totes dues comparteixen l'escala vertical, així que
     les franges continuen sense costures. */
  function construeix() {
    if (svgBola) return;
    elEscena.innerHTML = `
<svg class="trampa-fons" viewBox="0 0 100 430" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="tFons" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#151009"/>
      <stop offset="1" stop-color="#080503"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="100" height="430" fill="url(#tFons)"/>
  <rect x="0" y="22" width="100" height="12" fill="#0B3D2E"/>
  <rect x="0" y="22" width="100" height="4" fill="#14503d"/>
  <rect x="0" y="34" width="100" height="28" fill="#241710"/>
  <rect x="0" y="60" width="100" height="2.5" fill="#7a5a20" opacity=".7"/>
</svg>
<svg viewBox="0 0 1000 430" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <defs>
    <linearGradient id="tLlauto" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d9ba68"/>
      <stop offset=".5" stop-color="#8a6a22"/>
      <stop offset="1" stop-color="#57400e"/>
    </linearGradient>
    <radialGradient id="tBola" cx=".35" cy=".3" r="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".5" stop-color="#efe6d2"/>
      <stop offset="1" stop-color="#8f8672"/>
    </radialGradient>
    <radialGradient id="tGlow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="rgba(255,200,90,.55)"/>
      <stop offset="1" stop-color="rgba(255,200,90,0)"/>
    </radialGradient>
  </defs>

  <!-- pou del bol de la ruleta, vist en tall -->
  <path d="M250,62 Q410,150 570,62 Z" fill="#1c1209" stroke="#8a6a22" stroke-width="2"/>
  <path d="M262,64 Q410,142 558,64" fill="none" stroke="#3a2a10" stroke-width="3"/>
  <path d="M396,104 L424,104 L418,62 L402,62 Z" fill="#0a0603" stroke="#57400e" stroke-width="1"/>

  <!-- tub d'entrada -->
  <path id="tCami1" d="M410,96 L410,210 A46,46 0 0 0 456,256 L630,256 A46,46 0 0 1 676,302 L676,330"
        fill="none" stroke="none"/>
  <!-- tub de sortida -->
  <path id="tCami2" d="M724,360 L806,360 A44,44 0 0 0 850,316 L850,10"
        fill="none" stroke="none"/>
  <g id="tTubs"></g>

  <!-- cambra pneumàtica -->
  <rect x="628" y="326" width="96" height="72" rx="8" fill="url(#tLlauto)" stroke="#3a2a08" stroke-width="2.5"/>
  <rect x="636" y="334" width="80" height="56" rx="5" fill="#1c1309" opacity=".82"/>
  <circle id="tResplendor" cx="676" cy="362" r="46" fill="url(#tGlow)" opacity="0"/>
  <text x="676" y="415" text-anchor="middle" font-size="10.5" letter-spacing="3"
        fill="#B9AA88" opacity=".55" font-family="Georgia,serif">AIR COMPRIMÉ</text>

  <!-- manòmetre -->
  <circle cx="640" cy="314" r="17" fill="#efe6cc" stroke="#57400e" stroke-width="3"/>
  <g id="tAgulla" transform="rotate(-120 640 314)">
    <line x1="640" y1="314" x2="640" y2="301" stroke="#7c1e1e" stroke-width="2"/>
  </g>
  <circle cx="640" cy="314" r="2.2" fill="#57400e"/>

  <!-- la bola -->
  <g id="tBolaG" opacity="0">
    <circle id="tBolaOmbra" r="9.5" cy="4" fill="rgba(0,0,0,.4)"/>
    <circle id="tBolaC" r="9" fill="url(#tBola)"/>
    <circle id="tBolaBrill" r="2.4" fill="rgba(255,255,255,.95)"/>
  </g>

  <text x="18" y="418" font-size="10" letter-spacing="3" fill="#B9AA88" opacity=".4"
        font-family="Georgia,serif">SOTA LA TAULA · RETORN PNEUMÀTIC</text>
</svg>`;
    const svg = elEscena.querySelectorAll('svg')[1];
    camí1 = svg.querySelector('#tCami1');
    camí2 = svg.querySelector('#tCami2');
    svgBola = svg.querySelector('#tBolaG');
    svgAgulla = svg.querySelector('#tAgulla');
    svgResplendor = svg.querySelector('#tResplendor');

    /* el tub es dibuixa amb tres traços: cos, ànima i reflex; i es
       reblona seguint la geometria real del camí */
    const grup = svg.querySelector('#tTubs');
    for (const cami of [camí1, camí2]) {
      const d = cami.getAttribute('d');
      grup.innerHTML += `
        <path d="${d}" fill="none" stroke="#2c1f08" stroke-width="34" stroke-linecap="round"/>
        <path d="${d}" fill="none" stroke="url(#tLlauto)" stroke-width="27" stroke-linecap="round"/>
        <path d="${d}" fill="none" stroke="#ecd590" stroke-width="6" stroke-linecap="round" opacity=".35"/>`;
    }
    /* reblons: parells de punts perpendiculars al tub, cada 46 px */
    let reblons = '';
    for (const cami of [camí1, camí2]) {
      const L = cami.getTotalLength();
      for (let s = 20; s < L - 12; s += 46) {
        const p = cami.getPointAtLength(s);
        const p2 = cami.getPointAtLength(Math.min(L, s + 1));
        const nx = -(p2.y - p.y), ny = p2.x - p.x;
        const n = Math.hypot(nx, ny) || 1;
        for (const c of [-1, 1]) {
          reblons += `<circle cx="${(p.x + nx / n * 11 * c).toFixed(1)}" cy="${(p.y + ny / n * 11 * c).toFixed(1)}" r="2" fill="#3f2e0a"/>
                      <circle cx="${(p.x + nx / n * 11 * c - 0.6).toFixed(1)}" cy="${(p.y + ny / n * 11 * c - 0.6).toFixed(1)}" r="0.8" fill="#e8d190"/>`;
        }
      }
      /* brides als colzes */
    }
    grup.innerHTML += reblons;
  }

  function posaBola(cami, f, escala = 1) {
    const L = cami.getTotalLength();
    const p = cami.getPointAtLength(U.clamp(f, 0, 1) * L);
    svgBola.setAttribute('transform', `translate(${p.x},${p.y}) scale(${escala})`);
    return p;
  }

  const espera = ms => new Promise(r => setTimeout(r, ms));

  /* ─── el viatge de la bola pel tub ─── */
  function viatge() {
    return new Promise(res => {
      construeix();
      svgBola.setAttribute('opacity', '1');
      Audio.xiuletAire(0.7);
      const colzes = [0.30, 0.84];   // fraccions del camí d'entrada amb colze
      const fets = new Set();
      const durEntrada = 1.35;
      const t0 = performance.now();
      (function pasE() {
        const u = Math.min(1, (performance.now() - t0) / (durEntrada * 1000));
        /* velocitat variable: cau ràpid, es frena cap a la cambra */
        const f = 1 - Math.pow(1 - u, 1.7);
        const p = posaBola(camí1, f);
        for (const c of colzes) {
          if (!fets.has(c) && f >= c) {
            fets.add(c);
            Audio.copColze((p.x / 1000) * 2 - 1);
            sacsejaPanell();
          }
        }
        if (u < 1) { requestAnimationFrame(pasE); return; }
        /* càrrega pneumàtica: manòmetre i resplendor */
        Audio.carregaPneumatica(0.62);
        const t1 = performance.now();
        (function pasC() {
          const v = Math.min(1, (performance.now() - t1) / 640);
          svgAgulla.setAttribute('transform', `rotate(${-120 + v * 210} 640 314)`);
          svgResplendor.setAttribute('opacity', String(v * 0.9));
          if (v < 1) { requestAnimationFrame(pasC); return; }
          /* expulsió */
          Audio.popPneumatic();
          svgResplendor.setAttribute('opacity', '0');
          const t2 = performance.now();
          (function pasS() {
            const w = Math.min(1, (performance.now() - t2) / 340);
            posaBola(camí2, U.easeInQuad(w) * 0.98 + w * 0.02);
            if (w < 1) { requestAnimationFrame(pasS); return; }
            svgBola.setAttribute('opacity', '0');
            svgAgulla.setAttribute('transform', 'rotate(-120 640 314)');
            res();
          })();
        })();
      })();
    });
  }

  function sacsejaPanell() {
    /* la sacsejada va a l'escena interior: el panell conserva el seu
       transform de posició (obrir/tancar) intacte */
    elEscena.style.transform = 'translateX(3px)';
    setTimeout(() => { elEscena.style.transform = ''; }, 70);
  }

  /* ─── banner d'escalada ─── */
  function banner(nivell, esJefe) {
    elBanner.classList.remove('nivell2', 'nivell3');
    if (nivell === 2) elBanner.classList.add('nivell2');
    if (nivell >= 3) elBanner.classList.add('nivell3');
    elL1.textContent = nivell === 1 ? "S'HA OBERT LA TRAMPA"
                     : nivell === 2 ? 'UNA ALTRA VEGADA?!'
                     : 'AIXÒ JA NO ÉS NORMAL';
    elL2.textContent = esJefe
      ? 'EL JEFE S’ESCAPA · LA INCIDÈNCIA TORNA A LA TAULA'
      : nivell === 1 ? 'SEGONA OPORTUNITAT'
      : nivell === 2 ? 'LA TAULA INSISTEIX'
      : 'REVISEU EL MECANISME';
    elBanner.classList.add('visible');
    Cine.banner(elBanner);
  }

  /* ─── seqüència completa d'una trampa ───
     idx: casella on la bola s'havia assentat
     nivell: 1a, 2a, 3a… trampa seguida dins de la mateixa tirada */
  async function executa(idx, nivell, esJefe) {
    construeix(); /* l'escena del tub ha d'existir ABANS que el panell pugi */
    banner(nivell, esJefe);
    if (nivell === 2) { Audio.alarma(2); document.body.classList.add('emergencia'); }
    if (nivell >= 3) {
      Audio.alarma(3);
      document.body.classList.add('emergencia');
      document.getElementById('app').classList.add('tremola-continu');
      Cine.aberra(430); /* la lent es descompon: la taula s'ha espatllat */
    }
    /* el fons cedeix: fulles metàl·liques i la bola cau */
    await MotorRoda.obreTrampa(idx);
    /* vista de tall, la roda queda un instant amb el forat obert */
    elPanell.classList.add('visible');
    elPanell.setAttribute('aria-hidden', 'false');
    await espera(420);
    await viatge();
    /* la bola ha estat expulsada: el panell marxa i les fulles es
       tanquen darrere seu mentre la tirada recomença */
    elPanell.classList.remove('visible');
    elPanell.setAttribute('aria-hidden', 'true');
    MotorRoda.tancaTrampa();
    setTimeout(() => {
      elBanner.classList.remove('visible');
      document.body.classList.remove('emergencia');
      document.getElementById('app').classList.remove('tremola-continu');
    }, nivell >= 2 ? 1400 : 600);
  }

  return { init, executa };
})();
