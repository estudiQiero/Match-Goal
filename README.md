# Match Goal

Fútbol arcade en vista lateral con scroll, hecho en HTML5 Canvas + JavaScript (sin dependencias).
Se juega en el navegador y se empaqueta para iPad/iPhone y Android con Capacitor.

## Jugar en el Mac

```bash
npm run dev
```

Abre http://localhost:8090.

## Controles

| | Jugador 1 (modo 1P) | Jugador 1 (modo 2P) | Jugador 2 | Mando |
|---|---|---|---|---|
| Mover | Q arriba · A abajo · O izquierda · P derecha (o flechas) | Q A O P | Flechas | Stick / cruceta |
| Raso / entrada | Espacio | Espacio | `.` | A |
| Alto / cambiar jugador | Z o M | Z o M | `-` | B |
| Pausa y tácticas | Esc | Esc | | Start |

Mantén el botón de golpeo: el medidor sube y baja. Suelta en la potencia que quieras.
Si apuntas a un compañero, el pase sale dirigido a él; si apuntas a portería, es un chut libre.

## Estructura

- `www/js/ball.js`: física del balón (botes, efecto, postes, larguero, red).
- `www/js/player.js`: movimiento y golpeos de cada jugador.
- `www/js/team.js`: IA de equipo (posicionamiento por formación, presión, pases, porteros).
- `www/js/tactics.js`: formaciones, mentalidades y estilos de pase.
- `www/js/match.js`: reglas, contactos, saques, goles y tiempo.
- `www/js/human.js`: control humano, medidor de golpeo y ayuda al pase.
- `www/js/render.js`: dibujado del campo, jugadores, marcador y minimapa.
- `www/js/input.js`: teclado, mandos y controles táctiles.

El motor (balón, jugadores, equipo, partido) no dibuja nada: si algún día se quiere portar a otro lenguaje, solo hay que rehacer `render.js` e `input.js`.

## iPad / iPhone y Android con Capacitor

```bash
npm install
```

```bash
npm run cap:add:ios
```

```bash
npm run cap:add:android
```

Después de cada cambio en `www/`:

```bash
npm run cap:sync
```

Y para abrir el proyecto nativo (Xcode o Android Studio):

```bash
npm run cap:ios
```

```bash
npm run cap:android
```
