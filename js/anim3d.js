/* ════════════════════════════════════════════════════════════════
   LA RODA EN TRES DIMENSIONS — Three.js (Fase 4)
   ════════════════════════════════════════════════════════════════
   Geometria tornejada real (bol de fusta, cantell i con de llautó,
   torreta, deflectors), materials PBR amb entorn d'estudi, focus
   càlid amb ombres i UnrealBloom per als reflexos del metall.

   La física és EXACTAMENT la mateixa que a la roda 2D (js/fisica.js):
   aquí només es decideix com es pinta. La llegibilitat de caselles,
   números i noms ve de la mateixa textura pintada a mà que fa servir
   la roda 2D (Anim.capOffscreen()), aplicada a l'anell de caselles.

   Si Three.js no ha carregat (sense connexió), aquest mòdul es
   declara no disponible i la roda 2D continua al seu lloc. */

const Anim3D = (() => {
  const RD = Fisica.RD;
  const PORT_ANGLE = Fisica.PORT_ANGLE;
  const N_DEFLECTORS = Fisica.N_DEFLECTORS;
  const RB = 0.033;                     // radi de la bola (roda = 1)

  let T = null, ADD = null;             // THREE i addons
  let stage, elMon, cnv;
  let renderer, escena, camera, composer, bloom;
  let grupCap, grupBol, bola, ombraTerra, ombraBola;
  let matLlauto, matLlautoPolit, matFusta, matSeparador;
  let texCap = null, anellCap = null;
  let separadors = [], deflectors = [];
  let roda = null;
  let W = U.visual(0, U.TAU);      // angle inicial aleatori, després persistent
  let rafId = 0, ultimT = 0;
  let tirada = null, acabaTirada = null, cbEvents = null;
  let emaFotograma = 16, degradat = false; // mitjana mòbil del cost de fotograma
  let ultimaCasella = -1;
  let brilla = null;                    // {mesh, t0, dur}
  let flaixosEmissius = [];             // {material, t0, base}
  let ones3d = [];                      // {mesh, t0}
  let trapa3d = null;                   // {grup, fulles, idx}
  let bolaAmagada = false;

  const disponible = () => !!(window.THREE);

  /* ─── alçada de la superfície on rodola la bola, segons el radi ───
     ha de casar amb el perfil tornejat del bol i de l'anell */
  function alçadaSuperficie(r) {
    if (r >= RD.pistaInt) return 0.040 + 0.010 * Math.cos(((r - RD.bola) / 0.052) * Math.PI);
    if (r >= RD.davantalInt) return U.lerp(-0.030, 0.040, (r - RD.davantalInt) / (RD.pistaInt - RD.davantalInt));
    return -0.050;
  }
  function posaBola(beta, radi, alçada) {
    bola.position.set(
      Math.cos(beta) * radi,
      alçadaSuperficie(radi) + RB + alçada * 0.075,
      Math.sin(beta) * radi
    );
    /* disc d'ombra: només a la zona de caselles (l'anell no rep
       ombres reals); s'eixampla i s'esvaeix quan la bola salta */
    if (ombraBola) {
      const dins = radi < RD.davantalInt;
      ombraBola.visible = dins && bola.visible;
      if (dins) {
        ombraBola.position.set(Math.cos(beta) * radi, -0.0485, Math.sin(beta) * radi);
        const s = 1 + alçada * 0.7;
        ombraBola.scale.setScalar(s);
        ombraBola.material.opacity = 0.35 / s;
      }
    }
  }

  /* ─── textura de fusta tornejada, generada per codi ─── */
  function texturaFusta() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#2a1a0e';
    g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 150; i++) {
      const y = (i * 47.3) % 256;
      const to = i % 3 === 0 ? '58,36,19' : i % 3 === 1 ? '20,11,6' : '74,48,26';
      g.strokeStyle = `rgba(${to},${0.12 + (i % 5) * 0.05})`;
      g.lineWidth = 0.6 + (i % 4) * 0.5;
      g.beginPath();
      for (let x = 0; x <= 512; x += 16) {
        const yy = y + Math.sin(x * 0.02 + i * 2.1) * 3 + Math.sin(x * 0.11 + i) * 1.2;
        x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
      }
      g.stroke();
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(3, 1);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  /* ─── construcció de l'escena ─── */
  function init(refs) {
    T = window.THREE;
    ADD = window.THREE_ADDONS || null;
    stage = refs.stage;
    elMon = refs.mon;

    cnv = document.createElement('canvas');
    cnv.id = 'cnv3d';
    elMon.appendChild(cnv);

    renderer = new T.WebGLRenderer({ canvas: cnv, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    escena = new T.Scene();
    camera = new T.PerspectiveCamera(38, 1, 0.1, 20);
    camera.position.set(0, 2.28, 1.18);
    camera.lookAt(0, -0.05, 0);

    /* entorn d'estudi: reflexos creïbles al metall sense cap fitxer */
    if (ADD && ADD.RoomEnvironment) {
      const pmrem = new T.PMREMGenerator(renderer);
      escena.environment = pmrem.fromScene(new ADD.RoomEnvironment(), 0.04).texture;
    }

    /* — il·luminació de sala privada — */
    const hemi = new T.HemisphereLight(0xffe9c4, 0x123f2c, 0.75);
    escena.add(hemi);
    const focus = new T.SpotLight(0xffd9a0, 60);
    focus.position.set(0.9, 2.7, 1.3);
    focus.angle = 0.55;
    focus.penumbra = 0.65;
    focus.decay = 1.6;
    focus.castShadow = true;
    focus.shadow.mapSize.set(1024, 1024);
    focus.shadow.bias = -0.0004;
    escena.add(focus, focus.target);
    const contrallum = new T.PointLight(0xffb060, 4, 6, 1.8);
    contrallum.position.set(-1.5, 0.5, -0.9);
    escena.add(contrallum);

    /* — materials — */
    matLlauto = new T.MeshStandardMaterial({
      color: 0xa8863c, metalness: 0.92, roughness: 0.34, envMapIntensity: 1.15,
    });
    matLlautoPolit = new T.MeshStandardMaterial({
      color: 0xc9a54a, metalness: 0.95, roughness: 0.16, envMapIntensity: 1.45,
    });
    matFusta = new T.MeshStandardMaterial({
      color: 0x8a6a4a, metalness: 0.0, roughness: 0.52,
      map: texturaFusta(), envMapIntensity: 0.45,
    });
    matSeparador = new T.MeshStandardMaterial({
      color: 0x9a7c34, metalness: 0.9, roughness: 0.38,
      emissive: 0x000000, envMapIntensity: 0.7,
    });

    construeixBol();

    /* ombra de contacte sobre el tapet CSS de sota */
    ombraTerra = new T.Mesh(
      new T.CircleGeometry(1.5, 48),
      new T.ShadowMaterial({ opacity: 0.38 })
    );
    ombraTerra.rotation.x = -Math.PI / 2;
    ombraTerra.position.y = -0.145;
    ombraTerra.receiveShadow = true;
    escena.add(ombraTerra);

    /* la bola d'ivori */
    bola = new T.Mesh(
      new T.SphereGeometry(RB, 32, 24),
      new T.MeshStandardMaterial({
        color: 0xefe6d2, metalness: 0.06, roughness: 0.24, envMapIntensity: 1.0,
      })
    );
    bola.castShadow = true;
    bola.visible = false;
    escena.add(bola);
    ombraBola = new T.Mesh(
      new T.CircleGeometry(RB * 1.35, 20),
      new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
    );
    ombraBola.rotation.x = -Math.PI / 2;
    ombraBola.visible = false;
    escena.add(ombraBola);

    /* Nota: es va provar UnrealBloomPass, però el compositor no
       conserva la transparència del llenç i la sala CSS quedava
       tapada per un rectangle negre. La lluentor selectiva ve dels
       materials emissius additius i del to ACES. */
  }

  function construeixBol() {
    grupBol = new T.Group();
    escena.add(grupBol);

    /* fusta tornejada: paret exterior, gola de la pista i davantal
       (radis derivats de la geometria canònica RD) */
    const perfilFusta = [
      [0.88, -0.14], [0.985, -0.095], [0.985, 0.050], [0.952, 0.058],
      [RD.llautoInt, 0.050], [RD.bola + 0.024, 0.044], [RD.bola, 0.036],
      [RD.bola - 0.024, 0.044], [RD.pistaInt, 0.040],
      [RD.davantalInt, -0.030], [0.60, -0.054], [0.42, -0.058],
    ].map(([r, y]) => new T.Vector2(r, y));
    const fusta = new T.Mesh(new T.LatheGeometry(perfilFusta, 110), matFusta);
    fusta.receiveShadow = true;
    fusta.castShadow = true;
    grupBol.add(fusta);

    /* cantell de llautó polit al llavi superior */
    const perfilCantell = [
      [RD.llautoInt - 0.007, 0.046], [0.932, 0.062], [0.960, 0.066], [0.985, 0.054],
      [0.985, 0.044], [0.957, 0.055], [0.928, 0.051], [RD.llautoInt - 0.005, 0.038],
    ].map(([r, y]) => new T.Vector2(r, y));
    const cantell = new T.Mesh(new T.LatheGeometry(perfilCantell, 110), matLlautoPolit);
    cantell.receiveShadow = true;
    grupBol.add(cantell);

    /* rombes deflectors, orientació alternada, fixos al bol */
    const geoRombe = new T.OctahedronGeometry(0.045);
    geoRombe.scale(1, 0.42, 0.5);
    for (let i = 0; i < N_DEFLECTORS; i++) {
      const a = i * U.TAU / N_DEFLECTORS + Math.PI / 8;
      const m = new T.Mesh(geoRombe, matLlautoPolit.clone());
      const r = RD.deflector;
      m.position.set(Math.cos(a) * r, alçadaSuperficie(r) + 0.012, Math.sin(a) * r);
      m.rotation.y = -a + (i % 2 ? Math.PI / 2 : 0);
      /* inclinats seguint el pendent del davantal */
      m.rotation.x = Math.sin(-a) * 0.35;
      m.rotation.z = Math.cos(-a) * 0.35;
      m.castShadow = true;
      grupBol.add(m);
      deflectors.push(m);
    }

    /* boca de llançament pneumàtic al cantell */
    const port = new T.Mesh(new T.TorusGeometry(0.030, 0.007, 10, 24), matLlauto);
    port.position.set(Math.cos(PORT_ANGLE) * 0.865, 0.052, Math.sin(PORT_ANGLE) * 0.865);
    port.rotation.x = -Math.PI / 2.3;
    port.rotation.z = -PORT_ANGLE;
    grupBol.add(port);
  }

  /* ─── el cap giratori: textura de caselles + relleus de llautó ─── */
  function construeixCap() {
    if (grupCap) {
      escena.remove(grupCap);
      grupCap.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      separadors = [];
    }
    grupCap = new T.Group();
    escena.add(grupCap);

    /* anell de caselles: la textura pintada a mà de la roda 2D */
    texCap = new T.CanvasTexture(Anim.capOffscreen());
    texCap.colorSpace = T.SRGBColorSpace;
    texCap.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    /* L'anell arriba fins a radi 1,0: així les UV de RingGeometry
       (normalitzades pel radi exterior) mostregen el canvas amb
       mapatge identitat. La zona transparent del canvas més enllà de
       l'anell de noms es retalla amb alphaTest. */
    /* L'anell de caselles va SENSE il·luminació ni mapeig tonal:
       l'ACES dessaturava els colors cap a pastel sota el focus. Amb
       MeshBasic + toneMapped:false la textura es veu EXACTA (com la
       roda 2D); el volum el posen els separadors i les ombres del
       con i de la bola és un disc de contacte. */
    const matAnell = new T.MeshBasicMaterial({
      map: texCap, toneMapped: false,
      transparent: true, alphaTest: 0.35,
    });
    anellCap = new T.Mesh(new T.RingGeometry(RD.eix * 0.9, 1.0, 164, 1), matAnell);
    anellCap.rotation.x = -Math.PI / 2;
    anellCap.position.y = -0.050;
    anellCap.receiveShadow = true;
    grupCap.add(anellCap);

    /* con central de llautó (la textura del con queda a sota, el
       volum real del metall és aquest) */
    const perfilCon = [
      [RD.con, -0.049], [0.32, -0.030], [0.23, 0.004], [0.15, 0.048],
      [RD.eix, 0.066], [0.085, 0.076], [0.045, 0.086], [0.004, 0.090],
    ].map(([r, y]) => new T.Vector2(r, y));
    const matCon = new T.MeshStandardMaterial({
      color: 0x99793a, metalness: 0.9, roughness: 0.44, envMapIntensity: 0.75,
    });
    const con = new T.Mesh(new T.LatheGeometry(perfilCon, 96), matCon);
    con.receiveShadow = true;
    grupCap.add(con);

    /* torreta: braços daurats en creu amb poms esfèrics */
    const geoBraç = new T.CylinderGeometry(0.012, 0.015, RD.torreta, 12);
    const geoPom = new T.SphereGeometry(0.028, 20, 14);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const braç = new T.Mesh(geoBraç, matLlautoPolit);
      braç.rotation.z = Math.PI / 2;
      braç.rotation.y = -a;
      braç.position.set(Math.cos(a) * RD.torreta / 2, 0.094, Math.sin(a) * RD.torreta / 2);
      const pom = new T.Mesh(geoPom, matLlautoPolit);
      pom.position.set(Math.cos(a) * RD.torreta, 0.094, Math.sin(a) * RD.torreta);
      grupCap.add(braç, pom);
    }
    const pomCentral = new T.Mesh(new T.SphereGeometry(0.048, 24, 18), matLlautoPolit);
    pomCentral.position.y = 0.106;
    grupCap.add(pomCentral);

    /* separadors metàl·lics en relleu sobre la textura */
    if (roda) {
      const llarg = RD.cellaExt - RD.cellaInt;
      const rMig = (RD.cellaExt + RD.cellaInt) / 2;
      const geoSep = new T.BoxGeometry(llarg, 0.005, 0.0045);
      for (let i = 0; i < roda.total; i++) {
        const b = (i + 0.5) * roda.pas;
        const m = new T.Mesh(geoSep, matSeparador.clone());
        m.position.set(Math.cos(b) * rMig, -0.0465, Math.sin(b) * rMig);
        m.rotation.y = -b;
        grupCap.add(m);
        separadors.push(m);
      }
    }
    grupCap.rotation.y = -W;
  }

  function reconstrueix(model) {
    if (model) roda = model;
    if (!renderer) return;
    /* la roda 2D repinta la seva textura de caselles i nosaltres la
       reutilitzem: mateixa lletra, mateixos colors, mateixes textures */
    Anim.reconstrueix(model);
    construeixCap();
    renderitzaUn();
  }

  /* ─── encaix del llenç i del focus final ─── */
  function redimensiona() {
    if (!renderer) return;
    const caixa = stage.getBoundingClientRect();
    if (caixa.width < 40 || caixa.height < 40) return;
    elMon.style.width = Math.round(caixa.width) + 'px';
    elMon.style.height = Math.round(caixa.height) + 'px';
    /* supermostreig lleuger: el llenç es veu nítid també en pantalles
       d'1x; la degradació automàtica el retira si el maquinari pateix */
    renderer.setPixelRatio(degradat ? 1 : Math.min(2.6, (window.devicePixelRatio || 1) * 1.3));
    renderer.setSize(Math.round(caixa.width), Math.round(caixa.height), false);
    cnv.style.width = '100%';
    cnv.style.height = '100%';
    camera.aspect = caixa.width / caixa.height;
    camera.updateProjectionMatrix();
    /* la càmera reencaixa la roda amb un petit marge, mesurant la
       projecció real (mateixa filosofia que la roda 2D) */
    const extrems = [
      new T.Vector3(1.0, 0, 0), new T.Vector3(-1.0, 0, 0),
      new T.Vector3(0, 0, 1.0), new T.Vector3(0, 0, -1.0),
      new T.Vector3(0, 0.13, 0),
    ];
    let escalaAjust = 1;
    for (let pasA = 0; pasA < 3; pasA++) {
      let mx = 0, my = 0;
      for (const p of extrems) {
        const v = p.clone().project(camera);
        mx = Math.max(mx, Math.abs(v.x));
        my = Math.max(my, Math.abs(v.y));
      }
      escalaAjust = Math.max(mx / 0.985, my / 0.98);
      camera.position.multiplyScalar(escalaAjust);
      camera.lookAt(0, -0.05, 0);
      camera.updateProjectionMatrix();
    }
    /* el focus dels últims segons apunta a la projecció de la roda */
    const centre = new T.Vector3(0, -0.02, 0).project(camera);
    const vora = new T.Vector3(1, 0, 0).project(camera);
    const cx = caixa.left + (centre.x * 0.5 + 0.5) * caixa.width;
    const cy = caixa.top + (-centre.y * 0.5 + 0.5) * caixa.height;
    const rx = Math.abs(vora.x - centre.x) * 0.5 * caixa.width;
    const arrel = document.documentElement.style;
    arrel.setProperty('--focusX', Math.round(cx) + 'px');
    arrel.setProperty('--focusY', Math.round(cy) + 'px');
    arrel.setProperty('--focusRx', Math.round(rx * 1.25) + 'px');
    arrel.setProperty('--focusRy', Math.round(rx * 0.95) + 'px');
    renderitzaUn();
  }

  /* ─── bucle ─── */
  function arrencaBucle() {
    if (!rafId) {
      ultimT = performance.now();
      rafId = requestAnimationFrame(fotograma);
    }
  }
  const calAnimar = () =>
    !!(tirada || brilla || flaixosEmissius.length || ones3d.length || trapa3d);

  function renderitza() {
    renderer.render(escena, camera);
  }
  function renderitzaUn() {
    if (!renderer) return;
    grupCap.rotation.y = -W;
    if (!tirada && !bolaAmagada && ultimaCasella >= 0 && roda) {
      bola.visible = true;
      posaBola(ultimaCasella * roda.pas + W, RD.repos, 0);
    }
    renderitza();
  }

  function fotograma(ara) {
    rafId = 0;
    const frameMs = ara - ultimT;
    /* la física és de forma tancada (funcions del temps absolut):
       es pot avançar amb passos grans sense inestabilitat, i així el
       temps simulat segueix el rellotge encara que el maquinari vagi
       lent (p. ex. WebGL per programari) */
    const dt = Math.min(0.25, frameMs / 1000);
    ultimT = ara;
    const araMs = performance.now();
    /* degradació automàtica si el framerate cau: fora ombres i DPR 1 */
    emaFotograma = emaFotograma * 0.9 + frameMs * 0.1;
    if (!degradat && emaFotograma > 80) {
      degradat = true;
      renderer.shadowMap.enabled = false;
      renderer.setPixelRatio(1);
      escena.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    }

    /* el zoom dels últims segons és de CÀMERA (l'escala CSS difuminaria
       el llenç): s'apropa suaument i torna en acabar */
    {
      const objectiu = document.body.classList.contains('final-tirada') ? 1.075 : 1;
      const nou = camera.zoom + (objectiu - camera.zoom) * Math.min(1, dt * 3.2);
      if (Math.abs(nou - camera.zoom) > 0.0004) {
        camera.zoom = nou;
        camera.updateProjectionMatrix();
      }
    }
    if (tirada) {
      const r = tirada.viva.pas(dt);
      W = r.W;
      grupCap.rotation.y = -W;
      if (r.acabada) {
        ultimaCasella = tirada.pla.idxObjectiu;
        const fi = acabaTirada;
        tirada = null; acabaTirada = null;
        document.body.classList.remove('tirant');
        Audio.fotogramaTirada(null);
        renderitzaUn();
        fi && fi();
      } else {
        bola.visible = true;
        posaBola(r.p.beta, r.p.radi, r.p.alçada);
        Audio.fotogramaTirada({
          velRoda: Math.abs(r.velRoda),
          velBola: Math.abs(r.p.velBola),
          enPista: r.p.radi > RD.pistaInt,
        });
      }
    }

    /* brillantor de la juntura (batec de suspens) */
    if (brilla) {
      const u = (araMs - brilla.t0) / brilla.dur;
      if (u >= 1) {
        grupCap.remove(brilla.mesh);
        brilla.mesh.geometry.dispose();
        brilla.mesh.material.dispose();
        brilla = null;
      } else {
        brilla.mesh.material.opacity = Math.sin(Math.min(1, u) * Math.PI) * 0.85;
      }
    }
    /* flaixos emissius de separadors i deflectors */
    flaixosEmissius = flaixosEmissius.filter(f => {
      const u = (araMs - f.t0) / 240;
      if (u >= 1) { f.material.emissive.setHex(0x000000); return false; }
      f.material.emissive.setHex(0xffdd88);
      f.material.emissiveIntensity = (1 - u) * 1.6;
      return true;
    });
    /* ones expansives de l'assentament */
    ones3d = ones3d.filter(o => {
      const u = (araMs - o.t0) / 340;
      if (u >= 1) {
        escena.remove(o.mesh);
        o.mesh.geometry.dispose();
        o.mesh.material.dispose();
        return false;
      }
      o.mesh.scale.setScalar(1 + u * 2.6);
      o.mesh.material.opacity = (1 - u) * 0.5;
      return true;
    });

    if (tirada || calAnimar()) renderitza();
    if (calAnimar()) rafId = requestAnimationFrame(fotograma);
    else { Audio.fotogramaTirada(null); renderitzaUn(); }
  }

  /* ─── execució de la tirada (idèntica física que la roda 2D) ─── */
  function tira(idxObjectiu, durada, cb) {
    return new Promise(res => {
      cbEvents = cb || (() => {});
      acabaTirada = res;
      const pla = Fisica.plaTirada(W, roda, idxObjectiu, durada);
      const viva = Fisica.novaTirada(pla, roda, ev => {
        if (ev.tipus === 'clic') flaixSeparador(ev.rel);
        else if (ev.tipus === 'deflector') flaixDeflector(ev.beta);
        else if (ev.tipus === 'assentada') onaExpansiva(ev.beta, ev.radi);
        cbEvents(ev);
      });
      tirada = { pla, viva };
      ultimaCasella = -1;
      bolaAmagada = false;
      document.body.classList.add('tirant');
      arrencaBucle();
    });
  }

  function flaixSeparador(rel) {
    if (!separadors.length) return;
    const i = Math.round(rel / roda.pas - 0.5) % roda.total;
    const m = separadors[(i + roda.total) % roda.total];
    flaixosEmissius.push({ material: m.material, t0: performance.now() });
    if (flaixosEmissius.length > 10) {
      const vell = flaixosEmissius.shift();
      vell.material.emissive.setHex(0x000000);
    }
  }
  function flaixDeflector(beta) {
    let millor = 0, dist = 1e9;
    for (let j = 0; j < N_DEFLECTORS; j++) {
      const a = j * U.TAU / N_DEFLECTORS + Math.PI / 8;
      const d = Math.abs(U.difAngular(beta, a));
      if (d < dist) { dist = d; millor = j; }
    }
    flaixosEmissius.push({ material: deflectors[millor].material, t0: performance.now() });
  }
  function onaExpansiva(beta, radi) {
    const m = new T.Mesh(
      new T.RingGeometry(0.030, 0.045, 32),
      new T.MeshBasicMaterial({
        color: 0xffe9b0, transparent: true, opacity: 0.5,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(Math.cos(beta) * radi, alçadaSuperficie(radi) + 0.01, Math.sin(beta) * radi);
    escena.add(m);
    ones3d.push({ mesh: m, t0: performance.now() });
  }

  /* brillantor de la juntura del fons (el batec de suspens) */
  function brillaJuntura(idx, dur) {
    if (brilla) {
      grupCap.remove(brilla.mesh);
      brilla.mesh.geometry.dispose();
      brilla.mesh.material.dispose();
    }
    const pas = roda.pas;
    /* el mapatge textura→geometria inverteix el signe de l'angle */
    const geo = new T.RingGeometry(RD.repos - 0.06, RD.repos + 0.06, 24, 1,
      -(idx * pas + pas / 2) + 0.006, pas - 0.012);
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({
      color: 0xffe9b0, transparent: true, opacity: 0,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.044;
    grupCap.add(m);
    brilla = { mesh: m, t0: performance.now(), dur };
    arrencaBucle();
  }

  /* ─── la trampa: el fons de la casella cedeix ─── */
  function obreTrampa(idx) {
    return new Promise(res => {
      const pas = roda.pas;
      const rMig = RD.repos;
      const ampleCel = pas * rMig * 0.92;
      const grup = new T.Group();
      /* forat fosc sota la casella */
      const forat = new T.Mesh(
        new T.RingGeometry(rMig - 0.075, rMig + 0.075, 16, 1,
          -(idx * pas + pas / 2) + 0.004, pas - 0.008),
        new T.MeshBasicMaterial({ color: 0x050505, side: T.DoubleSide })
      );
      forat.rotation.x = -Math.PI / 2;
      forat.position.y = -0.0485;
      grup.add(forat);
      /* dues fulles metàl·liques que s'obren tangencialment */
      const fulles = [];
      for (const costat of [-1, 1]) {
        const f = new T.Mesh(
          new T.BoxGeometry(0.15, 0.004, ampleCel / 2),
          new T.MeshStandardMaterial({ color: 0x8f8f96, metalness: 0.9, roughness: 0.35 })
        );
        const a = idx * pas;
        f.position.set(Math.cos(a) * rMig, -0.046, Math.sin(a) * rMig);
        f.rotation.y = -a;
        f.userData.costat = costat;
        f.userData.a = a;
        grup.add(f);
        fulles.push(f);
      }
      grupCap.add(grup);
      trapa3d = { grup, fulles, idx, ample: ampleCel };
      ultimaCasella = -1;
      arrencaBucle();
      const t0 = performance.now();
      (function pasA() {
        const u = Math.min(1, (performance.now() - t0) / 620);
        const e = U.easeOutCubic(u);
        for (const f of fulles) {
          const a = f.userData.a;
          const d = f.userData.costat * e * (ampleCel / 2) * 0.98;
          /* les fulles llisquen en direcció tangencial */
          f.position.set(
            Math.cos(a) * rMig - Math.sin(a) * d,
            -0.046,
            Math.sin(a) * rMig + Math.cos(a) * d
          );
        }
        /* la bola s'enfonsa pel forat */
        if (u > 0.35) {
          const v = U.clamp((u - 0.35) / 0.55, 0, 1);
          bola.position.y -= v * 0.004;
          bola.scale.setScalar(1 - v * 0.65);
          if (v >= 1) { bola.visible = false; ombraBola.visible = false; bola.scale.setScalar(1); bolaAmagada = true; }
        }
        if (u < 1) requestAnimationFrame(pasA);
        else { bola.visible = false; ombraBola.visible = false; bola.scale.setScalar(1); bolaAmagada = true; res(); }
      })();
    });
  }
  function tancaTrampa() {
    return new Promise(res => {
      if (!trapa3d) return res();
      const { grup, fulles, ample } = trapa3d;
      const t0 = performance.now();
      arrencaBucle();
      (function pasT() {
        const u = Math.min(1, (performance.now() - t0) / 420);
        const e = 1 - U.easeInOutQuad(u);
        const rMig = RD.repos;
        for (const f of fulles) {
          const a = f.userData.a;
          const d = f.userData.costat * e * (ample / 2) * 0.98;
          f.position.set(
            Math.cos(a) * rMig - Math.sin(a) * d,
            -0.046,
            Math.sin(a) * rMig + Math.cos(a) * d
          );
        }
        if (u < 1) requestAnimationFrame(pasT);
        else {
          grupCap.remove(grup);
          grup.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
          });
          trapa3d = null;
          res();
        }
      })();
    });
  }

  /* petit puls de zoom de càmera; el bucle el retorna a 1 tot sol */
  function pulsCamera(z) {
    if (!camera) return;
    camera.zoom = z;
    camera.updateProjectionMatrix();
    arrencaBucle();
  }

  return {
    disponible, init, redimensiona, reconstrueix, tira, pulsCamera,
    brillaJuntura, obreTrampa, tancaTrampa,
    esbossaBolaEnRepos: () => { ultimaCasella = -1; renderitzaUn(); },
    get roda() { return roda; },
  };
})();
