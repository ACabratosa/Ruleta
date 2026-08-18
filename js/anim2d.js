/* ════════════════════════════════════════════════════════════════
   LA RODA: RENDERITZAT I ANIMACIÓ DE LA TIRADA
   ════════════════════════════════════════════════════════════════
   Tres capes de canvas dins d'un pla amb rotateX:
     cnvBol  — el bol: fusta, llautó, pista i deflectors (estàtic)
     cnvRoda — el cap que gira, dibuixat un cop fora de pantalla
     cnvFx   — bola, ombres, flaixos, llum dinàmica, trampa
   En repòs el bucle de dibuix s'atura del tot; el reflex lent del
   llautó el fa el CSS. */

const Anim = (() => {
  const TILT = 54 * Math.PI / 180;      // ha de coincidir amb --tilt
  const ALT_FACTOR = Math.tan(TILT);    // desplaçament en pla que simula alçada
  /* geometria i física canòniques, compartides amb la roda 3D */
  const RD = Fisica.RD;
  const PORT_ANGLE = Fisica.PORT_ANGLE;
  const N_DEFLECTORS = Fisica.N_DEFLECTORS;

  let stage, elPla, cnvBol, cnvRoda, cnvFx, xB, xR, xF;
  let midaCss = 0, escala = 1, R = 0, centre = 0;
  let roda = null;                 // model actual (generaRoda)
  let capOff = null;               // canvas fora de pantalla del cap
  let fontsCache = null;           // mides de lletra cachejades (mai al bucle)
  let W = -Math.PI / 2;            // angle actual de la roda (persistent)
  let rafId = 0, ultimT = 0;
  let tirada = null;               // pla de la tirada en curs
  let flaixos = [];                // {angleLocal, t0}
  let ones = [];                   // {x, y, t0} — ones expansives d'impacte
  let brillantors = [];            // {idx, t0, dur} — juntura de la casella
  let trapa = null;                // {idx, p, mode} — fulles del fons
  let bolaExtra = null;            // dibuix manual de la bola (trampa)
  let cuaBola = [];                // rastre curt de la bola
  let cbEvents = null;
  let acabaTirada = null;

  /* ═══ CONSTRUCCIÓ DELS CANVASOS ═══ */
  function init(refs) {
    stage = refs.stage; elPla = refs.pla;
    cnvBol = refs.bol; cnvRoda = refs.roda; cnvFx = refs.fx;
    xB = cnvBol.getContext('2d');
    xR = cnvRoda.getContext('2d');
    xF = cnvFx.getContext('2d');
  }

  function redimensiona() {
    const caixa = stage.getBoundingClientRect();
    if (caixa.width < 40 || caixa.height < 40) return;
    /* el pla inclinat es projecta més ample a baix (perspectiva) i més
       curt en alçada: apliquem una mida provisional, MESUREM el
       rectangle projectat real i ajustem en una passada */
    const aplicaMida = s => {
      midaCss = Math.round(s);
      R = midaCss / 2; centre = midaCss / 2;
      elPla.style.width = midaCss + 'px';
      elPla.style.height = midaCss + 'px';
    };
    elPla.style.marginTop = '0px';
    aplicaMida(Math.max(240, Math.min(caixa.width / 1.05, caixa.height / 0.66)));
    let rect = elPla.getBoundingClientRect();
    const f = Math.min((caixa.width * 0.99) / rect.width, (caixa.height * 0.985) / rect.height);
    aplicaMida(Math.max(240, midaCss * f));
    rect = elPla.getBoundingClientRect();
    /* centrem la projecció dins de l'escenari */
    const dy = (caixa.top + caixa.height / 2) - (rect.top + rect.height / 2);
    elPla.style.marginTop = Math.round(dy) + 'px';
    rect = elPla.getBoundingClientRect();
    /* el focus dels últims segons apunta exactament a la roda */
    const arrel = document.documentElement.style;
    arrel.setProperty('--focusX', Math.round(rect.left + rect.width / 2) + 'px');
    arrel.setProperty('--focusY', Math.round(rect.top + rect.height / 2) + 'px');
    arrel.setProperty('--focusRx', Math.round(rect.width * 0.62) + 'px');
    arrel.setProperty('--focusRy', Math.round(rect.height * 0.66) + 'px');

    const dpr = Math.min(2.5, (window.devicePixelRatio || 1) * 1.35);
    escala = dpr;
    for (const c of [cnvBol, cnvRoda, cnvFx]) {
      c.width = Math.round(midaCss * dpr);
      c.height = Math.round(midaCss * dpr);
    }
    reconstrueix(roda);
  }

  /* mides de lletra: es calculen UN COP aquí, mai dins del bucle */
  const FONT_NOMS = '"Cinzel","Palatino Linotype",Georgia,serif';
  function calculaFonts() {
    if (!roda) return;
    const ctx = capOff.getContext('2d');
    const bandaNom = (RD.nomExt - RD.nomInt) * R - R * 0.028;
    fontsCache = { num: Math.round(R * 0.070), noms: new Map() };
    const base = Math.round(R * 0.056);
    const provats = new Map();
    for (const c of roda.caselles) {
      const nom = c.propietari ? c.propietari.nom : Estat.d.jefe.nom;
      if (provats.has(nom)) continue;
      let f = base;
      ctx.font = `700 ${f}px ${FONT_NOMS}`;
      let amp = ctx.measureText(nom.toUpperCase()).width;
      if (amp > bandaNom) f = Math.max(7, Math.floor(f * bandaNom / amp));
      provats.set(nom, f);
    }
    fontsCache.noms = provats;
  }

  /* ─── El bol estàtic ─── */
  function dibuixaBol() {
    const g = xB;
    g.setTransform(escala, 0, 0, escala, 0, 0);
    g.clearRect(0, 0, midaCss, midaCss);
    g.save();
    g.translate(centre, centre);

    /* ombra de contacte sobre el tapet */
    let sh = g.createRadialGradient(0, R * 0.05, R * RD.ext * 0.86, 0, R * 0.05, R * 1.02);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(0.75, 'rgba(2,6,4,0.5)');
    sh.addColorStop(1, 'rgba(2,6,4,0)');
    g.fillStyle = sh;
    g.beginPath(); g.arc(0, R * 0.05, R * 1.02, 0, U.TAU); g.fill();

    /* cos exterior de fusta */
    let fusta = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.2, 0, 0, R * RD.ext);
    fusta.addColorStop(0, '#3d2a18');
    fusta.addColorStop(0.65, '#271910');
    fusta.addColorStop(1, '#140c07');
    g.fillStyle = fusta;
    g.beginPath(); g.arc(0, 0, R * RD.ext, 0, U.TAU); g.fill();
    /* veta: anells concèntrics irregulars + estries curtes de fibra */
    g.save();
    g.beginPath(); g.arc(0, 0, R * RD.ext, 0, U.TAU); g.clip();
    for (let i = 0; i < 26; i++) {
      const rr = R * (0.55 + 0.45 * (i / 26)) * RD.ext;
      g.beginPath();
      g.arc(R * 0.02 * Math.sin(i * 2.3), R * 0.015 * Math.cos(i * 1.7), rr, 0, U.TAU);
      g.strokeStyle = `rgba(${i % 2 ? '96,64,34' : '20,12,6'},${0.05 + 0.04 * Math.sin(i * 5)})`;
      g.lineWidth = 1 + (i % 3);
      g.stroke();
    }
    /* estries: trams curts d'arc que trenquen la regularitat dels anells */
    for (let i = 0; i < 46; i++) {
      const rr = R * (0.72 + 0.27 * ((i * 0.618) % 1)) * RD.ext;
      const a0 = (i * 2.399) % U.TAU;         // dispersió àuria
      const span = 0.15 + ((i * 1.7) % 1) * 0.55;
      g.beginPath();
      g.arc(0, 0, rr, a0, a0 + span);
      g.strokeStyle = i % 3 ? 'rgba(112,74,40,0.06)' : 'rgba(16,9,4,0.09)';
      g.lineWidth = 0.7 + (i % 2);
      g.stroke();
    }
    g.restore();

    /* cantell de llautó polit */
    anellLlauto(g, R * RD.ext, R * RD.llautoInt, 1);
    /* pista de la bola: fusta lacada fosca amb gola */
    let pista = g.createRadialGradient(0, 0, R * RD.pistaInt, 0, 0, R * RD.llautoInt);
    pista.addColorStop(0, '#1a100a');
    pista.addColorStop(0.35, '#2e1d11');
    pista.addColorStop(0.75, '#241610');
    pista.addColorStop(1, '#140c07');
    anell(g, R * RD.llautoInt, R * RD.pistaInt, pista);
    /* reflex fix del focus sobre la pista */
    g.save();
    g.globalCompositeOperation = 'screen';
    let refl = g.createLinearGradient(-R, -R, R * 0.4, R * 0.4);
    refl.addColorStop(0, 'rgba(255,220,150,0.10)');
    refl.addColorStop(0.5, 'rgba(255,220,150,0.02)');
    refl.addColorStop(1, 'rgba(255,220,150,0)');
    anell(g, R * RD.llautoInt, R * RD.pistaInt, refl);
    g.restore();
    /* filet interior de la pista */
    anellLlauto(g, R * (RD.pistaInt + 0.006), R * (RD.pistaInt - 0.006), 0.6);

    /* davantal inclinat cap a les caselles */
    let dav = g.createRadialGradient(0, 0, R * RD.davantalInt, 0, 0, R * RD.pistaInt);
    dav.addColorStop(0, '#170e08');
    dav.addColorStop(0.5, '#241710');
    dav.addColorStop(1, '#2c1c12');
    anell(g, R * RD.pistaInt, R * RD.davantalInt, dav);

    /* rombes deflectors de llautó, orientació alternada */
    for (let i = 0; i < N_DEFLECTORS; i++) {
      const a = i * U.TAU / N_DEFLECTORS + Math.PI / 8;
      g.save();
      g.rotate(a);
      g.translate(R * RD.deflector, 0);
      if (i % 2) g.rotate(Math.PI / 2);
      const L = R * 0.052, A = R * 0.020;
      g.save(); /* ombra pròpia */
      g.translate(R * 0.004, R * 0.008);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      rombe(g, L, A); g.fill();
      g.restore();
      let mt = g.createLinearGradient(-L, -A, L, A);
      mt.addColorStop(0, '#e9d190');
      mt.addColorStop(0.45, '#b08d3b');
      mt.addColorStop(1, '#63490f');
      g.fillStyle = mt;
      rombe(g, L, A); g.fill();
      g.strokeStyle = 'rgba(46,32,8,0.8)';
      g.lineWidth = Math.max(0.6, R * 0.0022);
      g.stroke();
      g.restore();
    }

    /* llavi d'ombra just abans del cap giratori */
    let llavi = g.createRadialGradient(0, 0, R * (RD.nomExt - 0.004), 0, 0, R * RD.davantalInt);
    llavi.addColorStop(0, 'rgba(0,0,0,0.62)');
    llavi.addColorStop(1, 'rgba(0,0,0,0)');
    anell(g, R * RD.davantalInt, R * (RD.nomExt - 0.004), llavi);

    /* boca de llançament pneumàtic al cantell */
    g.save();
    g.rotate(PORT_ANGLE);
    g.translate(R * 0.865, 0);
    g.fillStyle = '#0d0805';
    g.beginPath(); g.ellipse(0, 0, R * 0.030, R * 0.020, 0, 0, U.TAU); g.fill();
    let boca = g.createLinearGradient(0, -R * 0.03, 0, R * 0.03);
    boca.addColorStop(0, '#d9ba68'); boca.addColorStop(0.5, '#8a6a22'); boca.addColorStop(1, '#57400e');
    g.strokeStyle = boca;
    g.lineWidth = R * 0.008;
    g.beginPath(); g.ellipse(0, 0, R * 0.030, R * 0.020, 0, 0, U.TAU); g.stroke();
    g.restore();

    g.restore();
  }

  function anell(g, rExt, rInt, estil) {
    g.beginPath();
    g.arc(0, 0, rExt, 0, U.TAU);
    g.arc(0, 0, rInt, 0, U.TAU, true);
    g.fillStyle = estil;
    g.fill('evenodd');
  }
  function anellLlauto(g, rExt, rInt, força) {
    /* llautó amb reflexos direccionals fixos (focus dalt a l'esquerra) */
    const lg = g.createLinearGradient(-rExt, -rExt, rExt * 0.7, rExt * 0.7);
    lg.addColorStop(0, '#e6cd8a');
    lg.addColorStop(0.28, '#b08d3b');
    lg.addColorStop(0.55, '#7a5a20');
    lg.addColorStop(0.78, '#c8a54e');
    lg.addColorStop(1, '#5c440f');
    g.save();
    g.globalAlpha = força;
    anell(g, rExt, rInt, lg);
    g.strokeStyle = 'rgba(20,12,2,0.8)';
    g.lineWidth = Math.max(0.7, (rExt - rInt) * 0.045);
    g.beginPath(); g.arc(0, 0, rExt, 0, U.TAU); g.stroke();
    g.beginPath(); g.arc(0, 0, rInt, 0, U.TAU); g.stroke();
    g.restore();
  }
  function rombe(g, L, A) {
    g.beginPath();
    g.moveTo(-L, 0); g.lineTo(0, -A); g.lineTo(L, 0); g.lineTo(0, A);
    g.closePath();
  }

  /* ─── textures fines per distingir colors semblants (daltonisme) ─── */
  const patronsCache = new Map();
  function patroPer(index, ctx) {
    if (patronsCache.has(index)) return patronsCache.get(index);
    const t = document.createElement('canvas');
    t.width = t.height = 12;
    const p = t.getContext('2d');
    p.strokeStyle = p.fillStyle = 'rgba(241,231,204,0.10)';
    p.lineWidth = 1.2;
    const tipus = index % 4;
    p.beginPath();
    if (tipus === 0) { p.moveTo(-3, 15); p.lineTo(15, -3); p.moveTo(-3, 9); p.lineTo(9, -3); p.moveTo(3, 15); p.lineTo(15, 3); p.stroke(); }
    else if (tipus === 1) { p.moveTo(-3, -3); p.lineTo(15, 15); p.moveTo(3, -3); p.lineTo(15, 9); p.moveTo(-3, 3); p.lineTo(9, 15); p.stroke(); }
    else if (tipus === 2) { p.moveTo(0, 3); p.lineTo(12, 3); p.moveTo(0, 9); p.lineTo(12, 9); p.stroke(); }
    else { p.arc(3, 3, 1.1, 0, U.TAU); p.fill(); p.beginPath(); p.arc(9, 9, 1.1, 0, U.TAU); p.fill(); }
    const patró = ctx.createPattern(t, 'repeat');
    patronsCache.set(index, patró);
    return patró;
  }

  /* ─── El cap giratori, dibuixat fora de pantalla ─── */
  function dibuixaCap() {
    /* la roda 3D reutilitza aquest canvas com a textura: es pinta
       sempre amb un mínim de supersampling perquè no perdi nitidesa */
    const escalaCap = Math.max(escala, 2);
    capOff = document.createElement('canvas');
    capOff.width = capOff.height = Math.round(midaCss * escalaCap);
    const g = capOff.getContext('2d');
    g.setTransform(escalaCap, 0, 0, escalaCap, 0, 0);
    g.translate(centre, centre);
    if (!roda) return;
    calculaFonts();
    const pas = roda.pas;
    const idxColor = new Map(Estat.d.participants.map((p, i) => [p.id, i]));

    /* base del cap */
    let base = g.createRadialGradient(0, 0, R * RD.cellaInt, 0, 0, R * RD.nomExt);
    base.addColorStop(0, '#17100a'); base.addColorStop(1, '#0e0906');
    anell(g, R * RD.nomExt, R * RD.cellaInt, base);

    for (let i = 0; i < roda.total; i++) {
      const c = roda.caselles[i];
      const a0 = i * pas - pas / 2, a1 = i * pas + pas / 2;
      const color = c.propietari ? c.propietari.color : COLOR_JEFE;
      const nom = c.propietari ? c.propietari.nom : Estat.d.jefe.nom;
      const iPart = c.propietari ? idxColor.get(c.propietari.id) : -1;

      /* franja de nom (anell exterior): el mateix color, enfosquit */
      g.beginPath();
      g.arc(0, 0, R * RD.nomExt, a0, a1);
      g.arc(0, 0, R * RD.nomInt, a1, a0, true);
      g.closePath();
      g.fillStyle = ombreja(color, 0.82);
      g.fill();
      if (iPart >= 0) { g.save(); g.clip(); g.fillStyle = patroPer(iPart, g); g.fillRect(-R, -R, 2 * R, 2 * R); g.restore(); }

      /* cel·la del número */
      g.beginPath();
      g.arc(0, 0, R * RD.cellaExt, a0, a1);
      g.arc(0, 0, R * RD.cellaInt, a1, a0, true);
      g.closePath();
      const grad = g.createRadialGradient(0, 0, R * RD.cellaInt, 0, 0, R * RD.cellaExt);
      grad.addColorStop(0, ombreja(color, 0.9));
      grad.addColorStop(0.75, color);
      grad.addColorStop(1, ombreja(color, 0.93));
      g.fillStyle = grad;
      g.fill();
      if (iPart >= 0) { g.save(); g.clip(); g.fillStyle = patroPer(iPart, g); g.fillRect(-R, -R, 2 * R, 2 * R); g.restore(); }
      /* fons de la casella: gola on reposa la bola */
      g.beginPath();
      g.arc(0, 0, R * (RD.repos + 0.026), a0, a1);
      g.arc(0, 0, R * (RD.repos - 0.026), a1, a0, true);
      g.closePath();
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fill();

      /* número, amb el peu cap al centre com a la roda real */
      g.save();
      g.rotate(i * pas);
      g.translate(R * RD.num, 0);
      g.rotate(-Math.PI / 2);
      g.font = `700 ${fontsCache.num}px Consolas,"Cascadia Mono",monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      /* contorn fosc: el número aguanta sobre qualsevol color de fons */
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(16,10,4,0.85)';
      g.lineWidth = Math.max(2, fontsCache.num * 0.16);
      g.strokeText(String(c.num), 0, 0);
      g.fillStyle = '#F8EFD6';
      g.fillText(String(c.num), 0, 0);
      g.restore();

      /* nom alineat radialment dins la franja */
      g.save();
      g.rotate(i * pas);
      const f = fontsCache.noms.get(nom) || 10;
      g.font = `700 ${f}px ${FONT_NOMS}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const rMig = R * (RD.nomExt + RD.nomInt) / 2;
      g.translate(rMig, 0);
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(14,9,4,0.8)';
      g.lineWidth = Math.max(1.6, f * 0.16);
      g.strokeText(nom.toUpperCase(), 0, 0);
      g.fillStyle = 'rgba(250,243,222,0.98)';
      g.fillText(nom.toUpperCase(), 0, 0);
      g.restore();
    }

    /* separadors metàl·lics entre caselles, amb ombra pròpia */
    for (let i = 0; i < roda.total; i++) {
      const b = i * pas + pas / 2;
      g.save();
      g.rotate(b);
      const y = Math.max(1.1, R * 0.006);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(R * RD.cellaInt, -y / 2 + R * 0.004, R * (RD.nomExt - RD.cellaInt), y);
      const mg = g.createLinearGradient(0, -y, 0, y);
      mg.addColorStop(0, '#ecd590'); mg.addColorStop(0.5, '#a5823a'); mg.addColorStop(1, '#57400e');
      g.fillStyle = mg;
      g.fillRect(R * RD.cellaInt, -y / 2, R * (RD.nomExt - RD.cellaInt), y);
      /* cap del separador al cantell exterior */
      g.beginPath();
      g.arc(R * RD.cellaExt, 0, y * 1.15, 0, U.TAU);
      g.fillStyle = '#d9ba68';
      g.fill();
      g.restore();
    }

    /* filets de llautó que tanquen les bandes */
    anellLlauto(g, R * (RD.nomExt + 0.006), R * (RD.nomExt - 0.004), 0.85);
    anellLlauto(g, R * (RD.nomInt + 0.004), R * (RD.nomInt - 0.004), 0.55);
    anellLlauto(g, R * (RD.cellaInt + 0.005), R * (RD.cellaInt - 0.005), 0.7);

    /* con central de llautó */
    let con = g.createRadialGradient(-R * 0.10, -R * 0.12, R * 0.02, 0, 0, R * RD.con);
    con.addColorStop(0, '#e2c67c');
    con.addColorStop(0.4, '#b08d3b');
    con.addColorStop(0.8, '#6e5217');
    con.addColorStop(1, '#4a370c');
    g.beginPath(); g.arc(0, 0, R * RD.con, 0, U.TAU);
    g.fillStyle = con; g.fill();
    /* reflexos radials suaus del con */
    g.save();
    g.beginPath(); g.arc(0, 0, R * RD.con, 0, U.TAU); g.clip();
    for (let i = 0; i < 5; i++) {
      const a = -0.8 + i * (U.TAU / 5);
      const lg = g.createLinearGradient(0, 0, Math.cos(a) * R * RD.con, Math.sin(a) * R * RD.con);
      lg.addColorStop(0, 'rgba(255,240,200,0)');
      lg.addColorStop(0.7, i % 2 ? 'rgba(255,240,200,0.05)' : 'rgba(40,28,4,0.10)');
      lg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, R * RD.con, a - 0.35, a + 0.35);
      g.closePath(); g.fill();
    }
    g.restore();

    /* torreta amb braços daurats en creu */
    for (let i = 0; i < 4; i++) {
      g.save();
      g.rotate(i * Math.PI / 2 + Math.PI / 4);
      const L = R * RD.torreta, A = R * 0.024;
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath(); g.roundRect(-A, -A + R * 0.006, L + A, A * 2, A); g.fill();
      const bg = g.createLinearGradient(0, -A, 0, A);
      bg.addColorStop(0, '#f0d894'); bg.addColorStop(0.5, '#b08d3b'); bg.addColorStop(1, '#5c440f');
      g.fillStyle = bg;
      g.beginPath(); g.roundRect(-A, -A, L + A, A * 2, A); g.fill();
      /* pom esfèric a l'extrem del braç */
      const pom = g.createRadialGradient(L - A * 0.4, -A * 0.5, A * 0.2, L, 0, A * 1.85);
      pom.addColorStop(0, '#f6e6ae'); pom.addColorStop(0.55, '#c09a42'); pom.addColorStop(1, '#57400e');
      g.beginPath(); g.arc(L, 0, A * 1.8, 0, U.TAU);
      g.fillStyle = pom; g.fill();
      g.restore();
    }
    /* eix central */
    const eix = g.createRadialGradient(-R * 0.03, -R * 0.035, R * 0.01, 0, 0, R * RD.eix);
    eix.addColorStop(0, '#f4e3a4');
    eix.addColorStop(0.5, '#c09a42');
    eix.addColorStop(1, '#4e390d');
    g.beginPath(); g.arc(0, 0, R * RD.eix, 0, U.TAU);
    g.fillStyle = eix; g.fill();
    g.strokeStyle = 'rgba(30,20,4,0.7)';
    g.lineWidth = Math.max(0.8, R * 0.004);
    g.stroke();
    g.beginPath(); g.arc(0, 0, R * RD.eix * 0.45, 0, U.TAU);
    g.fillStyle = 'rgba(20,13,3,0.45)'; g.fill();
  }

  /* enfosqueix un color hex */
  function ombreja(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return `rgb(${r},${g},${b})`;
  }

  function reconstrueix(model) {
    if (model) roda = model;
    if (!roda || !midaCss) return;
    dibuixaBol();
    dibuixaCap();
    pintaQuiet();
  }

  /* pinta un únic fotograma (estat de repòs) i deixa el bucle aturat */
  function pintaQuiet() {
    pintaRoda();
    xF.setTransform(escala, 0, 0, escala, 0, 0);
    xF.clearRect(0, 0, midaCss, midaCss);
    if (tirada || bolaExtra) return;
    /* bola en repòs, adormida a la casella de l'última tirada */
    if (ultimaCasella >= 0 && roda && ultimaCasella < roda.total) {
      const a = W + ultimaCasella * roda.pas;
      dibuixaBola(xF, Math.cos(a) * R * RD.repos + centre, Math.sin(a) * R * RD.repos + centre, 0, 1);
    }
  }
  let ultimaCasella = -1;

  function pintaRoda() {
    xR.setTransform(escala, 0, 0, escala, 0, 0);
    xR.clearRect(0, 0, midaCss, midaCss);
    xR.save();
    xR.translate(centre, centre);
    xR.rotate(W);
    xR.drawImage(capOff, -centre, -centre, midaCss, midaCss);
    xR.restore();
  }

  function dibuixaBola(g, x, y, alçada, alfa) {
    const rb = R * 0.033;
    /* ombra que es mou amb la bola i s'allunya quan salta */
    const sepOmbra = R * 0.008 + alçada * R * 0.05;
    g.save();
    g.globalAlpha = alfa * Math.max(0.18, 0.5 - alçada * 0.3);
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(x + sepOmbra * 0.4, y + sepOmbra, rb * (1 + alçada * 0.35), rb * 0.6, 0, 0, U.TAU);
    g.fill();
    g.restore();
    /* la bola, desplaçada cap amunt en el pla per simular l'alçada */
    const yD = y - alçada * R * 0.05 * ALT_FACTOR;
    g.save();
    g.globalAlpha = alfa;
    const grad = g.createRadialGradient(x - rb * 0.4, yD - rb * 0.5, rb * 0.1, x, yD, rb * 1.15);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, '#f3ecdb');
    grad.addColorStop(0.75, '#c9bfa6');
    grad.addColorStop(1, '#847b66');
    g.beginPath(); g.arc(x, yD, rb, 0, U.TAU);
    g.fillStyle = grad; g.fill();
    /* reflex especular puntual */
    g.beginPath(); g.arc(x - rb * 0.35, yD - rb * 0.42, rb * 0.22, 0, U.TAU);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fill();
    g.restore();
  }

  /* ═══ EXECUCIÓ DE LA TIRADA ═══
     El pla i la màquina d'estats viuen a Fisica; aquí només es pinta.
     Els esdeveniments passen per un embolcall que situa flaixos i
     ones abans de reenviar-los a l'orquestrador. */
  function tira(idxObjectiu, durada, cb) {
    return new Promise(res => {
      cbEvents = cb || (() => {});
      acabaTirada = res;
      const pla = Fisica.plaTirada(W, roda, idxObjectiu, durada);
      const viva = Fisica.novaTirada(pla, roda, ev => {
        if (ev.tipus === 'clic') flaixSeparador(ev.rel);
        else if (ev.tipus === 'deflector') flaixDeflector(ev.beta);
        else if (ev.tipus === 'assentada') {
          ones.push({
            x: centre + Math.cos(ev.beta) * R * ev.radi,
            y: centre + Math.sin(ev.beta) * R * ev.radi,
            t0: performance.now(),
          });
        }
        cbEvents(ev);
      });
      tirada = { pla, viva, ultim: null };
      ultimaCasella = -1;
      cuaBola = [];
      document.body.classList.add('tirant');
      arrencaBucle();
    });
  }

  function passaTirada(dt) {
    const r = tirada.viva.pas(dt);
    W = r.W;
    tirada.ultim = r;
    if (r.acabada) {
      /* roda aturada del tot: la tirada acaba, la bola queda assentada */
      ultimaCasella = tirada.pla.idxObjectiu;
      const fi = acabaTirada;
      tirada = null;
      acabaTirada = null;
      document.body.classList.remove('tirant');
      pintaQuiet();
      fi && fi();
      return null;
    }
    return r.p;
  }

  function flaixSeparador(relAngle) {
    /* juntura més propera en coordenades de la roda */
    const b = (Math.round(relAngle / roda.pas - 0.5) + 0.5) * roda.pas;
    flaixos.push({ angleLocal: b, t0: performance.now() });
    if (flaixos.length > 10) flaixos.shift();
  }
  function flaixDeflector(beta) {
    let millor = 0, dist = 1e9;
    for (let j = 0; j < N_DEFLECTORS; j++) {
      const a = j * U.TAU / N_DEFLECTORS + Math.PI / 8;
      const d = Math.abs(U.difAngular(beta, a));
      if (d < dist) { dist = d; millor = a; }
    }
    flaixos.push({ angleLocal: millor, t0: performance.now(), deflector: true });
  }

  /* ═══ BUCLE DE DIBUIX ═══ */
  function arrencaBucle() {
    if (!rafId) {
      ultimT = performance.now();
      rafId = requestAnimationFrame(fotograma);
    }
  }
  function calAnimar() {
    return !!(tirada || flaixos.length || ones.length || brillantors.length || trapa || bolaExtra);
  }
  function fotograma(ara) {
    rafId = 0;
    const dt = Math.min(0.05, (ara - ultimT) / 1000);
    ultimT = ara;
    let p = null;
    if (tirada) {
      p = passaTirada(dt);
      if (tirada) pintaRoda();
      const velRodaAra = tirada && tirada.ultim ? Math.abs(tirada.ultim.velRoda) : 0;
      Audio.fotogramaTirada(tirada ? {
        velRoda: velRodaAra,
        velBola: Math.abs(p ? p.velBola : 0),
        enPista: p ? p.radi > RD.pistaInt : false,
      } : null);
      /* desenfocament de moviment quan la roda va de debò */
      cnvRoda.classList.toggle('mou', velRodaAra > 3.1);
    } else if (cnvRoda.classList.contains('mou')) {
      cnvRoda.classList.remove('mou');
    }

    /* capa d'efectes */
    const g = xF;
    g.setTransform(escala, 0, 0, escala, 0, 0);
    g.clearRect(0, 0, midaCss, midaCss);
    g.save();
    g.translate(centre, centre);

    /* llum dinàmica: un focus fix del món es reflecteix al llautó del
       con mentre la roda gira sota seu */
    if (tirada) {
      g.save();
      g.globalCompositeOperation = 'screen';
      const aLlum = -1.1;
      const lg = g.createLinearGradient(Math.cos(aLlum) * R * 0.5, Math.sin(aLlum) * R * 0.5,
                                        -Math.cos(aLlum) * R * 0.3, -Math.sin(aLlum) * R * 0.3);
      const puls = 0.05 + 0.04 * Math.sin(W * 3.1) + 0.03 * Math.sin(W * 7.3 + 1.2);
      lg.addColorStop(0, `rgba(255,232,170,${U.clamp(puls, 0.02, 0.13)})`);
      lg.addColorStop(1, 'rgba(255,232,170,0)');
      g.fillStyle = lg;
      g.beginPath(); g.arc(0, 0, R * RD.con, 0, U.TAU); g.fill();
      g.restore();
    }

    /* flaixos dels separadors i deflectors */
    const araMs = performance.now();
    flaixos = flaixos.filter(f => araMs - f.t0 < 260);
    for (const f of flaixos) {
      const v = 1 - (araMs - f.t0) / 260;
      g.save();
      if (f.deflector) {
        g.rotate(f.angleLocal);
        g.translate(R * RD.deflector, 0);
        g.globalAlpha = v * 0.85;
        g.fillStyle = '#ffe9b0';
        g.shadowColor = '#ffd970'; g.shadowBlur = 14;
        rombe(g, R * 0.055, R * 0.023);
        g.fill();
      } else {
        g.rotate(W + f.angleLocal);
        g.globalAlpha = v * 0.8;
        const y = Math.max(1.4, R * 0.007);
        g.fillStyle = '#ffe9b0';
        g.shadowColor = '#ffd970'; g.shadowBlur = 10;
        g.fillRect(R * RD.cellaInt, -y / 2, R * (RD.nomExt - RD.cellaInt), y);
      }
      g.restore();
    }

    /* brillantor de la juntura del fons (el batec de suspens) */
    brillantors = brillantors.filter(b => araMs - b.t0 < b.dur);
    for (const b of brillantors) {
      const u = (araMs - b.t0) / b.dur;
      const v = Math.sin(Math.min(1, u) * Math.PI);
      const a0 = b.idx * roda.pas - roda.pas / 2, a1 = b.idx * roda.pas + roda.pas / 2;
      g.save();
      g.rotate(W);
      g.globalAlpha = v * 0.9;
      g.strokeStyle = '#ffe9b0';
      g.shadowColor = '#ffd970'; g.shadowBlur = 12;
      g.lineWidth = Math.max(1.2, R * 0.005);
      g.beginPath();
      g.arc(0, 0, R * (RD.repos + 0.028), a0 + 0.008, a1 - 0.008);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, R * (RD.repos - 0.028), a0 + 0.008, a1 - 0.008);
      g.stroke();
      g.restore();
    }

    /* fulles de la trampa al fons de la casella */
    if (trapa) dibuixaTrapa(g);

    g.restore();

    /* ones expansives dels impactes (coordenades absolutes) */
    ones = ones.filter(o => araMs - o.t0 < 340);
    for (const o of ones) {
      const u = (araMs - o.t0) / 340;
      g.save();
      g.globalAlpha = (1 - u) * 0.55;
      g.strokeStyle = '#ffe9b0';
      g.lineWidth = Math.max(1, R * 0.006 * (1 - u));
      g.beginPath();
      g.ellipse(o.x, o.y, R * (0.015 + u * 0.075), R * (0.010 + u * 0.05), 0, 0, U.TAU);
      g.stroke();
      g.restore();
    }

    /* la bola (coordenades absolutes del canvas) */
    if (tirada && p) {
      const alfa = Math.min(1, tirada.t / 0.25);
      const x = centre + Math.cos(p.beta) * R * p.radi;
      const y = centre + Math.sin(p.beta) * R * p.radi;
      cuaBola.push({ x, y });
      if (cuaBola.length > 7) cuaBola.shift();
      /* rastre subtil quan va de pressa */
      if (p.velBola > 4 && cuaBola.length > 2) {
        g.save();
        g.lineCap = 'round';
        for (let i = 1; i < cuaBola.length; i++) {
          g.globalAlpha = (i / cuaBola.length) * 0.16;
          g.strokeStyle = '#f3ecdb';
          g.lineWidth = R * 0.03 * (i / cuaBola.length);
          g.beginPath();
          g.moveTo(cuaBola[i - 1].x, cuaBola[i - 1].y);
          g.lineTo(cuaBola[i].x, cuaBola[i].y);
          g.stroke();
        }
        g.restore();
      }
      dibuixaBola(g, x, y, p.alçada, alfa);
    } else if (bolaExtra) {
      dibuixaBola(g, bolaExtra.x, bolaExtra.y, bolaExtra.alçada || 0, bolaExtra.alfa);
    } else if (!tirada && ultimaCasella >= 0 && roda && ultimaCasella < roda.total) {
      const a = W + ultimaCasella * roda.pas;
      dibuixaBola(g, centre + Math.cos(a) * R * RD.repos, centre + Math.sin(a) * R * RD.repos, 0, 1);
    }

    if (calAnimar()) rafId = requestAnimationFrame(fotograma);
    else { Audio.fotogramaTirada(null); pintaQuiet(); }
  }

  /* ─── la trampa: el fons de la casella cedeix ─── */
  function dibuixaTrapa(g) {
    const { idx, p } = trapa;
    const pas = roda.pas;
    const a0 = idx * pas - pas / 2, a1 = idx * pas + pas / 2;
    g.save();
    g.rotate(W);
    /* forat negre amb un fil de llum del tub a sota */
    g.beginPath();
    g.arc(0, 0, R * (RD.repos + 0.055), a0 + 0.006, a1 - 0.006);
    g.arc(0, 0, R * (RD.repos - 0.055), a1 - 0.006, a0 + 0.006, true);
    g.closePath();
    g.save();
    g.clip();
    g.fillStyle = '#020202';
    g.fill();
    const resplendor = g.createRadialGradient(0, 0, R * (RD.repos - 0.05), 0, 0, R * (RD.repos + 0.05));
    resplendor.addColorStop(0, 'rgba(80,50,10,0)');
    resplendor.addColorStop(0.5, `rgba(190,140,50,${0.14 * p})`);
    resplendor.addColorStop(1, 'rgba(80,50,10,0)');
    g.fillStyle = resplendor;
    g.fill();
    /* les dues fulles metàl·liques que s'obren */
    const mig = idx * pas;
    for (const costat of [-1, 1]) {
      const obertura = p * (pas / 2 - 0.006) * 0.96;
      const b0 = costat < 0 ? a0 + 0.006 : mig + obertura;
      const b1 = costat < 0 ? mig - obertura : a1 - 0.006;
      if (b1 <= b0) continue;
      g.beginPath();
      g.arc(0, 0, R * (RD.repos + 0.055), b0, b1);
      g.arc(0, 0, R * (RD.repos - 0.055), b1, b0, true);
      g.closePath();
      const fulla = g.createLinearGradient(0, -R * 0.05, 0, R * 0.05);
      fulla.addColorStop(0, '#8f8f96');
      fulla.addColorStop(0.5, '#55555c');
      fulla.addColorStop(1, '#2c2c31');
      g.fillStyle = fulla;
      g.fill();
      g.strokeStyle = 'rgba(240,220,160,0.5)';
      g.lineWidth = Math.max(0.8, R * 0.0035);
      g.stroke();
    }
    g.restore();
    g.restore();
  }

  function obreTrampa(idx) {
    return new Promise(res => {
      trapa = { idx, p: 0 };
      ultimaCasella = -1; /* la bola deixa la casella: se'n va pel tub */
      const a = W + idx * roda.pas;
      const x0 = centre + Math.cos(a) * R * RD.repos;
      const y0 = centre + Math.sin(a) * R * RD.repos;
      bolaExtra = { x: x0, y: y0, alfa: 1 };
      arrencaBucle();
      const t0 = performance.now();
      (function pasA() {
        const u = Math.min(1, (performance.now() - t0) / 620);
        trapa.p = U.easeOutCubic(u);
        /* la bola s'enfonsa pel forat */
        if (u > 0.35) {
          const v = U.clamp((u - 0.35) / 0.55, 0, 1);
          bolaExtra.alfa = 1 - v;
          bolaExtra.y = y0 + v * R * 0.045;
        }
        if (u < 1) requestAnimationFrame(pasA);
        else { bolaExtra = null; res(); }
      })();
    });
  }
  function tancaTrampa() {
    return new Promise(res => {
      if (!trapa) return res();
      const t0 = performance.now(), inicial = trapa.p;
      arrencaBucle();
      (function pasT() {
        const u = Math.min(1, (performance.now() - t0) / 420);
        if (trapa) trapa.p = inicial * (1 - U.easeInOutQuad(u));
        if (u < 1) requestAnimationFrame(pasT);
        else { trapa = null; res(); }
      })();
    });
  }

  /* brillantor del batec de suspens */
  function brillaJuntura(idx, dur) {
    brillantors.push({ idx, t0: performance.now(), dur });
    arrencaBucle();
  }

  return {
    init, redimensiona, reconstrueix, tira,
    brillaJuntura, obreTrampa, tancaTrampa,
    esbossaBolaEnRepos: () => { ultimaCasella = -1; pintaQuiet(); },
    get roda() { return roda; },
    /* el cap pintat serveix de textura a la roda 3D */
    capOffscreen: () => capOff,
  };
})();
