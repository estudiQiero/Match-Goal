# Match Goal

Fútbol arcade en vista lateral con scroll, hecho en HTML5 Canvas + JavaScript (sin dependencias).
Se juega en el navegador y se empaqueta para iPad/iPhone y Android con Capacitor.

## Inspiración

Match Goal es un homenaje a **Match Day** (1984) y **Match Day II** (1987), los juegos de fútbol que **Jon Ritman** creó para **Ocean Software** en los años 80, para ZX Spectrum, Amstrad CPC y otros ordenadores de 8 bits. Los gráficos de Match Day son de **Chris Clarke**, y los de Match Day II, de **Bernie Drummond**.

De aquellos juegos viene la idea: la vista lateral con scroll, en la que se ven las porterías y cómo entra el balón, y el medidor de potencia para golpear. A partir de ahí, Match Goal añade cosas propias: tácticas de equipo, una IA que defiende por líneas, árbitro, desgaste del césped y gráficos nuevos en pixel art.

Es un proyecto de aficionado, sin relación con Ocean Software ni con los autores originales. El código, los gráficos y los sonidos son propios; no se usa ningún recurso de los juegos originales. Match Day y Match Day II son marcas de sus respectivos propietarios.

## Jugar en el Mac

```bash
npm run dev
```

Abre http://localhost:8090.

## Controles

| | Jugador 1 (modo 1P) | Jugador 1 (modo 2P) | Jugador 2 | Mando |
|---|---|---|---|---|
| Mover | Q arriba · A abajo · O izquierda · P derecha (o flechas) | Q A O P | Flechas | Stick / cruceta |
| Raso / entrada | Espacio | Espacio | `.` | A (asignable) |
| Alto / cambiar jugador | Intro | Intro | `-` | B (asignable) |
| Pausa y tácticas | Esc | Esc | | Start (asignable) |

Estas son las teclas por defecto. En el menú se pueden cambiar con **Redefinir teclas** (Jugador 1 y Jugador 2), y los botones del mando con **Asignar botones del mando**, que sirve para cualquier mando o joystick. En el modo de 1 jugador valen las teclas de los dos jugadores.

**Conducción.** El balón nunca va pegado al pie: el jugador lo lleva a toques cortos. Si giras de golpe o el balón se va a un lado y no lo corriges, se te queda atrás o se escapa.

**Fuerza del golpeo.** Encima del jugador que manejas hay un medidor de 8 rayitas que va solo de flojo a fuerte (1 s) y vuelve (0,5 s):

- **Pulsación seca**: golpeo con la fuerza que marcaba el medidor al pulsar.
- **Mantener**: la fuerza la cargas tú (2 s hasta el máximo, y el medidor se subraya). Si te pasas, baja; si llega a cero, no hay golpeo y solo das un toque corto.
- **Doble pulsación**: pase corto flojo.

El botón decide si el golpeo va **raso** o **alto**. Si apuntas a un compañero, el balón va hacia él con la fuerza que hayas puesto; si apuntas a portería, es un chut libre.

## Estructura

- `www/js/ball.js`: física del balón (botes, efecto, postes, larguero, red).
- `www/js/player.js`: movimiento y golpeos de cada jugador.
- `www/js/team.js`: IA de equipo (posicionamiento por formación, presión, pases, porteros).
- `www/js/tactics.js`: formaciones, mentalidades y estilos de pase.
- `www/js/match.js`: reglas, contactos, saques, goles y tiempo.
- `www/js/human.js`: control humano, medidor de golpeo y ayuda al pase.
- `www/js/render.js`: dibujado del campo, jugadores, marcador e indicadores de los jugadores fuera de pantalla.
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
