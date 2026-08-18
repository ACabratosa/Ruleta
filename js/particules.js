/* ════════════════════════════════════════════════════════════════
   PARTÍCULES DE LA CELEBRACIÓ
   Monedes: el·lipses que roten sobre el seu eix, amb lluentor al
   cantell quan es veuen de perfil. Focs artificials amb traça.
   Límit de partícules i degradació automàtica si baixa el framerate.
   ════════════════════════════════════════════════════════════════ */
const Particules = (() => {
  let cnv, g, ampla = 0, alta = 0, dpr = 1;
  let actives = [];
  let rafId = 0, ultimT = 0;
  let emissor = null;          // estat de l'emissió en curs
  let emaDt = 16, degradat = false;

  function init(canvas) {
    cnv = canvas;
    g = cnv.getContext('2d');
    redimensiona();
  }
  function redimensiona() {
    if (!cnv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    ampla = window.innerWidth; alta = window.innerHeight;
    cnv.width = Math.round(ampla * dpr);
    cnv.height = Math.round(alta * dpr);
  }

  const limit = () => {
    const base = Estat.d.config.calma ? 130 : 620;
    return degradat ? Math.floor(base * 0.45) : base;
  };

  /* ─── fàbriques ─── */
  function moneda(x, y) {
    return {
      tipus: 'moneda',
      x, y,
      vx: U.visual(-70, 70), vy: U.visual(-60, 120),
      mida: U.visual(6, 11),
      fase: U.visual(0, U.TAU),        // rotació sobre l'eix propi
      velFase: U.visual(5, 13) * (Math.random() < 0.5 ? -1 : 1),
      inclinacio: U.visual(-0.5, 0.5), // inclinació de l'el·lipse en pantalla
      brilla: Math.random() < 0.3,     // algunes atrapen el focus de la sala
      vida: 0, vidaMax: U.visual(2.6, 4.2),
    };
  }
  function confeti(x, y, verd) {
    const colors = verd
      ? ['#2f9e63', '#68d29a', '#d2b15a', '#f1e7cc', '#0E6B43']
      : ['#d2b15a', '#f1e7cc', '#8C2F39', '#b08d3b', '#ecd590'];
    return {
      tipus: 'confeti',
      x, y,
      vx: U.visual(-90, 90), vy: U.visual(-40, 60),
      mida: U.visual(4, 7),
      fase: U.visual(0, U.TAU), velFase: U.visual(3, 9),
      gir: U.visual(0, U.TAU), velGir: U.visual(-4, 4),
      color: U.tria(colors),
      vida: 0, vidaMax: U.visual(3, 5),
    };
  }
  function coet(verd) {
    return {
      tipus: 'coet',
      x: U.visual(0.12, 0.88) * ampla,
      y: alta + 8,
      vx: U.visual(-40, 40),
      vy: -U.visual(alta * 0.55, alta * 0.75) / 1.1,
      objectiuY: U.visual(0.18, 0.42) * alta,
      cua: [],
      verd,
      vida: 0, vidaMax: 2.4,
    };
  }
  function espurna(x, y, verd, micro) {
    const a = U.visual(0, U.TAU), v = micro ? U.visual(20, 90) : U.visual(60, 330);
    return {
      tipus: 'espurna',
      x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
      cua: [],
      color: verd
        ? U.tria(['#9af0c0', '#4ed08b', '#d2f5e0', '#e8d590'])
        : U.tria(['#ffe9a8', '#ffcf70', '#fff6dd', '#f0a860']),
      /* algunes guspires crepiten en morir: petita segona explosió */
      crepita: !micro && Math.random() < 0.22,
      verd,
      vida: 0, vidaMax: micro ? U.visual(0.25, 0.45) : U.visual(0.7, 1.5),
    };
  }

  /* ─── emissió d'una celebració ─── */
  function celebra(opts) {
    emissor = {
      t: 0,
      dur: opts.calma ? 4.5 : 7,
      zero: !!opts.zero,
      calma: !!opts.calma,
      seguentCoet: 0.3,
      seguentPluja: 0,
    };
    arrenca();
  }
  function atura() { emissor = null; }
  function buida() { actives = []; emissor = null; }

  function pasEmissor(dt) {
    const e = emissor;
    if (!e) return;
    e.t += dt;
    if (e.t > e.dur) { emissor = null; return; }
    const cap = limit();
    const factor = e.calma ? 0.25 : 1;
    /* cascada de monedes des de la part alta */
    if (e.t < e.dur * 0.75) {
      e.seguentPluja -= dt;
      while (e.seguentPluja <= 0 && actives.length < cap) {
        e.seguentPluja += 0.022 / factor;
        actives.push(moneda(U.visual(0.1, 0.9) * ampla, -14));
        if (Math.random() < 0.75) actives.push(confeti(U.visual(0, 1) * ampla, -10, e.zero));
      }
    }
    /* coets */
    if (!e.calma) {
      e.seguentCoet -= dt;
      if (e.seguentCoet <= 0 && actives.length < cap - 80) {
        e.seguentCoet = U.visual(0.5, 1.1);
        actives.push(coet(e.zero));
        Audio.focArtifici();
      }
    }
  }

  function pas(dt) {
    const gv = 720, aire = 0.995;
    const noves = [];
    for (const p of actives) {
      p.vida += dt;
      if (p.tipus === 'moneda') {
        p.vy += gv * dt;
        p.vx *= aire;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.fase += p.velFase * dt;
      } else if (p.tipus === 'confeti') {
        p.vy += 190 * dt;
        p.vy = Math.min(p.vy, 130);
        p.x += (p.vx + Math.sin(p.vida * 5 + p.fase) * 46) * dt;
        p.y += p.vy * dt;
        p.fase += p.velFase * dt;
        p.gir += p.velGir * dt;
      } else if (p.tipus === 'coet') {
        p.vy += 320 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.cua.push({ x: p.x, y: p.y });
        if (p.cua.length > 7) p.cua.shift();
        if (p.vy > -60 || p.y < p.objectiuY) {
          p.vida = 1e9; // esclata
          const n = degradat || Estat.d.config.calma ? 26 : 52;
          for (let i = 0; i < n && actives.length + noves.length < limit(); i++) {
            noves.push(espurna(p.x, p.y, p.verd));
          }
        }
      } else if (p.tipus === 'espurna') {
        p.vy += 300 * dt;
        p.vx *= 0.985; p.vy *= 0.99;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (!degradat) {
          p.cua.push({ x: p.x, y: p.y });
          if (p.cua.length > 6) p.cua.shift();
        }
        if (p.crepita && p.vida > p.vidaMax * 0.72) {
          p.crepita = false;
          if (!degradat && actives.length + noves.length < limit()) {
            for (let k = 0; k < 3; k++) noves.push(espurna(p.x, p.y, p.verd, true));
          }
        }
      }
    }
    actives = actives.concat(noves).filter(p =>
      p.vida < p.vidaMax && p.y < alta + 30 && p.x > -40 && p.x < ampla + 40);
  }

  function dibuixa() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, ampla, alta);
    for (const p of actives) {
      const desapareix = U.clamp((p.vidaMax - p.vida) / 0.5, 0, 1);
      if (p.tipus === 'moneda') {
        const c = Math.cos(p.fase);
        const gruix = Math.abs(c);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.inclinacio);
        g.globalAlpha = desapareix;
        if (p.brilla && !degradat) { g.shadowColor = 'rgba(255,220,130,.8)'; g.shadowBlur = 9; }
        if (gruix < 0.22) {
          /* de perfil: només el cantell, amb lluentor especular */
          g.fillStyle = '#fff3c9';
          g.fillRect(-p.mida, -p.mida * 0.14, p.mida * 2, p.mida * 0.28);
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.fillRect(-p.mida * 0.5, -p.mida * 0.14, p.mida * 0.5, p.mida * 0.28);
        } else {
          const grd = g.createLinearGradient(-p.mida, -p.mida, p.mida, p.mida);
          if (c > 0) { grd.addColorStop(0, '#f6dd93'); grd.addColorStop(0.5, '#d9b34f'); grd.addColorStop(1, '#8a6a22'); }
          else { grd.addColorStop(0, '#e0bd5e'); grd.addColorStop(0.5, '#b08d3b'); grd.addColorStop(1, '#6e5217'); }
          g.fillStyle = grd;
          g.beginPath();
          g.ellipse(0, 0, p.mida, p.mida * gruix, 0, 0, U.TAU);
          g.fill();
          /* vora i reflex del cantell */
          g.strokeStyle = 'rgba(255,244,200,0.75)';
          g.lineWidth = 1;
          g.stroke();
          g.globalAlpha = desapareix * (1 - gruix) * 0.8;
          g.strokeStyle = '#ffffff';
          g.beginPath();
          g.ellipse(0, 0, p.mida, p.mida * gruix, 0, -0.9, 0.6);
          g.stroke();
        }
        g.restore();
      } else if (p.tipus === 'confeti') {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.gir);
        g.globalAlpha = desapareix * 0.95;
        const h = p.mida * Math.abs(Math.cos(p.fase)) + 0.6;
        g.fillStyle = p.color;
        g.fillRect(-p.mida / 2, -h / 2, p.mida, h);
        g.globalAlpha = desapareix * 0.4;
        g.fillStyle = '#fff';
        g.fillRect(-p.mida / 2, -h / 2, p.mida, h / 3);
        g.restore();
      } else if (p.tipus === 'coet') {
        g.save();
        g.globalAlpha = 0.9;
        g.lineCap = 'round';
        for (let i = 1; i < p.cua.length; i++) {
          g.strokeStyle = p.verd ? 'rgba(120,230,170,0.55)' : 'rgba(255,214,130,0.55)';
          g.lineWidth = 3.2 * (i / p.cua.length);
          g.beginPath();
          g.moveTo(p.cua[i - 1].x, p.cua[i - 1].y);
          g.lineTo(p.cua[i].x, p.cua[i].y);
          g.stroke();
        }
        g.shadowColor = 'rgba(255,230,160,.9)'; g.shadowBlur = 8;
        g.fillStyle = '#fff8e0';
        g.beginPath(); g.arc(p.x, p.y, 2.8, 0, U.TAU); g.fill();
        g.restore();
      } else if (p.tipus === 'espurna') {
        g.save();
        g.globalAlpha = desapareix;
        /* traça lluminosa que s'esvaeix amb rastre */
        if (p.cua.length > 1) {
          for (let i = 1; i < p.cua.length; i++) {
            g.globalAlpha = desapareix * (i / p.cua.length) * 0.8;
            g.strokeStyle = p.color;
            g.lineWidth = 1.6 * (i / p.cua.length) + 0.3;
            g.beginPath();
            g.moveTo(p.cua[i - 1].x, p.cua[i - 1].y);
            g.lineTo(p.cua[i].x, p.cua[i].y);
            g.stroke();
          }
        }
        g.globalAlpha = desapareix;
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, 1.5, 0, U.TAU); g.fill();
        g.restore();
      }
    }
  }

  function arrenca() {
    if (!rafId) {
      ultimT = performance.now();
      rafId = requestAnimationFrame(bucle);
    }
  }
  function bucle(ara) {
    rafId = 0;
    const dtMs = ara - ultimT;
    const dt = Math.min(0.05, dtMs / 1000);
    ultimT = ara;
    /* degradació automàtica si el framerate cau */
    emaDt = emaDt * 0.94 + dtMs * 0.06;
    if (!degradat && emaDt > 42) degradat = true;
    pasEmissor(dt);
    pas(dt);
    dibuixa();
    if (actives.length || emissor) rafId = requestAnimationFrame(bucle);
    else g.clearRect(0, 0, cnv.width, cnv.height);
  }

  return { init, redimensiona, celebra, atura, buida };
})();
