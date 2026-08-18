/* ════════════════════════════════════════════════════════════════
   SO — tot sintetitzat amb Web Audio API, sense cap fitxer
   Graf:  fonts → (sec | reverberació) → atenuador de suspens →
          mestre → altaveus
   Tots els one-shots es desconnecten en acabar (onended).
   ════════════════════════════════════════════════════════════════ */
const Audio = (() => {
  let ctx = null, mestre = null, duc = null, rev = null, revSend = null;
  let llest = false;
  let gAmbient = null, gHumRoda = null, gRodament = null, fRodament = null, oHumRoda = null;
  let sorollBuf = null, brownBuf = null;
  let tempsUltimClic = 0;
  let timerFitxes = 0;

  function assegura() {
    if (llest) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return false; }
    mestre = ctx.createGain();
    mestre.gain.value = Estat.d.config.silenci ? 0 : 0.9;
    mestre.connect(ctx.destination);
    duc = ctx.createGain();
    duc.gain.value = 1;
    duc.connect(mestre);

    /* reverberació de sala: impuls generat (soroll amb caiguda
       exponencial, 2,2 s: una sala gran amb cortinatges) */
    rev = ctx.createConvolver();
    const durI = 2.2, n = Math.floor(ctx.sampleRate * durI);
    const imp = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = imp.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.1);
    }
    rev.buffer = imp;
    const gRev = ctx.createGain(); gRev.gain.value = 0.28;
    rev.connect(gRev); gRev.connect(duc);
    revSend = ctx.createGain(); revSend.gain.value = 1;
    revSend.connect(rev);

    /* memòries de soroll reutilitzables */
    sorollBuf = creaSoroll(1.2, false);
    brownBuf = creaSoroll(3.5, true);

    montaAmbient();
    montaSonsDeTirada();
    llest = true;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function creaSoroll(seg, marro) {
    const n = Math.floor(44100 * seg);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let ult = 0;
    for (let i = 0; i < n; i++) {
      const blanc = Math.random() * 2 - 1;
      if (marro) { ult = (ult + 0.02 * blanc) / 1.02; d[i] = ult * 6; }
      else d[i] = blanc;
    }
    return b;
  }

  /* ─── llit ambiental: remor de sala en greus + murmuri llunyà ─── */
  function montaAmbient() {
    gAmbient = ctx.createGain();
    gAmbient.gain.value = 1;
    gAmbient.connect(duc);

    const remor = ctx.createBufferSource();
    remor.buffer = brownBuf; remor.loop = true;
    const fRemor = ctx.createBiquadFilter();
    fRemor.type = 'lowpass'; fRemor.frequency.value = 130;
    const gRemor = ctx.createGain(); gRemor.gain.value = 0.05;
    remor.connect(fRemor); fRemor.connect(gRemor); gRemor.connect(gAmbient);
    remor.start();
    /* respiració lenta de la remor */
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.016;
    lfo.connect(lfoG); lfoG.connect(gRemor.gain); lfo.start();

    const murmuri = ctx.createBufferSource();
    murmuri.buffer = brownBuf; murmuri.loop = true; murmuri.playbackRate.value = 1.7;
    const fMur = ctx.createBiquadFilter();
    fMur.type = 'bandpass'; fMur.frequency.value = 480; fMur.Q.value = 0.6;
    const gMur = ctx.createGain(); gMur.gain.value = 0.012;
    murmuri.connect(fMur); fMur.connect(gMur); gMur.connect(gAmbient);
    murmuri.start();
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.085;
    const lfo2G = ctx.createGain(); lfo2G.gain.value = 0.006;
    lfo2.connect(lfo2G); lfo2G.connect(gMur.gain); lfo2.start();

    /* pressió de sala: un subgreu quasi imperceptible que només es nota
       quan desapareix (el batec de suspens) */
    const pressio = ctx.createOscillator();
    pressio.type = 'sine'; pressio.frequency.value = 52;
    const gPressio = ctx.createGain(); gPressio.gain.value = 0.016;
    pressio.connect(gPressio); gPressio.connect(gAmbient);
    pressio.start();
    const lfo3 = ctx.createOscillator(); lfo3.frequency.value = 0.031;
    const lfo3G = ctx.createGain(); lfo3G.gain.value = 0.007;
    lfo3.connect(lfo3G); lfo3G.connect(gPressio.gain); lfo3.start();

    /* repics de fitxes ocasionals, molt llunyans */
    const fitxa = () => {
      if (ctx.state === 'running' && duc.gain.value > 0.05) {
        const quan = ctx.currentTime + 0.02;
        for (let i = 0; i < U.visualEnter(2, 4); i++) {
          toMetall(quan + i * U.visual(0.03, 0.09), U.visual(1900, 3400), 0.012, 0.05, U.visual(-0.8, 0.8));
        }
      }
      timerFitxes = setTimeout(fitxa, U.visual(7000, 19000));
    };
    timerFitxes = setTimeout(fitxa, 6000);
  }

  /* ─── sons continus de la tirada ─── */
  function montaSonsDeTirada() {
    oHumRoda = ctx.createOscillator();
    oHumRoda.type = 'sawtooth'; oHumRoda.frequency.value = 44;
    const fHum = ctx.createBiquadFilter();
    fHum.type = 'lowpass'; fHum.frequency.value = 120;
    gHumRoda = ctx.createGain(); gHumRoda.gain.value = 0;
    oHumRoda.connect(fHum); fHum.connect(gHumRoda); gHumRoda.connect(duc);
    oHumRoda.start();

    const rod = ctx.createBufferSource();
    rod.buffer = sorollBuf; rod.loop = true;
    fRodament = ctx.createBiquadFilter();
    fRodament.type = 'bandpass'; fRodament.frequency.value = 1100; fRodament.Q.value = 1.4;
    gRodament = ctx.createGain(); gRodament.gain.value = 0;
    rod.connect(fRodament); fRodament.connect(gRodament); gRodament.connect(duc);
    rod.start();
  }

  /* crida per fotograma des del bucle de la roda (o null en aturar) */
  function fotogramaTirada(p) {
    if (!llest) return;
    const t = ctx.currentTime;
    if (!p) {
      gHumRoda.gain.setTargetAtTime(0, t, 0.2);
      gRodament.gain.setTargetAtTime(0, t, 0.15);
      return;
    }
    gHumRoda.gain.setTargetAtTime(U.clamp(p.velRoda * 0.045, 0, 0.12), t, 0.1);
    oHumRoda.frequency.setTargetAtTime(38 + p.velRoda * 7, t, 0.15);
    const vBola = p.enPista ? U.clamp(p.velBola * 0.012, 0, 0.09) : 0;
    gRodament.gain.setTargetAtTime(vBola, t, 0.08);
    fRodament.frequency.setTargetAtTime(700 + p.velBola * 90, t, 0.1);
  }

  /* ─── peces bàsiques ───
     tots els nodes d'un one-shot pengen d'un gain propi que es
     desconnecta quan la font acaba */
  function oneShot(quan, munta) {
    const sortida = ctx.createGain();
    sortida.connect(duc);
    const fonts = munta(sortida) || [];
    let vius = fonts.length;
    for (const f of fonts) {
      f.onended = () => { if (--vius <= 0) sortida.disconnect(); };
    }
    return sortida;
  }
  function ambReverb(sortida, quantitat) {
    const enviament = ctx.createGain();
    enviament.gain.value = quantitat;
    sortida.connect(enviament);
    enviament.connect(revSend);
  }

  function toMetall(quan, freq, guany, decaïment, pan = 0, reverb = 0.25) {
    /* tres parcials inarmònics: timbre de metall petit */
    oneShot(quan, sortida => {
      let cap = sortida;
      if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner(); p.pan.value = U.clamp(pan, -1, 1);
        p.connect(sortida); cap = p;
      }
      if (reverb) ambReverb(sortida, reverb);
      const fonts = [];
      [[1, 1], [2.756, 0.55], [5.404, 0.28]].forEach(([m, a]) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * m * U.visual(0.99, 1.01);
        const g = ctx.createGain();
        g.gain.setValueAtTime(guany * a, quan);
        g.gain.exponentialRampToValueAtTime(0.0001, quan + decaïment * U.visual(0.8, 1.2));
        o.connect(g); g.connect(cap);
        o.start(quan); o.stop(quan + decaïment * 1.4);
        fonts.push(o);
      });
      return fonts;
    });
  }

  function copSoroll(quan, freq, q, guany, decaïment, tipus = 'bandpass', reverb = 0.2, pan = 0) {
    oneShot(quan, sortida => {
      let cap = sortida;
      if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner(); p.pan.value = U.clamp(pan, -1, 1);
        p.connect(sortida); cap = p;
      }
      if (reverb) ambReverb(sortida, reverb);
      const s = ctx.createBufferSource();
      s.buffer = sorollBuf;
      s.playbackRate.value = U.visual(0.9, 1.1);
      const f = ctx.createBiquadFilter();
      f.type = tipus; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(guany, quan);
      g.gain.exponentialRampToValueAtTime(0.0001, quan + decaïment);
      s.connect(f); f.connect(g); g.connect(cap);
      s.start(quan); s.stop(quan + decaïment + 0.02);
      return [s];
    });
  }

  /* ─── sons concrets de la taula ─── */
  const api = {
    assegura, fotogramaTirada,

    silencia(v) {
      if (!llest) return;
      mestre.gain.setTargetAtTime(v ? 0 : 0.9, ctx.currentTime, 0.03);
    },
    /* atenuador de suspens: 0 = silenci real de tota la sala */
    ducA(nivell, ms) {
      if (!llest) return;
      const t = ctx.currentTime;
      duc.gain.cancelScheduledValues(t);
      duc.gain.setValueAtTime(duc.gain.value, t);
      duc.gain.linearRampToValueAtTime(nivell, t + ms / 1000);
    },
    /* només el llit ambiental: baixa progressivament als últims segons */
    ambientA(nivell, ms) {
      if (!llest) return;
      const t = ctx.currentTime;
      gAmbient.gain.cancelScheduledValues(t);
      gAmbient.gain.setValueAtTime(gAmbient.gain.value, t);
      gAmbient.gain.linearRampToValueAtTime(nivell, t + ms / 1000);
    },

    /* la posició estèreo segueix la bola per la roda */
    clicSeparador(força, pan = 0) {
      if (!llest) return;
      const ara = performance.now();
      if (ara - tempsUltimClic < 24) return; // no saturem a alta velocitat
      tempsUltimClic = ara;
      const t = ctx.currentTime;
      copSoroll(t, 3200 + força * 1800, 2.5, 0.05 + força * 0.10, 0.03, 'highpass', 0.12, pan);
      toMetall(t, U.visual(1900, 2400) + força * 700, 0.02 + força * 0.05, 0.045, pan + U.visual(-0.1, 0.1), 0.1);
    },
    caigudaPista() {
      if (!llest) return;
      const t = ctx.currentTime;
      /* cop sec en abandonar la pista */
      oneShot(t, sortida => {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(170, t);
        o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.20, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g); g.connect(sortida);
        o.start(t); o.stop(t + 0.18);
        return [o];
      });
      copSoroll(t, 500, 1, 0.14, 0.09, 'lowpass', 0.3);
    },
    rebotDeflector(força, pan = 0) {
      if (!llest) return;
      const t = ctx.currentTime;
      toMetall(t, U.visual(2300, 2700), 0.16 * força, 0.16, pan, 0.4);
      copSoroll(t, 1800, 1.8, 0.10 * força, 0.05, 'bandpass', 0.3, pan);
    },
    saltCasella(força, pan = 0) {
      if (!llest) return;
      const t = ctx.currentTime;
      copSoroll(t, 900, 1.2, 0.10 * força, 0.05, 'bandpass', 0.2, pan);
      toMetall(t, U.visual(1500, 1900), 0.05 * força, 0.06, pan, 0.15);
    },
    assentament(pan = 0) {
      if (!llest) return;
      const t = ctx.currentTime;
      copSoroll(t, 420, 1, 0.16, 0.10, 'lowpass', 0.35, pan);
      toMetall(t + 0.01, 1350, 0.07, 0.10, pan, 0.3);
    },
    /* clic mecànic SEC sota la casella: el batec de suspens.
       Va directe al mestre, fora de l'atenuador: és l'únic so que
       sobreviu al silenci absolut. */
    clicMecanic() {
      if (!llest) return;
      const t = ctx.currentTime;
      const sortida = ctx.createGain();
      sortida.connect(mestre);
      const o = ctx.createOscillator();
      o.type = 'square'; o.frequency.value = 1150;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.10, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
      o.connect(g); g.connect(sortida);
      const s = ctx.createBufferSource();
      s.buffer = sorollBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 2400; f.Q.value = 3;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.06, t + 0.004);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
      s.connect(f); f.connect(g2); g2.connect(sortida);
      o.start(t); o.stop(t + 0.03);
      s.start(t + 0.004); s.stop(t + 0.03);
      let vius = 2;
      o.onended = s.onended = () => { if (--vius <= 0) sortida.disconnect(); };
    },
    hoverBoto() {
      if (!llest) return;
      copSoroll(ctx.currentTime, 2600, 4, 0.015, 0.02, 'highpass', 0);
    },
    premBoto() {
      if (!llest) return;
      const t = ctx.currentTime;
      copSoroll(t, 1300, 2, 0.06, 0.03, 'bandpass', 0.1);
      toMetall(t + 0.02, 900, 0.03, 0.05, 0, 0.1);
    },

    /* ─── trampa i tub pneumàtic ─── */
    xiuletAire(dur) {
      if (!llest) return;
      const t = ctx.currentTime;
      oneShot(t, sortida => {
        ambReverb(sortida, 0.2);
        const s = ctx.createBufferSource();
        s.buffer = sorollBuf; s.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 1.6;
        f.frequency.setValueAtTime(700, t);
        f.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.8);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.13, t + dur * 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f); f.connect(g); g.connect(sortida);
        s.start(t); s.stop(t + dur + 0.05);
        return [s];
      });
    },
    copColze(pan) {
      if (!llest) return;
      const t = ctx.currentTime;
      /* repic dins del tub: metall tancat amb reverberació curta */
      toMetall(t, U.visual(340, 420), 0.16, 0.09, pan, 0.5);
      copSoroll(t, 300, 1.5, 0.12, 0.06, 'lowpass', 0.45);
    },
    carregaPneumatica(dur) {
      if (!llest) return;
      const t = ctx.currentTime;
      oneShot(t, sortida => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(55, t);
        o.frequency.exponentialRampToValueAtTime(210, t + dur);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.10, t + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
        o.connect(f); f.connect(g); g.connect(sortida);
        o.start(t); o.stop(t + dur + 0.1);
        return [o];
      });
    },
    popPneumatic() {
      if (!llest) return;
      const t = ctx.currentTime;
      oneShot(t, sortida => {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(90, t);
        o.frequency.exponentialRampToValueAtTime(300, t + 0.07);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.26, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        o.connect(g); g.connect(sortida);
        o.start(t); o.stop(t + 0.16);
        return [o];
      });
      copSoroll(t, 1100, 0.8, 0.2, 0.10, 'bandpass', 0.3);
      /* el tub ressona un instant després de l'expulsió */
      oneShot(t + 0.08, sortida => {
        ambReverb(sortida, 0.5);
        const s = ctx.createBufferSource();
        s.buffer = sorollBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 9;
        f.frequency.setValueAtTime(760, t + 0.08);
        f.frequency.exponentialRampToValueAtTime(340, t + 0.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.09, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        s.connect(f); f.connect(g); g.connect(sortida);
        s.start(t + 0.08); s.stop(t + 0.6);
        return [s];
      });
    },
    alarma(nivell) {
      if (!llest) return;
      const t = ctx.currentTime;
      const dur = nivell >= 3 ? 2.6 : 1.2;
      oneShot(t, sortida => {
        ambReverb(sortida, 0.3);
        const fonts = [];
        const veus = nivell >= 3 ? 2 : 1;
        for (let v = 0; v < veus; v++) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          const lfo = ctx.createOscillator();
          lfo.frequency.value = nivell >= 3 ? 3.4 : 2.1;
          const lfoG = ctx.createGain(); lfoG.gain.value = 160;
          lfo.connect(lfoG); lfoG.connect(o.frequency);
          o.frequency.value = (nivell >= 3 ? 640 : 540) + v * 90;
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass'; f.frequency.value = 1600;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(nivell >= 3 ? 0.075 : 0.05, t + 0.1);
          g.gain.setValueAtTime(nivell >= 3 ? 0.075 : 0.05, t + dur - 0.3);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(f); f.connect(g); g.connect(sortida);
          o.start(t); o.stop(t + dur);
          lfo.start(t); lfo.stop(t + dur);
          fonts.push(o, lfo);
        }
        return fonts;
      });
    },

    /* ─── celebració ─── */
    impacte() {
      if (!llest) return;
      const t = ctx.currentTime;
      copSoroll(t, 300, 0.8, 0.30, 0.22, 'lowpass', 0.4);
      toMetall(t, 1150, 0.22, 0.5, 0, 0.5);
      toMetall(t + 0.02, 2320, 0.10, 0.35, 0, 0.5);
    },
    /* la cascada de monedes: moltíssims impactes metàl·lics curts,
       aleatoritzats i encavalcats — una escurabutxaques pagant */
    cascadaMonedes(durS, intensitat) {
      if (!llest) return;
      const t0 = ctx.currentTime + 0.03;
      const nombre = Math.round(120 * intensitat);
      for (let i = 0; i < nombre; i++) {
        /* densitat: creix de cop, es manté i decau amb cua */
        const u = i / nombre;
        const tt = t0 + Math.pow(u, 0.82) * durS + U.visual(0, 0.10);
        const f = U.visual(2100, 5600) * (1 - 0.15 * u);
        toMetall(tt, f, U.visual(0.020, 0.052) * (1 - 0.4 * u), U.visual(0.05, 0.14), U.visual(-0.9, 0.9), 0.5);
        if (i % 6 === 0) copSoroll(tt + 0.01, U.visual(380, 560), 1, 0.05, 0.07, 'lowpass', 0.4);
        /* purpurina: partials molt aguts i molt fluixos per sobre del doll */
        if (i % 7 === 3) toMetall(tt + 0.02, U.visual(6200, 9200), 0.008, 0.20, U.visual(-1, 1), 0.7);
      }
      /* remor greu del munt de monedes creixent */
      oneShot(t0, sortida => {
        const s = ctx.createBufferSource();
        s.buffer = sorollBuf; s.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.7);
        g.gain.setValueAtTime(0.05, t0 + durS * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS + 0.5);
        s.connect(f); f.connect(g); g.connect(sortida);
        s.start(t0); s.stop(t0 + durS + 0.6);
        return [s];
      });
    },
    fanfarria(zero) {
      if (!llest) return;
      const t0 = ctx.currentTime + 0.05;
      const notes = zero ? [196, 233.1, 293.7, 392, 466.2] : [261.6, 329.6, 392, 523.3];
      notes.forEach((fq, i) => {
        const t = t0 + i * 0.13;
        const dur = i === notes.length - 1 ? 1.5 : 0.45;
        oneShot(t, sortida => {
          ambReverb(sortida, 0.4);
          const fonts = [];
          for (const det of [0, 4]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = fq; o.detune.value = det;
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.setValueAtTime(900, t);
            f.frequency.exponentialRampToValueAtTime(2400, t + 0.08);
            f.frequency.exponentialRampToValueAtTime(1100, t + dur);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.055, t + 0.03);
            g.gain.setValueAtTime(0.055, t + dur * 0.6);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(f); f.connect(g); g.connect(sortida);
            o.start(t); o.stop(t + dur + 0.05);
            fonts.push(o);
          }
          return fonts;
        });
      });
    },
    ovacio(durS) {
      if (!llest) return;
      const t = ctx.currentTime;
      oneShot(t, sortida => {
        ambReverb(sortida, 0.5);
        const s = ctx.createBufferSource();
        s.buffer = brownBuf; s.loop = true; s.playbackRate.value = 2.4;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 0.4;
        f.frequency.setValueAtTime(600, t);
        f.frequency.linearRampToValueAtTime(1150, t + durS * 0.4);
        f.frequency.linearRampToValueAtTime(750, t + durS);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.075, t + 0.6);
        g.gain.setValueAtTime(0.075, t + durS * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + durS);
        s.connect(f); f.connect(g); g.connect(sortida);
        s.start(t); s.stop(t + durS + 0.1);
        return [s];
      });
    },
    ticOdometre() {
      if (!llest) return;
      copSoroll(ctx.currentTime, 2100, 3, 0.03, 0.015, 'highpass', 0);
    },
    focArtifici() {
      if (!llest) return;
      const t = ctx.currentTime;
      copSoroll(t, 700, 0.6, 0.07, 0.3, 'lowpass', 0.5);
      for (let i = 0; i < 5; i++) {
        toMetall(t + U.visual(0.02, 0.3), U.visual(2800, 4800), 0.012, 0.20, U.visual(-0.9, 0.9), 0.5);
      }
    },
  };
  return api;
})();
