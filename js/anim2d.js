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
  const PORT_ANGLE = -1.05;             // boca de llançament (fixa al bol)
  const N_DEFLECTORS = 8;

  /* Radis com a fracció de R */
  const RD = {
    ext: 0.985, llautoInt: 0.905, pistaInt: 0.80, bola: 0.853,
    davantalInt: 0.695, deflector: 0.748,
    nomExt: 0.688, nomInt: 0.552,
    cellaExt: 0.552, cellaInt: 0.418, num: 0.508, repos: 0.472,
    con: 0.418, torreta: 0.30, eix: 0.115,
  };

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

  /* ─── utilitats de perfil ───
     Mostregem un perfil de velocitat arbitrari i el normalitzem:
     pos(1) = 1 exacte. Així el desplaçament total és EXACTAMENT el
     que volem i la forma de la corba només posa el caràcter. */
  function creaPerfil(velFn, n = 400) {
    const acc = new Float64Array(n + 1);
    let s = 0;
    for (let i = 1; i <= n; i++) {
      const x0 = (i - 1) / n, x1 = i / n;
      s += (velFn(x0) + velFn(x1)) / 2 / n; // trapezis
      acc[i] = s;
    }
    const total = acc[n];
    return {
      pos(x) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        const f = x * n, i = Math.floor(f);
        return U.lerp(acc[i], acc[i + 1], f - i) / total;
      },
      vel: x => velFn(U.clamp(x, 0, 1)) / total, // dpos/dx
    };
  }

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
    fontsCache = { num: Math.round(R * 0.062), noms: new Map() };
    const base = Math.round(R * 0.050);
    const provats = new Map();
    for (const c of roda.caselles) {
      const nom = c.propietari ? c.propietari.nom : Estat.d.jefe.nom;
      if (provats.has(nom)) continue;
      let f = base;
      ctx.font = `600 ${f}px ${FONT_NOMS}`;
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
    capOff = document.createElement('canvas');
    capOff.width = capOff.height = Math.round(midaCss * escala);
    const g = capOff.getContext('2d');
    g.setTransform(escala, 0, 0, escala, 0, 0);
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
      g.fillStyle = ombreja(color, 0.62);
      g.fill();
      if (iPart >= 0) { g.save(); g.clip(); g.fillStyle = patroPer(iPart, g); g.fillRect(-R, -R, 2 * R, 2 * R); g.restore(); }

      /* cel·la del número */
      g.beginPath();
      g.arc(0, 0, R * RD.cellaExt, a0, a1);
      g.arc(0, 0, R * RD.cellaInt, a1, a0, true);
      g.closePath();
      const grad = g.createRadialGradient(0, 0, R * RD.cellaInt, 0, 0, R * RD.cellaExt);
      grad.addColorStop(0, ombreja(color, 0.8));
      grad.addColorStop(0.75, color);
      grad.addColorStop(1, ombreja(color, 0.85));
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
      g.font = `${fontsCache.num}px Consolas,"Cascadia Mono",monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillText(String(c.num), 0.8, 1.4);
      g.fillStyle = '#F1E7CC';
      g.fillText(String(c.num), 0, 0);
      g.restore();

      /* nom alineat radialment dins la franja */
      g.save();
      g.rotate(i * pas);
      const f = fontsCache.noms.get(nom) || 10;
      g.font = `600 ${f}px ${FONT_NOMS}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const rMig = R * (RD.nomExt + RD.nomInt) / 2;
      g.translate(rMig, 0);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillText(nom.toUpperCase(), 0.6, 1);
      g.fillStyle = 'rgba(241,231,204,0.92)';
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

  /* ═══ EL PLA DE LA TIRADA ═══
     La casella ja està decidida: el desplaçament angular total de la
     bola respecte de la roda és un valor FIX. Perfilem la velocitat i
     normalitzem la seva integral perquè doni exactament aquest valor:
     les quatre fases posen la sensació, la restricció d'integral
     garanteix el resultat. Cap correcció a l'últim fotograma. */
  function plaTirada(idxObjectiu, durada) {
    const T = durada;
    const tAssentament = T * 0.80;
    const Tb = U.clamp(T * 0.135, 1.05, 1.55);       // fase de rebots
    const pas = roda.pas;

    /* — roda: arrenca en 0,45 s i frena amb desacceleració quasi constant — */
    const perfilRoda = creaPerfil(x => Math.min(1, x / 0.045) * Math.pow(1 - x, 1.25) + 0.0001);
    const voltesRoda = 2.1 + T * 0.11 + U.visual(-0.15, 0.15);
    const W0 = W;
    const LW = -U.TAU * voltesRoda;                   // la roda gira antihorari
    const angleRoda = t => W0 + LW * perfilRoda.pos(U.clamp(t / T, 0, 1));
    const velRoda = t => LW * perfilRoda.vel(U.clamp(t / T, 0, 1)) / T;

    /* — fase de rebots (espai relatiu a la roda) —
       la bola llisca i salta caselles senceres fins a quedar EXACTA
       al centre de la casella decidida */
    const nSalts = 2 + (Math.random() < 0.4 ? 1 : 0);
    const lliscada = pas * U.visual(0.9, 1.7);
    const marge = lliscada + nSalts * pas;            // recorregut relatiu de la fase
    const relObjectiu = idxObjectiu * pas;            // angle local del centre decidit

    /* — fase de pista: perfil sostingut al principi, caiguda marcada al final
       (mai un easeOut clàssic: arribaria mort al moment de caure) — */
    const perfilBola = creaPerfil(x => Math.pow(1 - 0.86 * x, 1.6) + 0.045);
    const B0 = PORT_ANGLE;

    /* tC es retoca lleugerament perquè el primer contacte caigui a la vora
       d'un rombe deflector real */
    let tC = tAssentament - Tb;
    {
      let millor = tC, distMillor = 1e9;
      for (let d = -0.22; d <= 0.22; d += 0.02) {
        const t = tC + d;
        const mon = U.wrap(angleRoda(t) + relObjectiu - marge);
        let dist = 1e9;
        for (let j = 0; j < N_DEFLECTORS; j++) {
          const del = U.wrap(j * U.TAU / N_DEFLECTORS + Math.PI / 8);
          dist = Math.min(dist, Math.abs(U.difAngular(mon, del)));
        }
        if (dist < distMillor) { distMillor = dist; millor = t; }
      }
      tC = millor;
    }

    /* desplaçament total de la fase de pista: tanca el bucle amb el
       contacte exacte — β(tC) = W(tC) + relObjectiu − marge (mod 2π) */
    const relContacte = relObjectiu - marge;
    const feta = U.wrap(angleRoda(tC) + relContacte - B0);
    const voltesBola = Math.round(4.6 + T * 0.42 + U.visual(-0.3, 0.3));
    const DA = feta + U.TAU * voltesBola;             // sempre positiu: la bola va horària

    /* — segments de la fase de rebots (temps absolut, espai relatiu) — */
    const segments = [];
    {
      let durs = [0.18, 0.34];                        // xoc amb deflector + lliscada
      const avanç = [lliscada * 0.55, lliscada * 0.45];
      for (let h = 0; h < nSalts; h++) {
        durs.push(0.34 - h * 0.05 + U.visual(-0.02, 0.02));
        avanç.push(pas);
      }
      const totalDur = durs.reduce((a, b) => a + b, 0);
      durs = durs.map(d => d * Tb / totalDur);        // normalitzem al temps de fase
      let t0 = tC, rel = relContacte;
      for (let s = 0; s < durs.length; s++) {
        segments.push({
          t0, t1: t0 + durs[s], rel0: rel, rel1: rel + avanç[s],
          salt: s >= 2, primer: s === 0,
        });
        t0 += durs[s]; rel += avanç[s];
      }
    }

    const ompleRebots = t => {
      for (const s of segments) {
        if (t <= s.t1 || s === segments[segments.length - 1]) {
          const u = U.clamp((t - s.t0) / (s.t1 - s.t0), 0, 1);
          const rel = U.lerp(s.rel0, s.rel1, s.salt ? u : U.easeOutQuad(u));
          let radi, alçada = 0;
          if (s.primer) {
            /* rebot al deflector: surt disparada cap enfora i cau */
            const bomba = Math.sin(u * Math.PI);
            radi = U.lerp(RD.deflector, RD.repos + 0.02, U.easeInQuad(u)) + bomba * 0.035;
          } else if (s.salt) {
            radi = RD.repos;
            alçada = Math.sin(u * Math.PI) * (0.55 - 0.13 * segments.indexOf(s));
          } else {
            radi = U.lerp(RD.repos + 0.02, RD.repos, u);
          }
          return { rel, radi, alçada: Math.max(0, alçada) };
        }
      }
      return { rel: relObjectiu, radi: RD.repos, alçada: 0 };
    };

    return {
      T, tC, tAssentament, idxObjectiu,
      angleRoda, velRoda,
      omegaMaxBola: (DA * perfilBola.vel(0)) / tC,
      estat: 'pista', tCaiguda: -1,
      posicio(t) {
        /* retorna {beta (angle món), radi (fracció R), alçada, velBola} */
        if (t < tC) {
          const x = U.clamp(t / tC, 0, 1);
          const beta = B0 + DA * perfilBola.pos(x);
          const vel = DA * perfilBola.vel(x) / tC;
          let radi = RD.bola - 0.004 * x;
          if (this.tCaiguda >= 0 && t >= this.tCaiguda) {
            /* la caiguda es dispara per VELOCITAT (no per temps): el radi
               baixa de la pista fins al deflector just al contacte */
            const u = U.clamp((t - this.tCaiguda) / Math.max(0.001, tC - this.tCaiguda), 0, 1);
            radi = U.lerp(RD.bola, RD.deflector, U.easeInQuad(u));
          }
          return { beta, radi, alçada: 0, velBola: vel };
        }
        if (t < tAssentament) {
          const r = ompleRebots(t);
          return { beta: this.angleRoda(t) + r.rel, radi: r.radi, alçada: r.alçada, velBola: this.velRoda(t) };
        }
        /* rotació solidària amb la roda fins que s'atura del tot */
        return { beta: this.angleRoda(t) + relObjectiu, radi: RD.repos, alçada: 0, velBola: this.velRoda(t) };
      },
      segments,
    };
  }

  /* ═══ EXECUCIÓ DE LA TIRADA ═══ */
  function tira(idxObjectiu, durada, cb) {
    return new Promise(res => {
      cbEvents = cb || (() => {});
      acabaTirada = res;
      const pla = plaTirada(idxObjectiu, durada);
      tirada = {
        pla, t: 0, casellaPrevia: null, dins: false,
        emesos: { caiguda: false, contacte: false, saltFets: new Set(), assentada: false, ultims: false },
      };
      ultimaCasella = -1;
      cuaBola = [];
      document.body.classList.add('tirant');
      arrencaBucle();
    });
  }

  function passaTirada(dt) {
    const T = tirada;
    const pla = T.pla;
    T.t += dt;
    const t = T.t;

    /* transició PISTA → CAIGUDA disparada per velocitat angular */
    if (pla.tCaiguda < 0 && t < pla.tC) {
      const v = pla.posicio(t).velBola;
      if (v < pla.omegaMaxBola * 0.17) {
        pla.tCaiguda = t;
        T.emesos.caiguda = true;
        cbEvents({ tipus: 'caiguda' });
      }
    }
    /* últims segons: focus tancat i clima de tensió */
    if (!T.emesos.ultims && t > pla.tAssentament - 1.6) {
      T.emesos.ultims = true;
      cbEvents({ tipus: 'ultims' });
    }
    W = pla.angleRoda(t);
    const p = pla.posicio(t);
    /* pan estèreo segons la posició horitzontal real de la bola */
    const pan = Math.cos(p.beta) * 0.7;

    if (!T.emesos.contacte && t >= pla.tC) {
      T.emesos.contacte = true;
      cbEvents({ tipus: 'deflector', força: 1, pan });
      flaixDeflector(pla.posicio(pla.tC + 0.001).beta);
    }
    for (let s = 2; s < pla.segments.length; s++) {
      const seg = pla.segments[s];
      if (!T.emesos.saltFets.has(s) && t >= seg.t1) {
        T.emesos.saltFets.add(s);
        cbEvents({ tipus: 'salt', força: 1 - (s - 2) * 0.25, pan });
      }
    }
    if (!T.emesos.assentada && t >= pla.tAssentament) {
      T.emesos.assentada = true;
      cbEvents({ tipus: 'assentada', pan });
      /* ona expansiva curta al punt de l'assentament */
      ones.push({
        x: centre + Math.cos(p.beta) * R * p.radi,
        y: centre + Math.sin(p.beta) * R * p.radi,
        t0: performance.now(),
      });
    }

    /* clics contra els separadors: només quan la bola ja és a l'altura
       de les caselles; freqüència = velocitat relativa real */
    if (p.radi < RD.cellaExt + 0.06 && t < pla.tAssentament) {
      const rel = U.wrap(p.beta - W);
      const cella = Math.floor(rel / roda.pas + 0.5) % roda.total;
      if (T.casellaPrevia !== null && cella !== T.casellaPrevia) {
        const velRel = Math.abs(p.velBola - pla.velRoda(t));
        cbEvents({ tipus: 'clic', força: U.clamp(velRel / 9, 0.15, 1), pan });
        flaixSeparador(rel);
      }
      T.casellaPrevia = cella;
    }

    if (t >= pla.T) {
      /* roda aturada del tot: la tirada acaba, la bola queda assentada */
      W = pla.angleRoda(pla.T);
      ultimaCasella = pla.idxObjectiu;
      const fi = acabaTirada;
      tirada = null;
      acabaTirada = null;
      document.body.classList.remove('tirant');
      pintaQuiet();
      fi && fi();
      return null;
    }
    return p;
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
      const velRodaAra = tirada ? Math.abs(tirada.pla.velRoda(tirada.t)) : 0;
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
  };
})();
