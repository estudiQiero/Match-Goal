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
| Alto / cabezazo | Intro | Intro | `-` | B (asignable) |
| Cambiar de jugador | Cmd | Cmd | `,` | X (asignable) |
| Pausa y tácticas | Esc | Esc | | Start (asignable) |

Estas son las teclas por defecto. En el menú se pueden cambiar con **Redefinir teclas** (Jugador 1 y Jugador 2), y los botones del mando con **Asignar botones del mando**, que sirve para cualquier mando o joystick. En el modo de 1 jugador valen las teclas de los dos jugadores.

**Conducción.** El balón nunca va pegado al pie: el jugador lo lleva a toques cortos. Si giras de golpe o el balón se va a un lado y no lo corriges, se te queda atrás o se escapa.

**Fuerza del golpeo.** Encima del jugador que manejas hay un medidor de 8 rayitas que va solo de flojo a fuerte (1 s) y vuelve (0,5 s):

- **Pulsación seca**: al soltar, golpeo con la fuerza que marcaba el medidor al pulsar.
- **Mantener**: la fuerza la cargas tú (2 s hasta el máximo, y el medidor se subraya); al soltar golpeas y el medidor vuelve a ir solo. Si te pasas, baja; si llega a cero, no hay golpeo y solo das un toque corto.

Sin balón, **raso** es una entrada solo si tienes cerca un rival disputando el balón; si no, es un pequeño **acelerón** (que cansa más).

**Esprint.** Pulsa dos veces seguidas la misma dirección (soltar y volver a pulsar enseguida) y el jugador esprinta mientras la mantengas: va más rápido pero se cansa mucho antes. Se acaba al soltar o al cambiar de dirección.

**Pausas al salir el balón.** Cuando el balón sale por una banda o por la línea de fondo, el juego se calma unos segundos: el balón sigue rodando hasta pararse, rebota en las vallas si va fuerte y bajo, o se va a la grada si va alto (y el público lo devuelve). El jugador que saca va a por él, lo lleva en brazos hasta el punto del saque y saca: de banda, con las manos desde encima de la cabeza; córner y saque de puerta, con el balón en el suelo.

**Cansancio.** Cada jugador lleva tres puntos encima de la cabeza: verdes si está fresco, luego verde-naranja, naranja, naranja-rojo y rojo. Cuanto más cansado, menos corre (en rojo, apenas). Correr, conducir y los acelerones cansan; parado o andando se recupera, y en el descanso también. El jugador que manejas lo muestra en el aro del suelo, que gira en verde, naranja o rojo. Un jugador normal acaba el partido en naranja; si usas mucho a uno, llegará al rojo.

El botón decide si el golpeo va **raso** o **alto**. Si apuntas a un compañero, el balón va hacia él con la fuerza que hayas puesto.

**Chut a puerta.** Cerca del área y con el cuerpo encarando la portería, golpear es chutar: el balón va hacia donde apunta el cuerpo, con ayuda para que entre los tres palos si estás bien orientado (para buscar un palo, orienta el cuerpo hacia él). Fallas más si el cuerpo no mira a portería, si chutas corriendo muy deprisa o desde lejos, si te pasas de fuerza (se va alto) o si pulsas otra dirección en el último momento (fuera o alto). El chut alto busca entrar bajo el larguero; con demasiada fuerza se va por encima. Cerca de la portería hay que decidir rápido: manteniendo el botón, el medidor se llena en 1 s a 30 m y en medio segundo a 10 m o menos (en un pase, 2 s), y el chut sale en cuanto sueltas.

**Línea de trayectoria.** Mientras pulsas el botón de golpeo aparece una línea punteada, con los trazos avanzando, con el camino que seguiría el balón con la fuerza del medidor en ese momento: a ras de césped en el raso, y en arco (con su sombra en el suelo) en el alto. Acaba en una cruz donde se para o cae. Es amarilla en un pase o golpeo normal y **roja si es un chut a puerta**; cuando estás en posición de chutar (cerca y encarando la portería) aparece además un **punto rojo** a la derecha del medidor de encima de la cabeza. Es el golpeo limpio, sin los errores: si el cuerpo no está bien orientado o te pasas de fuerza, el balón real se desviará de la línea. Tras golpear, la línea se queda un instante y se desvanece.

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
