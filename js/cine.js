/* ════════════════════════════════════════════════════════════════
   CINE — capa de coreografia amb GSAP (CDN)
   Només presentació: entrades d'elements, cops de càmera, elasticitat.
   Si GSAP no ha carregat (sense connexió), tot cau en silenci a les
   transicions CSS existents: cap funcionalitat en depèn.
   ════════════════════════════════════════════════════════════════ */
const Cine = (() => {
  const on = typeof window.gsap !== 'undefined';
  if (on) document.body.classList.add('te-gsap');

  /* entrada genèrica: suspèn la transició CSS mentre dura el tween i
     neteja les propietats en acabar perquè el CSS recuperi el control */
  function entra(el, de, a) {
    if (!on || !el) return;
    const tr = el.style.transition;
    el.style.transition = 'none';
    gsap.killTweensOf(el);
    gsap.fromTo(el, de, Object.assign({}, a, {
      onComplete() {
        gsap.set(el, { clearProps: 'transform,opacity' });
        requestAnimationFrame(() => { el.style.transition = tr; });
      },
    }));
  }

  return {
    on,

    /* la carta de la celebració apareix amb pes */
    carta(el) {
      entra(el, { y: 30, scale: 0.94, opacity: 0 },
        { y: 0, scale: 1, opacity: 1, duration: 0.65, ease: 'power3.out' });
    },
    /* el nom del guanyador: escala elàstica del conjunt i, a dins,
       cada lletra es revela enfocant-se amb un petit desfasament */
    nom(el) {
      if (!on || !el) return;
      gsap.killTweensOf(el);
      const text = el.textContent;
      el.textContent = '';
      const lletres = [];
      for (const c of text) {
        const s = document.createElement('span');
        s.className = 'lletra';
        s.textContent = c === ' ' ? ' ' : c;
        el.appendChild(s);
        lletres.push(s);
      }
      gsap.fromTo(el,
        { scale: 0.12, opacity: 0 },
        { scale: 1, opacity: 1, duration: 1.15, ease: 'elastic.out(1, 0.38)' });
      gsap.fromTo(lletres,
        { opacity: 0, y: '0.4em', filter: 'blur(7px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.5,
          stagger: 0.045, ease: 'power2.out', delay: 0.1 });
    },
    /* empenta de càmera en tirar: la sala s'inclina cap a la roda.
       En mode 3D el puls és de càmera real (l'escala CSS difuminaria). */
    preTirada() {
      if (document.body.classList.contains('mode-3d')) {
        Anim3D.pulsCamera(1.035);
        return;
      }
      if (!on) return;
      const mon = document.getElementById('mon3d');
      gsap.killTweensOf(mon);
      gsap.fromTo(mon, { scale: 1 },
        { scale: 1.03, duration: 0.7, ease: 'power2.out',
          yoyo: true, repeat: 1, clearProps: 'transform' });
    },
    /* sacsejada curta quan la bola pica un deflector (sincronitzada
       amb el so): va a l'escenari per no barallar-se amb el zoom */
    sacsejaCamera() {
      if (!on) return;
      const esc = document.getElementById('escenari');
      gsap.killTweensOf(esc);
      gsap.fromTo(esc, { x: 0, y: 0 },
        { x: 4, y: -2, duration: 0.045, repeat: 5, yoyo: true,
          ease: 'none', clearProps: 'transform' });
    },
    /* aberració cromàtica: un espasme de lent, mai més de mig segon.
       No depèn de GSAP: és una classe amb un filtre SVG. */
    aberra(ms) {
      if (document.body.classList.contains('mode-calma')) return;
      const app = document.getElementById('app');
      app.classList.add('aberracio');
      setTimeout(() => app.classList.remove('aberracio'), ms);
    },
    /* cop de càmera sobre la roda en el moment de l'impacte */
    copCamera(fort) {
      if (document.body.classList.contains('mode-3d')) {
        Anim3D.pulsCamera(fort ? 1.1 : 1.06);
        return;
      }
      if (!on) return;
      const mon = document.getElementById('mon3d');
      gsap.killTweensOf(mon);
      gsap.fromTo(mon, { scale: fort ? 1.14 : 1.09 },
        { scale: 1, duration: fort ? 0.85 : 0.6, ease: 'power2.out', clearProps: 'transform' });
    },
    llibre(el) {
      entra(el, { y: 36, scale: 0.975, opacity: 0 },
        { y: 0, scale: 1, opacity: 1, duration: 0.55, ease: 'power3.out' });
    },
    calaix(el) {
      entra(el, { x: 64, opacity: 0.5 },
        { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
    },
    fitxa(el) {
      entra(el, { scale: 0.9, y: 14, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.7)' });
    },
    banner(el) {
      entra(el, { scale: 1.42, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.34, ease: 'back.out(2.1)' });
    },
    confirmacio(el) {
      entra(el, { scale: 0.92, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.8)' });
    },
    cortina(retol) {
      entra(retol, { letterSpacing: '0.62em', opacity: 0, y: 16 },
        { letterSpacing: '0.3em', opacity: 1, y: 0, duration: 1.05, ease: 'power2.out' });
    },
    avis(el) {
      /* el toast es centra amb translateX(-50%): es conserva al tween */
      entra(el, { y: 10, opacity: 0, xPercent: -50 },
        { y: 0, opacity: 1, xPercent: -50, duration: 0.3, ease: 'power2.out' });
    },
  };
})();
