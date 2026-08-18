/* ════════════════════════════════════════════════════════════════
   ORQUESTRADOR — el flux de la incidència
   Escriure → tirar → (trampa?) → assignar → desar al registre
   ════════════════════════════════════════════════════════════════ */

/* El motor de la roda: Anim (canvas 2D, sempre disponible) o Anim3D
   (Three.js, si el CDN ha carregat). Tots dos parlen la mateixa API i
   comparteixen la física de js/fisica.js. */
let MotorRoda = null;

const Main = (() => {
  let estat = 'repos';          // repos | tirant
  let roda = null;
  const espera = ms => new Promise(r => setTimeout(r, ms));

  function refrescaRoda() {
    let actius = Estat.actius();
    /* amb la taula tancada (0 actius) es mostra la roda de tothom */
    if (!actius.length) actius = Estat.d.participants;
    roda = generaRoda(actius);
    MotorRoda.reconstrueix(roda);
    UI.refresca();
  }

  /* ─── el batec de suspens: a TOTES les tirades ───
     clic mecànic sota la casella, la juntura s'il·lumina, i 600-800 ms
     de silenci absolut. Si només sonés quan hi ha trampa, el silenci
     delataria el resultat. */
  async function batec(idx) {
    await espera(230);
    Audio.clicMecanic();               // sec, fora de l'atenuador
    MotorRoda.brillaJuntura(idx, 340);
    Audio.ducA(0, 200);                // cau tot l'ambient: silenci real
    await espera(660 + U.visual(0, 140));
  }

  function gestorEvents(ev) {
    switch (ev.tipus) {
      case 'caiguda':
        Audio.caigudaPista();
        break;
      case 'ultims':
        document.body.classList.add('final-tirada');
        UI.croupier('No hi ha marxa enrere.');
        Audio.ambientA(0.3, 1400); /* la sala calla, el mecanisme mana */
        break;
      case 'clic':
        Audio.clicSeparador(ev.força, ev.pan || 0);
        break;
      case 'deflector':
        Audio.rebotDeflector(ev.força || 1, ev.pan || 0);
        Cine.sacsejaCamera();
        break;
      case 'salt':
        Audio.saltCasella(ev.força || 1, ev.pan || 0);
        break;
      case 'assentada':
        Audio.assentament(ev.pan || 0);
        break;
    }
  }

  /* ─── LA TIRADA ─── */
  async function tirar() {
    if (estat !== 'repos') return;
    if (!RNG.disponible) {
      UI.avisPersistent('El generador criptogràfic del navegador no està disponible. La taula queda tancada: no s’hi pot jugar sense atzar honest.');
      return;
    }
    const text = UI.textIncidencia();
    if (!text) return;
    if (Estat.actius().length < 2) {
      UI.avis(Estat.actius().length === 0
        ? 'Tots els participants són absents. Obre els ajustos i retorna algú a la taula.'
        : 'Només queda un participant actiu: no hi ha res a sortejar.');
      return;
    }

    estat = 'tirant';
    Audio.assegura();
    UI.segellaPlaca();
    UI.croupier('Faites vos jeux.');
    Audio.premBoto();
    Cine.preTirada();

    /* la cadena sencera es decideix ARA, abans de moure res */
    const passos = planificaCadena(roda, Estat.d.config.probTrampa);
    const numIncidencia = Estat.numSeguent();

    try {
      for (let i = 0; i < passos.length; i++) {
        const pas = passos[i];
        const durada = i === 0
          ? Estat.d.config.durada
          : Math.max(5.5, Estat.d.config.durada * 0.62);
        if (i > 0) UI.croupier('La tirada es repeteix.');
        setTimeout(() => {
          if (estat === 'tirant') UI.croupier('La sort està decidida...');
        }, 1600);

        await MotorRoda.tira(pas.idx, durada, gestorEvents);
        document.body.classList.remove('final-tirada');

        /* el batec: clic, juntura, silenci... i llavors es resol */
        await batec(pas.idx);

        if (pas.trampa) {
          /* el fons cedeix: la persona s'ha salvat i el sorteig recomença */
          const c = roda.caselles[pas.idx];
          const esJefe = !c.propietari;
          Audio.ducA(1, 350);
          await Trampa.executa(pas.idx, Math.min(i + 1, 3), esJefe);
        } else {
          /* el fons aguanta: la incidència té destinatari */
          const c = roda.caselles[pas.idx];
          const id = c.propietari ? c.propietari.id : 'jefe';
          const nom = c.propietari ? c.propietari.nom : Estat.d.jefe.nom;
          const cadena = passos.map(p => {
            const cc = roda.caselles[p.idx];
            return cc.propietari
              ? { id: cc.propietari.id, nom: cc.propietari.nom }
              : { id: 'jefe', nom: Estat.d.jefe.nom };
          });

          /* ratxa: tirades seguides guanyades per la mateixa persona */
          let ratxa = 1;
          for (let j = Estat.d.entrades.length - 1; j >= 0; j--) {
            if ((Estat.d.entrades[j].guanyadorId || null) === id) ratxa++;
            else break;
          }

          const entrada = Estat.afegeixEntrada({
            num: numIncidencia,
            sessio: Estat.d.sessio,
            text,
            guanyador: nom,
            guanyadorId: id,
            cadena: cadena.length > 1 ? cadena : null,
            casella: c.num,
            timestamp: Date.now(),
          });

          const total = Estat.d.entrades.filter(e => (e.guanyadorId || null) === id).length;
          UI.croupier('La incidència és teva.');
          await Celebracio.mostra({ entrada, total, ratxa, esZero: id === 'jefe' });
        }
      }
    } finally {
      estat = 'repos';
      document.body.classList.remove('final-tirada', 'emergencia');
      document.getElementById('app').classList.remove('tremola-continu');
      Audio.ducA(1, 400);
      Audio.ambientA(1, 900);
      UI.desegellaPlaca();
      UI.refresca();
      if (Registre.oberta()) Registre.pintaLlista();
    }
  }

  /* ─── arrencada ─── */
  function boot() {
    UI.init();
    Anim.init({
      stage: document.getElementById('escenari'),
      pla: document.getElementById('plaRoda'),
      bol: document.getElementById('cnvBol'),
      roda: document.getElementById('cnvRoda'),
      fx: document.getElementById('cnvFx'),
    });
    Particules.init(document.getElementById('cnvParticules'));
    Trampa.init({
      panell: document.getElementById('trampa'),
      escena: document.getElementById('trampaEscena'),
      banner: document.getElementById('bannerTrampa'),
    });
    Celebracio.init();
    Registre.init();

    MotorRoda = Anim;
    refrescaRoda();
    MotorRoda.redimensiona();
    /* el primer càlcul de mida pot arribar abans que la graella assenti */
    requestAnimationFrame(() => MotorRoda.redimensiona());
    /* quan arriben les fonts del CDN, la roda es redibuixa amb elles */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => MotorRoda.reconstrueix());
    }

    /* Three.js es carrega mandrosament DESPRÉS d'arrencar: la pàgina
       apareix a l'instant amb la roda 2D i puja a 3D quan el mòdul
       arriba. Qualsevol fallada deixa la roda 2D al seu lloc. */
    function activa3D() {
      if (!Anim3D.disponible() || MotorRoda === Anim3D) return;
      /* mai a mitja tirada: s'espera al repòs */
      if (estat !== 'repos') { setTimeout(activa3D, 1500); return; }
      try {
        Anim3D.init({
          stage: document.getElementById('escenari'),
          mon: document.getElementById('mon3d'),
        });
        Anim3D.reconstrueix(roda);
        document.body.classList.add('mode-3d');
        MotorRoda = Anim3D;
        Anim3D.redimensiona();
      } catch (e) {
        document.body.classList.remove('mode-3d');
        MotorRoda = Anim;
        MotorRoda.redimensiona();
      }
    }
    (async () => {
      try {
        const THREE = await import('three');
        const [amb, com, ren, flor, sor] = await Promise.all([
          import('three/addons/environments/RoomEnvironment.js'),
          import('three/addons/postprocessing/EffectComposer.js'),
          import('three/addons/postprocessing/RenderPass.js'),
          import('three/addons/postprocessing/UnrealBloomPass.js'),
          import('three/addons/postprocessing/OutputPass.js'),
        ]);
        window.THREE = THREE;
        window.THREE_ADDONS = {
          RoomEnvironment: amb.RoomEnvironment,
          EffectComposer: com.EffectComposer,
          RenderPass: ren.RenderPass,
          UnrealBloomPass: flor.UnrealBloomPass,
          OutputPass: sor.OutputPass,
        };
        activa3D();
      } catch (e) {
        /* sense connexió: la roda 2D es queda, en silenci */
      }
    })();

    let timerMida = 0;
    window.addEventListener('resize', () => {
      clearTimeout(timerMida);
      timerMida = setTimeout(() => {
        MotorRoda.redimensiona();
        Particules.redimensiona();
      }, 140);
    });

    if (!RNG.disponible) {
      UI.avisPersistent('El generador criptogràfic del navegador no està disponible. La taula queda tancada: no s’hi pot jugar sense atzar honest.');
    }
  }

  return { tirar, refrescaRoda, boot, estat: () => estat };
})();

document.addEventListener('DOMContentLoaded', () => Main.boot());
