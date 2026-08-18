/* ════════════════════════════════════════════════════════════════
   FÍSICA DE LA TIRADA — independent del renderitzador
   El pla (plaTirada) i la màquina d'estats (novaTirada) són els
   mateixos per a la roda en canvas 2D i per a la roda Three.js:
   només canvia qui pinta el resultat.
   ════════════════════════════════════════════════════════════════ */
const Fisica = (() => {
  const PORT_ANGLE = -1.05;             // boca de llançament (fixa al bol)
  const N_DEFLECTORS = 8;

  /* Radis com a fracció de R — la geometria canònica de la taula */
  const RD = {
    ext: 0.985, llautoInt: 0.905, pistaInt: 0.80, bola: 0.853,
    davantalInt: 0.695, deflector: 0.748,
    nomExt: 0.688, nomInt: 0.552,
    cellaExt: 0.552, cellaInt: 0.418, num: 0.508, repos: 0.472,
    con: 0.418, torreta: 0.30, eix: 0.115,
  };

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

  /* ═══ EL PLA DE LA TIRADA ═══
     La casella ja està decidida: el desplaçament angular total de la
     bola respecte de la roda és un valor FIX. Perfilem la velocitat i
     normalitzem la seva integral perquè doni exactament aquest valor:
     les quatre fases posen la sensació, la restricció d'integral
     garanteix el resultat. Cap correcció a l'últim fotograma. */
  function plaTirada(W0, roda, idxObjectiu, durada) {
    const T = durada;
    const tAssentament = T * 0.80;
    const Tb = U.clamp(T * 0.135, 1.05, 1.55);       // fase de rebots
    const pas = roda.pas;

    /* — roda: arrenca en 0,45 s i frena amb desacceleració quasi constant — */
    const perfilRoda = creaPerfil(x => Math.min(1, x / 0.045) * Math.pow(1 - x, 1.25) + 0.0001);
    const voltesRoda = 2.1 + T * 0.11 + U.visual(-0.15, 0.15);
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
      tCaiguda: -1,
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

  /* ═══ MÀQUINA D'ESTATS DE LA TIRADA ═══
     Avança el temps, dispara la caiguda per velocitat i emet els
     esdeveniments (amb pan estèreo i angles perquè el renderitzador
     situï flaixos i ones on toca). */
  function novaTirada(pla, roda, cb) {
    const emet = cb || (() => {});
    let t = 0, casellaPrevia = null;
    const emesos = { ultims: false, contacte: false, saltFets: new Set(), assentada: false };
    return {
      pla,
      get t() { return t; },
      pas(dt) {
        t += dt;
        /* transició PISTA → CAIGUDA disparada per velocitat angular */
        if (pla.tCaiguda < 0 && t < pla.tC) {
          const v = pla.posicio(t).velBola;
          if (v < pla.omegaMaxBola * 0.17) {
            pla.tCaiguda = t;
            emet({ tipus: 'caiguda' });
          }
        }
        /* últims segons: focus tancat i clima de tensió */
        if (!emesos.ultims && t > pla.tAssentament - 1.6) {
          emesos.ultims = true;
          emet({ tipus: 'ultims' });
        }
        const W = pla.angleRoda(t);
        const p = pla.posicio(t);
        /* pan estèreo segons la posició horitzontal real de la bola */
        const pan = Math.cos(p.beta) * 0.7;

        if (!emesos.contacte && t >= pla.tC) {
          emesos.contacte = true;
          emet({ tipus: 'deflector', força: 1, pan, beta: pla.posicio(pla.tC + 0.001).beta });
        }
        for (let s = 2; s < pla.segments.length; s++) {
          if (!emesos.saltFets.has(s) && t >= pla.segments[s].t1) {
            emesos.saltFets.add(s);
            emet({ tipus: 'salt', força: 1 - (s - 2) * 0.25, pan });
          }
        }
        if (!emesos.assentada && t >= pla.tAssentament) {
          emesos.assentada = true;
          emet({ tipus: 'assentada', pan, beta: p.beta, radi: p.radi });
        }

        /* clics contra els separadors: només quan la bola ja és a
           l'altura de les caselles; freqüència = velocitat relativa */
        if (p.radi < RD.cellaExt + 0.06 && t < pla.tAssentament) {
          const rel = U.wrap(p.beta - W);
          const cella = Math.floor(rel / roda.pas + 0.5) % roda.total;
          if (casellaPrevia !== null && cella !== casellaPrevia) {
            const velRel = Math.abs(p.velBola - pla.velRoda(t));
            emet({ tipus: 'clic', força: U.clamp(velRel / 9, 0.15, 1), pan, rel });
          }
          casellaPrevia = cella;
        }

        if (t >= pla.T) {
          return { t: pla.T, W: pla.angleRoda(pla.T), p: pla.posicio(pla.T), velRoda: 0, acabada: true };
        }
        return { t, W, p, velRoda: pla.velRoda(t), acabada: false };
      },
    };
  }

  return { RD, PORT_ANGLE, N_DEFLECTORS, creaPerfil, plaTirada, novaTirada };
})();
