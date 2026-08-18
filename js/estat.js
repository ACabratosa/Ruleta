/* ════════════════════════════════════════════════════════════════
   ESTAT I PERSISTÈNCIA
   localStorage amb clau versionada; si el navegador el bloqueja
   sota file://, es continua en memòria sense mostrar cap error.
   Les entrades del registre són immutables i només s'hi afegeix.
   ════════════════════════════════════════════════════════════════ */
const CLAU_MAGATZEM = 'casino-des-incidencies:v1';
const COLOR_JEFE = '#0E6B43';

/* Paleta de la casa per als participants — el verd queda reservat al Jefe */
const PALETA = [
  { nom: 'Granat',    hex: '#8C2F39' },
  { nom: 'Safir',     hex: '#2F4E7E' },
  { nom: 'Pruna',     hex: '#6B4487' },
  { nom: 'Coure',     hex: '#A85C28' },
  { nom: 'Bordeus',   hex: '#5C2130' },
  { nom: 'Blau nit',  hex: '#23395C' },
  { nom: 'Magenta',   hex: '#8E2F63' },
  { nom: 'Terracota', hex: '#B04F2F' },
  { nom: 'Acer',      hex: '#4E6274' },
  { nom: 'Or vell',   hex: '#96772A' },
  { nom: 'Lila fosc', hex: '#4C3A73' },
  { nom: 'Carmí',     hex: '#A03040' },
];

const Estat = (() => {
  let memoria = null;      // còpia serialitzada si localStorage falla
  let usaMemoria = false;

  const defecte = () => ({
    v: 1,
    participants: [
      { id: 'p1', nom: 'Arnau',   color: '#8C2F39', absent: false },
      { id: 'p2', nom: 'Barroso', color: '#2F4E7E', absent: false },
      { id: 'p3', nom: 'Culex',   color: '#6B4487', absent: false },
      { id: 'p4', nom: 'Stalin',  color: '#A85C28', absent: false },
    ],
    jefe: { nom: 'Jefe' },
    sessio: 1,
    seguentId: 5,
    entrades: [],
    config: { probTrampa: 5, durada: 10, calma: false, silenci: false },
  });

  function valida(d) {
    if (!d || typeof d !== 'object' || d.v !== 1) return null;
    if (!Array.isArray(d.participants) || !Array.isArray(d.entrades)) return null;
    const base = defecte();
    d.config = Object.assign(base.config, d.config || {});
    d.jefe = Object.assign(base.jefe, d.jefe || {});
    d.sessio = Math.max(1, d.sessio | 0);
    d.seguentId = Math.max(1, d.seguentId | 0);
    return d;
  }

  function carrega() {
    try {
      const brut = localStorage.getItem(CLAU_MAGATZEM);
      if (brut) {
        const d = valida(JSON.parse(brut));
        if (d) return d;
      }
    } catch (e) { usaMemoria = true; }
    return defecte();
  }

  const d = carrega();

  function desa() {
    const brut = JSON.stringify(d);
    if (!usaMemoria) {
      try { localStorage.setItem(CLAU_MAGATZEM, brut); return; }
      catch (e) { usaMemoria = true; }
    }
    memoria = brut; // silenciós: mai un error tècnic visible
  }

  /* ─── Consultes ─── */
  const actius = () => d.participants.filter(p => !p.absent);
  const perId = id => id === 'jefe'
    ? { id: 'jefe', nom: d.jefe.nom, color: COLOR_JEFE }
    : d.participants.find(p => p.id === id) || null;
  /* Nom actual d'un id; si el participant ja no existeix, el nom desat */
  const nomDe = (id, nomDesat) => { const p = perId(id); return p ? p.nom : (nomDesat || '—'); };
  const entradesSessio = s => d.entrades.filter(e => e.sessio === s);
  const numSeguent = () => entradesSessio(d.sessio).length + 1;
  const sessions = () => {
    const set = new Set(d.entrades.map(e => e.sessio));
    set.add(d.sessio);
    return [...set].sort((a, b) => a - b);
  };

  /* ─── Mutacions ─── */
  function afegeixEntrada(e) {
    d.entrades.push(Object.freeze(e)); // llibre de comptabilitat: només s'hi suma
    desa();
    return e;
  }
  function novaSessio() {
    d.sessio += 1; // el comptador de sessió incrementa per sempre
    desa();
  }
  function nouParticipant() {
    const usats = new Set(d.participants.map(p => p.color));
    const color = (PALETA.find(c => !usats.has(c.hex)) || PALETA[d.participants.length % PALETA.length]).hex;
    const p = { id: 'p' + d.seguentId++, nom: '', color, absent: false };
    d.participants.push(p);
    desa();
    return p;
  }
  function eliminaParticipant(id) {
    const i = d.participants.findIndex(p => p.id === id);
    if (i >= 0 && d.participants.length > 2) { d.participants.splice(i, 1); desa(); return true; }
    return false;
  }

  return { d, desa, actius, perId, nomDe, entradesSessio, numSeguent, sessions,
           afegeixEntrada, novaSessio, nouParticipant, eliminaParticipant,
           enMemoria: () => usaMemoria };
})();
