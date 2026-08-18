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
    ext: 0.985, llautoInt: 0.912, pistaInt: 0.822, bola: 0.870,
    davantalInt: 0.728, deflector: 0.778,
    cellaExt: 0.722, cellaInt: 0.400, repos: 0.545,
    con: 0.400, torreta: 0.27, eix: 0.108,
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
    /* Cada tirada surt diferent: la durada balla una mica, la bola surt
       amb una EMPENTA aleatòria dins d'una banda sempre ràpida, i
       l'energia residual del primer impacte decideix quant viatja
       després — de gairebé res a més de deu caselles. */
    const T = durada * U.visual(0.94, 1.07);
    const pas = roda.pas;

    /* — roda: arrenca en 0,45 s, frena quasi constant, i el nombre de
       voltes balla prou perquè mai no s'aturi a la mateixa posició — */
    const perfilRoda = creaPerfil(x => Math.min(1, x / 0.045) * Math.pow(1 - x, 1.25) + 0.0001);
    const voltesRoda = 2.0 + T * 0.11 + U.visual(-0.45, 0.45);
    const LW = -U.TAU * voltesRoda;                   // la roda gira antihorari
    const angleRoda = t => W0 + LW * perfilRoda.pos(U.clamp(t / T, 0, 1));
    const velRoda = t => LW * perfilRoda.vel(U.clamp(t / T, 0, 1)) / T;

    /* — llançament: sempre ràpid, mai idèntic — */
    const empenta = U.visual(0.85, 1.45);
    /* energia residual al primer contacte: creix amb l'empenta i duu
       el seu propi atzar (el mateix cop de mà no cau mai igual) */
    const energia = U.clamp((empenta - 0.85) * 1.9 + U.visual(-0.15, 0.5), 0, 1.7);

    /* — recorregut DESPRÉS del contacte, funció de l'energia:
       lliscada ∝ energia² (com l'energia cinètica) + salts sencers — */
    const nSalts = Math.max(0, Math.min(4, Math.round(energia * 2.3 + U.visual(-0.7, 0.7))));
    const lliscada = pas * (0.2 + energia * energia * 3.2 + U.visual(0, 0.9));
    const marge = lliscada + nSalts * pas;            // recorregut relatiu total
    const relObjectiu = idxObjectiu * pas;            // angle local del centre decidit

    /* la fase de rebots dura segons el que s'ha de recórrer */
    const tAssentament = T * 0.80;
    const Tb = U.clamp(0.55 + (marge / pas) * 0.16 + nSalts * 0.05, 0.75, 2.6);

    /* — fase de pista: perfil sostingut al principi, caiguda marcada al
       final (mai un easeOut clàssic: arribaria mort al moment de caure) — */
    const perfilBola = creaPerfil(x => Math.pow(1 - 0.86 * x, 1.6) + 0.045);
    const B0 = PORT_ANGLE;

    /* tC es retoca lleugerament perquè el primer contacte caigui a la
       vora d'un rombe deflector real */
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
       contacte exacte — β(tC) = W(tC) + relObjectiu − marge (mod 2π).
       Les voltes de la bola porten l'empenta a dins: es VEU la
       diferència de velocitat entre tirades. */
    const relContacte = relObjectiu - marge;
    const feta = U.wrap(angleRoda(tC) + relContacte - B0);
    const voltesBola = Math.max(4, Math.round((3.4 + T * 0.40) * empenta + U.visual(-0.2, 0.2)));
    const DA = feta + U.TAU * voltesBola;             // sempre positiu: la bola va horària

    /* — segments de la fase de rebots (temps absolut, espai relatiu) —
       rebot(s) al deflector amb alçada real, lliscada que crema
       l'energia, salts sencers de casella i un tremolor d'assentament */
    const segments = [];
    {
      const durs = [], avanç = [], tipus = [];
      durs.push(0.16 + energia * 0.05); avanç.push(lliscada * 0.42); tipus.push('rebot1');
      const dosRebots = energia > 0.8 && Math.random() < 0.7;
      if (dosRebots) { durs.push(0.13); avanç.push(lliscada * 0.18); tipus.push('rebot2'); }
      durs.push(0.30 + energia * 0.08);
      avanç.push(lliscada * (dosRebots ? 0.40 : 0.58));
      tipus.push('lliscada');
      for (let h = 0; h < nSalts; h++) {
        durs.push(0.32 - h * 0.045 + U.visual(-0.02, 0.02));
        avanç.push(pas);
        tipus.push('salt');
      }
      durs.push(0.22); avanç.push(0); tipus.push('tremolor');
      const totalDur = durs.reduce((a, b) => a + b, 0);
      let t0 = tC, rel = relContacte, salt = 0;
      for (let s = 0; s < durs.length; s++) {
        const d = durs[s] * Tb / totalDur;
        segments.push({
          t0, t1: t0 + d, rel0: rel, rel1: rel + avanç[s],
          tipus: tipus[s], salt: tipus[s] === 'salt' ? salt++ : 0,
        });
        t0 += d; rel += avanç[s];
      }
    }

    const ompleRebots = t => {
      for (const s of segments) {
        if (t <= s.t1 || s === segments[segments.length - 1]) {
          const u = U.clamp((t - s.t0) / (s.t1 - s.t0), 0, 1);
          let radi = RD.repos, alçada = 0;
          let rel = U.lerp(s.rel0, s.rel1, u);
          if (s.tipus === 'rebot1') {
            /* xoc amb el deflector: surt disparada enfora i AMUNT */
            const bomba = Math.sin(u * Math.PI);
            rel = U.lerp(s.rel0, s.rel1, U.easeOutQuad(u));
            radi = U.lerp(RD.deflector, RD.repos + 0.03, U.easeInQuad(u)) + bomba * 0.05;
            alçada = Math.pow(bomba, 0.85) * (0.45 + 0.35 * energia);
          } else if (s.tipus === 'rebot2') {
            const bomba = Math.sin(u * Math.PI);
            radi = RD.repos + 0.03 - u * 0.02 + bomba * 0.02;
            alçada = bomba * (0.2 + 0.15 * energia);
          } else if (s.tipus === 'lliscada') {
            rel = U.lerp(s.rel0, s.rel1, U.easeOutQuad(u));
            radi = U.lerp(RD.repos + 0.01, RD.repos, u);
            alçada = Math.sin(u * Math.PI) * 0.05; /* rodolament viu */
          } else if (s.tipus === 'salt') {
            alçada = Math.sin(u * Math.PI) * (0.5 - 0.11 * s.salt);
          } else { /* tremolor d'assentament: la bola es queda al lloc */
            alçada = Math.abs(Math.sin(u * Math.PI * 2)) * 0.09 * (1 - u);
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
            /* la caiguda es dispara per VELOCITAT (no per temps): la bola
               baixa en ESPIRAL pel davantal, amb una ondulació suau,
               fins a arribar al deflector just al contacte */
            const u = U.clamp((t - this.tCaiguda) / Math.max(0.001, tC - this.tCaiguda), 0, 1);
            radi = U.lerp(RD.bola, RD.deflector, U.easeInQuad(u))
                 + Math.sin(u * Math.PI * 2.6) * 0.012 * (1 - u);
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
        for (let s = 0; s < pla.segments.length; s++) {
          const seg = pla.segments[s];
          if (emesos.saltFets.has(s) || t < seg.t1) continue;
          emesos.saltFets.add(s);
          if (seg.tipus === 'rebot2') {
            emet({ tipus: 'deflector', força: 0.55, pan, beta: p.beta });
          } else if (seg.tipus === 'salt') {
            emet({ tipus: 'salt', força: 1 - seg.salt * 0.22, pan });
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
