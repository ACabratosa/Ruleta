# Casino des Incidències · Taula Nº 04

Ruleta de casino europea per repartir les incidències que envia el cap
entre els membres de l'equip. Estètica de sala privada de Montecarlo
dels anys 60-70: fusta fosca, llautó, tapet verd i tipografia gravada.
Tota la interfície és en català.

## Com s'obre

**Doble clic a `index.html`.** No cal servidor ni instal·lar res: els
scripts es carreguen amb rutes relatives i funcionen sota `file://`
(Chrome, Edge). Cal mantenir `index.html` a la mateixa carpeta que
`js/` i `estils/`.

- **Amb connexió**: es carreguen del CDN la tipografia (Cinzel i
  Cormorant Garamond), GSAP (coreografia d'entrades) i Three.js — la
  roda es renderitza en 3D real amb materials PBR, llums i ombres.
- **Sense connexió**: tot continua funcionant amb les fonts de sistema,
  les transicions CSS i la roda en canvas 2D. Cap funcionalitat es perd.

## Estructura

```
index.html            La pàgina: marcatge, CDN i ordre de càrrega
estils/
  base.css            Paleta, taula principal, placa, roda, botó, peu
  pantalles.css       Portada, celebració, trampa, registre, ajustos,
                      responsive i la passada de materials
js/
  util.js             Utilitats: angles, easings, dates, CSV, escapament
  rng.js              Atzar criptogràfic amb mostreig de rebuig
  estat.js            Estat i persistència (localStorage amb clau
                      versionada; reserva en memòria si es bloqueja)
  roda.js             Model de la roda: seqüència europea, repartiment
                      exacte de caselles per posició física
  sorteig.js          La cadena de la tirada (casella → trampa? → …)
  fisica.js           El pla de la tirada i la màquina d'estats,
                      compartits pels dos renderitzadors
  anim2d.js           Roda en canvas 2D (reserva offline) i la textura
                      de caselles que també fa servir la roda 3D
  anim3d.js           Roda Three.js: bol tornejat, llautó PBR, ombres
  audio.js            Tot el so, sintetitzat amb Web Audio API
  particules.js       Monedes, confeti i focs de la celebració
  trampa.js           El tub pneumàtic i l'escalada de la trampa
  celebracio.js       Revelació i celebració (incloent-hi el zero)
  registre.js         Llibre de registre, estadístiques, rècords, CSV
  ui.js               Placa, llegenda, croupier, teclat, ajustos
  cine.js             Capa de coreografia GSAP (opcional)
  main.js             Orquestrador del flux i tria del motor de roda
```

## Principis del sorteig

- El resultat es decideix **abans** de moure res, amb
  `crypto.getRandomValues` i mostreig de rebuig (mai `Math.random`).
- Se sorteja sobre el **conjunt de caselles**: el Jefe (el 0) té
  exactament 1/37.
- La trampa (3-10% configurable) s'aplica amb la mateixa probabilitat a
  totes les caselles, també al 0, i la cadena sencera es calcula per
  endavant.
- L'animació és una màquina d'estats de quatre fases el desplaçament
  total de la qual està fixat per la integral del perfil de velocitat:
  la casella decidida és exactament on acaba la bola, sense cap
  correcció final.

## Dreceres

- **Espai** — tirar (si el focus no és al camp de text)
- **Ctrl+Retorn** — tirar des de dins del camp
- **Esc** — tancar la celebració o el panell obert
- **M** — silenciar
