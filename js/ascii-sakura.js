// ASCII sakura: a cherry tree drawn in fine characters above the About
// text, the way a picture is turned into ASCII art, through the seasons of
// the visitor's calendar:
//   March to May           in bloom; petals fall and drift on the wind
//   June to August         fresh green leaves; now and then a leaf falls
//   September to November  autumn leaves; many fall and gather on the ground
//   December to February   bare branches with snow on them; snow falls and
//                          settles on the ground
// (?season=spring, summer, autumn or winter in the address shows another
// season.) To the left of the tree stands something of the season, drawn
// in the same characters (lit from the upper left, shaded and outlined):
// Easter eggs in spring (the big one rocks on its base now and then), a
// goldfish bowl in summer (the fish swims to and fro, the weed sways, now
// and then a bubble rises), a jack-o'-lantern in autumn (the candle inside
// makes its eyes, nose and grin glow and flicker unevenly) and a snowman
// in winter (its scarf flutters).
// Where the mouse passes over the crown (or a finger taps it), more petals,
// leaves or snow come loose. Tossed out, petals and leaves drop under their
// own weight, then a breeze catches them and carries them far to the left
// on a long, gently sinking glide, fewer of them remaining the farther they
// go; snow falls off as a powdery puff. That part of the crown thins out and
// slowly fills in again. Decorative only: the canvas is hidden from screen
// readers (and from print by the CSS).
//
// <canvas class="ascii-sakura" data-seed="11" data-x="0.58,0.98"></canvas>
//   data-seed  the same seed draws the same tree
//   data-x     the horizontal room for the tree, as fractions of the width
//              (--sakura-x in the CSS, when set, takes its place)
//
// Colours come from CSS custom properties: --tree-wood and, for the season,
// --<season>-light, --<season>, --<season>-deep and --<season>-fall (the
// dark theme redefines them); the objects have colours of their own (see
// SCENES), made to suit the theme. The characters are GRAIN of the
// canvas's font-size and line-height, which set the size of the motion.
// The animation runs only while the canvas is on screen and the tab is
// visible; with prefers-reduced-motion a single still frame is drawn and
// the pointer does nothing.
(() => {
  const FPS = 15;
  // everything is drawn in fine characters, GRAIN of the canvas's
  // font-size and line-height, the way a picture is turned into ASCII art.
  // Motion is measured in steps, the size of a character at the font-size
  // (Z of the fine ones)
  const GRAIN = 0.4;
  const Z = 1 / GRAIN;
  const WIND = -0.6; // drift of what falls, steps per second (to the left)
  // a petal's weight against the drag of the air, steps per second squared
  // (the drag of each petal sets the speed it falls at)
  const G = 3;
  // the crown: blob size, how quickly it fills in, how ragged its edge is,
  // the texture inside, and the curve from density to character
  const LOOK = { sig: 0.47, sat: 1.05, drop: 1.5, tex0: 0.42, tex1: 0.58, gamma: 1.1 };
  // the seasons: the characters of the crown (sparse to dense) and how full
  // it is; what falls from it, face-on, turning and edge-on (two ways); how
  // much falls by itself and when shaken; what lies on the ground, and for
  // how long (seconds)
  const SEASONS = {
    spring: { crown: 1, ramp: '.:+*o@', falls: 'o~\'`', trickle: 1, shed: 1, ground: '.,_', rest: [3, 7] },
    summer: { crown: 1.35, ramp: '.,;+%&', falls: '*~,`', trickle: 0.2, shed: 0.6, ground: '.,_', rest: [3, 6] },
    autumn: { crown: 0.9, ramp: '.,;+%&', falls: '*~,`', trickle: 1.4, shed: 1.2, ground: ',._~', rest: [6, 12] },
    winter: { crown: 0.5, ramp: '..:+**', falls: '.:*', trickle: 0, shed: 0.8, ground: '_.', rest: [18, 36], snow: true },
  };
  const MONTHS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
  const pickSeason = () => {
    const asked = new URLSearchParams(window.location.search).get('season');
    return SEASONS[asked] ? asked : MONTHS[new Date().getMonth()];
  };
  const MAX_PETALS = 280; // in the air at once, including the shaken ones
  const MAX_FALLEN = 180; // resting on the ground
  const MAX_FLAKES = 180; // snowflakes
  const REACH = 5; // how far the pointer stirs the crown, in steps
  // of the crown's characters a pointer shakes, the share that let a petal
  // go (there are many small ones: twice as many petals as characters the
  // size of a step would let go)
  const EMIT = 2 * GRAIN * GRAIN;

  // small deterministic random generator: a seed always gives the same tree
  const rng = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // a fixed random value for each cell
  const hash = (x, y, s) => {
    let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x7f4a, 0xc2b2ae35) ^ Math.imul(s + 0x2c1b, 0x27d4eb2f);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };
  const between = (r, a, b) => a + (b - a) * r();
  const gauss = (r) => (r() + r() + r() - 1.5) / 1.5; // about -1..1, centred
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // a line's direction as a character (screen space, y down)
  const lineGlyph = (dx, dy, sub) => {
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 180;
    if (deg < 20 || deg >= 160) return sub > 0.25 ? '_' : '-';
    if (deg < 70) return '\\';
    if (deg < 110) return '|';
    return '/';
  };

  // ---- the objects of the seasons ----
  // To the left of the tree, standing on the ground, each season has a small
  // scene, drawn the way a picture is turned into ASCII art. A scene has
  //   w, size      its width (it is 1 high), and its size: of the most an
  //                object may be (half the height of the tree)
  //   colors       its colours
  //   sample(x, y, t, c, st)
  //                what is at the point (x, y) of it at time t, in its own
  //                units (y runs down from its top, x from its middle; c: the
  //                colours, st: its state): null for nothing, or [r, g, b]
  //                (0 to 1, already lit), then how thickly to draw it (1 if
  //                left out), its kind and which part it is. OUTLINED parts
  //                get an outline where they meet the rest, GLOWING ones give
  //                light as well (drawn as dense as they are bright, in
  //                either theme)
  //   init()       its state, at first; step(st, t, dt, rand) moves it on
  //   frame(st, t, dark)
  //                gets it ready to be drawn at time t; st.key: the light of
  //                the glowing parts changes when this does
  //   moving(st, t)
  //                where things move at time t: [x0, y0, x1, y1] boxes (and
  //                true for one where something changes but stays put)
  //   marks(st, t) details too small to be sampled, as characters: [x, y,
  //                character, colour]
  // Every character cell is sampled 3 x 4 times: a cell on an outline gets a
  // character that follows it (_ - / \ | ( )), a cell inside one of FILL, as
  // dense as the light there (dark theme) or the shade (light theme), in the
  // colour there.
  const FILL = ' .:-=+*#%@';
  const OUTLINED = 1;
  const GLOWING = 3;
  const unit3 = (x, y, z) => {
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  };
  const SUN = unit3(-0.45, -0.65, 0.62); // the light comes from the upper left
  const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  // a colour lit for a surface facing n, with a highlight; the shade is
  // softer on the light page (shade.ambient: the light in the shade)
  const shade = { ambient: 0.36 };
  const lit = (c, n, shine = 0.3) => {
    const d = Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
    const k = shade.ambient + (1.06 - shade.ambient) * d;
    const s = shine * Math.max(0, 2 * d * n[2] - SUN[2]) ** 16;
    return [c[0] * k + s, c[1] * k + s, c[2] * k + s];
  };
  const FLAT = [0, 0, 1];
  // a ball (or an ellipse): the facing of its surface at (x, y), or null
  const ball = (x, y, cx, cy, rx, ry = rx) => {
    const u = (x - cx) / rx;
    const v = (y - cy) / ry;
    const q = u * u + v * v;
    return q > 1 ? null : unit3(u, v, Math.sqrt(1 - q));
  };
  // an egg standing up (narrower at the top): its own coordinates (u across,
  // v down, both -1 to 1) and the facing of its surface, or null
  const egg = (x, y, cx, cy, rx, ry) => {
    const v = (y - cy) / ry;
    if (v <= -1 || v >= 1) return null;
    const u = (x - cx) / (rx * (1 + 0.14 * v));
    const q = u * u + v * v;
    return q > 1 ? null : { u, v, n: unit3(u, v * 0.9, Math.sqrt(1 - q)) };
  };
  // the distance from (x, y) to the segment from (ax, ay) to (bx, by)
  const toSeg = (x, y, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const k = clamp01(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1));
    return Math.hypot(x - ax - k * dx, y - ay - k * dy);
  };
  // inside the triangle a, b, c (each [x, y])
  const inTri = (x, y, a, b, c) => {
    const s = (p, q) => (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (y - q[1]);
    const d1 = s(a, b);
    const d2 = s(b, c);
    const d3 = s(c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const tri = (k) => Math.abs(((k % 2) + 2) % 2 - 1); // a triangle wave, 0 to 1
  // smooth noise along one dimension, 0 to 1 (s: which one)
  const noise = (x, s) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = hash(i, 17, s);
    return a + (hash(i + 1, 17, s) - a) * f * f * (3 - 2 * f);
  };

  // the jack-o'-lantern's face: triangles for the eyes and the nose, and a
  // grin with jagged teeth
  const EYES = [[[-0.36, 0.53], [-0.07, 0.53], [-0.17, 0.3]], [[0.36, 0.53], [0.07, 0.53], [0.17, 0.3]]];
  const NOSE = [[-0.07, 0.665], [0.07, 0.665], [0, 0.565]];
  const grin = (x, y) => {
    const s = x / 0.41;
    if (s <= -1 || s >= 1) return false;
    const top = 0.715 - 0.11 * s * s; // the corners turn up
    const bot = 0.905 - 0.3 * s * s;
    if (y < top || y > bot) return false;
    const tooth = (cx, w, h, down) => {
      const k = 1 - Math.abs(x - cx) / w;
      return k > 0 && (down ? y < top + h * k : y > bot - h * k);
    };
    return !(tooth(-0.14, 0.062, 0.08, true) || tooth(0.14, 0.062, 0.08, true)
      || tooth(0, 0.058, 0.07, false) || tooth(-0.28, 0.046, 0.05, false) || tooth(0.28, 0.046, 0.05, false));
  };

  // the snowman's twig arms, raised, with fingers: segments [x0, y0, x1, y1]
  const ARMS = [
    [-0.22, 0.64, -0.33, 0.55], [-0.33, 0.55, -0.41, 0.45], [-0.41, 0.45, -0.445, 0.385], [-0.41, 0.45, -0.39, 0.38], [-0.405, 0.465, -0.465, 0.45],
    [0.22, 0.64, 0.33, 0.56], [0.33, 0.56, 0.415, 0.46], [0.415, 0.46, 0.45, 0.4], [0.415, 0.46, 0.395, 0.395], [0.41, 0.475, 0.47, 0.475],
  ];

  const SCENES = {
    // spring: three Easter eggs on a patch of lawn, each in its own bright
    // colour with a pattern. The big one rocks on its base for a moment
    // every ten seconds or so
    spring: {
      w: 1.3,
      size: 2 / 3,
      colors: {
        yellow: '#f1c94e', green: '#79bf6c', blue: '#6faee0', pink: '#e9879f', white: '#fbf7ef',
        grass: '#7cb466', grass2: '#5f9a4e',
      },
      lawn: '#6fa95b', // the ground line under it
      frame(st, t) {
        const rock = 0.1 * Math.sin(t * 3.1) * Math.max(0, Math.sin(t * 0.6)) ** 24;
        st.rock = Math.abs(rock) > 0.002 ? rock : 0;
      },
      // what moves: the big egg, while it rocks
      moving: (st) => (st.rock ? [[-0.54, 0.0, 0.12, 0.92]] : []),
      sample(x, y, t, c, st) {
        // blades of grass in front of the eggs' feet
        const k = Math.floor((x + 2) / 0.055);
        const bx = -2 + (k + 0.5) * 0.055;
        const tip = 0.83 + 0.05 * hash(k, 3, 5);
        if (y > tip && Math.abs(bx) < 0.6) {
          const s = (y - tip) / (1 - tip); // 0 at the tip
          if (Math.abs(x - bx - 0.012 * (hash(k, 4, 5) - 0.5)) < 0.004 + 0.02 * s) {
            return [...lit(k % 2 ? c.grass : c.grass2, unit3(0, -0.5, 1), 0), 1, OUTLINED, 5];
          }
        }
        // the small pink egg, lying in front on the right, with a white
        // zigzag round it
        {
          const v = -(x - 0.37) / 0.2;
          if (v > -1 && v < 1) {
            const u = (y - 0.79) / (0.125 * (1 + 0.14 * v));
            const q = u * u + v * v;
            if (q <= 1) {
              const band = Math.abs(v - 0.1 + 0.18 * tri(u * 2.5)) < 0.17;
              return [...lit(band ? c.white : c.pink, unit3(-v * 0.9, u, Math.sqrt(1 - q))), 1, OUTLINED, 2];
            }
          }
        }
        // the big yellow egg, rocking, with a green band round its middle
        const cs = Math.cos(st.rock);
        const sn = Math.sin(st.rock);
        const xr = -0.22 + (x + 0.22) * cs + (y - 0.89) * sn;
        const yr = 0.89 - (x + 0.22) * sn + (y - 0.89) * cs;
        const e = egg(xr, yr, -0.22, 0.48, 0.27, 0.4);
        if (e) {
          const a = Math.asin(Math.max(-1, Math.min(1, e.u))); // round the egg
          const zig = 0.09 * tri(a * 2.6);
          const band = e.v > -0.14 + zig && e.v < 0.12 + zig;
          return [...lit(band ? c.green : c.yellow, e.n), 1, OUTLINED, 3];
        }
        // a blue egg with white spots, standing behind on the right
        const m = egg(x, y, 0.18, 0.56, 0.16, 0.25);
        if (m) {
          const a = Math.asin(Math.max(-1, Math.min(1, m.u)));
          const kk = Math.round(a / 0.8);
          const j = Math.round(m.v / 0.55);
          const spot = Math.hypot((a - kk * 0.8 - (j % 2) * 0.4) * 0.7, m.v - j * 0.55) < 0.17;
          return [...lit(spot ? c.white : c.blue, m.n), 1, OUTLINED, 4];
        }
        // the lawn they sit on, its edge in blades of grass
        const lx = x / 0.64;
        if (Math.abs(lx) < 1) {
          const edge = 1.03 - 0.2 * Math.sqrt(1 - lx * lx) - 0.03 * tri(x / 0.045) * (1 - lx * lx);
          if (y > edge) {
            const g = hash(Math.floor(x * 70 + 99), Math.floor(y * 40), 6) < 0.5 ? c.grass : c.grass2;
            return [...lit(g, unit3(lx * 0.6, -0.8, 1), 0), 1, OUTLINED, 5];
          }
        }
        return null;
      },
    },
    // summer: a wide goldfish bowl; a goldfish swims to and fro across it,
    // the weed sways, now and then a bubble rises
    summer: {
      w: 1.24,
      size: 0.75,
      colors: {
        glass: '#a9d0e6', water: '#8cb9d1', sand: '#dcc79d', weed: '#86b874',
        fish: '#f2803a', fin: '#f7b07c', eye: '#2c2420',
      },
      init: () => ({ bubbles: [], next: 1.2 }),
      fish: (t) => ({ x: 0.25 * Math.sin(t * 0.45), y: 0.61 + 0.06 * Math.sin(t * 0.31), dir: Math.cos(t * 0.45) >= 0 ? 1 : -1 }),
      step(st, t, dt, r) {
        st.next -= dt;
        if (st.next <= 0) {
          const f = this.fish(t);
          st.bubbles.push({ x: f.x + f.dir * 0.14, y: f.y - 0.03, ph: r() * 6 });
          st.next = 2.5 + 2.5 * r();
        }
        for (const b of st.bubbles) b.y -= 0.12 * dt;
        st.bubbles = st.bubbles.filter((b) => b.y > 0.36);
      },
      frame(st, t, dark) {
        st.dark = dark;
        st.f = this.fish(t);
        // the surface and the weed change 7.5 times a second
        const k = Math.floor(t * 7.5);
        st.calm = k === st.k;
        st.k = k;
        st.tw = k / 7.5;
      },
      // what moves: the fish and the bubbles; the surface and the weed sway
      // where they are
      moving(st) {
        const f = st.f;
        const boxes = [[f.x - 0.26, f.y - 0.12, f.x + 0.26, f.y + 0.12]];
        for (const b of st.bubbles) boxes.push([b.x - 0.05, b.y - 0.05, b.x + 0.05, b.y + 0.05]);
        if (!st.calm) boxes.push([-0.58, 0.32, 0.58, 0.34, true], [-0.43, 0.5, -0.25, 0.79, true], [0.27, 0.5, 0.43, 0.79, true]);
        return boxes;
      },
      // the fish's eye
      marks: (st) => [[st.f.x + st.f.dir * 0.075, st.f.y - 0.015, 'o', 'eye']],
      sample(x, y, t, c, st) {
        const RX = 0.56; // a bowl wider than tall
        const RY = 0.43;
        const cy = 0.55;
        const top = 0.17;
        const d = Math.hypot(x / RX, (y - cy) / RY);
        // the rim round the opening
        const half = RX * Math.sqrt(1 - ((top - cy) / RY) ** 2);
        const rq = (x / (half + 0.02)) ** 2 + ((y - top) / 0.035) ** 2;
        if (rq < 1 && rq > 0.35) return lit(c.glass, unit3(0, -1, 0.7), 0.6);
        if (d > 1 || y < top) return null;
        // the glass, seen edge-on at the sides, with a highlight
        if (d > 1 - 0.04 / RY) return lit(c.glass, unit3(x / RX, (y - cy) / RY, 0.25), 0.8);
        if (((x + 0.33) / 0.035) ** 2 + ((y - 0.42) / 0.1) ** 2 < 1) return [0.97, 0.99, 1];
        const surf = 0.33 + 0.008 * Math.sin(x * 18 + st.tw * 1.8);
        if (y < surf) return null; // air above the water
        // the goldfish, facing the way it swims: a round body, a fanned
        // tail that wags, a fin on its back
        const f = st.f;
        const fx = (x - f.x) * f.dir;
        const fy = y - f.y;
        const body = (fx / 0.12) ** 2 + (fy / 0.068) ** 2;
        if (body < 1) return [...lit(fy > 0.025 ? c.fin : c.fish, unit3(fx / 0.12, fy / 0.068, 0.8), 0.5), 1, OUTLINED, 2];
        const wag = 0.018 * Math.sin(t * 7);
        const tx = -fx - 0.1; // along the tail
        if (tx > 0 && tx < 0.1 && Math.abs(fy - wag * tx / 0.1) < 0.015 + tx * 0.75) return [...lit(c.fish, FLAT, 0.2), 1, OUTLINED, 2];
        if (fx > -0.05 && fx < 0.035 && fy < -0.05 && fy > -0.095 + (fx + 0.05) * 0.5) return [...lit(c.fin, FLAT, 0), 1, OUTLINED, 2];
        for (const b of st.bubbles) {
          if (Math.hypot(x - b.x - 0.01 * Math.sin(t * 5 + b.ph), y - b.y) < 0.025) return [0.95, 0.98, 1];
        }
        // the weed, swaying
        for (const wx of [-0.34, 0.35]) {
          const sway = 0.07 * Math.sin(y * 13 - st.tw * 1.4 + wx * 9) * Math.max(0, 0.78 - y); // only its upper part
          if (y > 0.52 && Math.abs(x - wx - sway) < 0.018) return lit(c.weed, unit3(0.5 * Math.sin(y * 13 + wx * 9), 0, 1), 0);
        }
        // sand at the bottom
        if (y > 0.87 + 0.015 * Math.sin(x * 9)) return lit(c.sand, unit3(0, -0.6, 1), 0);
        // the water: thin, so that the fish shows (on the light page a
        // little thicker, so that it shows too)
        return [...lit(c.water, unit3(x / RX * 0.6, (y - cy) / RY * 0.6, 1), 0), y < 0.36 ? 0.55 : st.dark ? 0.22 : 0.42];
      },
    },
    // autumn: a jack-o'-lantern with a candle inside: its eyes, nose and
    // grin glow, flickering unevenly
    autumn: {
      w: 1.07,
      size: 2 / 3,
      colors: { skin: '#e48a42', groove: '#b4602b', stem: '#6f7a3e' },
      // the candlelight, dim to bright, for each theme
      glow: { light: [hex('#6e2410'), hex('#ffad14')], dark: [hex('#94431a'), hex('#fff0c2')] },
      frame(st, t, dark) {
        // the flame: its light wavers, slowly and quickly at once, and now
        // and then sinks low for a moment; it leans this way and that, so
        // that each opening glows differently, and each flickers a little
        // by itself. It changes 7.5 times a second (key: when it last did)
        st.key = Math.floor(t * 7.5);
        const u = st.key / 7.5;
        let i = 0.74 + 0.36 * (noise(u * 0.9, 1) - 0.5) + 0.3 * (noise(u * 3.1, 2) - 0.5) + 0.2 * (noise(u * 8.3, 3) - 0.5);
        const dip = noise(u * 0.6, 4);
        if (dip > 0.7) i -= (dip - 0.7) * 1.8;
        st.i = Math.max(0.15, Math.min(1, i));
        st.fx = 0.3 * (noise(u * 1.7, 5) - 0.5);
        st.fy = 0.86 + 0.08 * (noise(u * 2.6, 6) - 0.5);
        st.own = [0, 1, 2, 3].map((k) => 0.85 + 0.3 * noise(u * 5.3 + k * 7.1, 7));
        st.g = dark ? this.glow.dark : this.glow.light;
      },
      sample(x, y, t, c, st) {
        // the stem, curving over to the right
        if (toSeg(x, y, 0, 0.21, 0.03, 0.08) < 0.042 || toSeg(x, y, 0.03, 0.08, 0.105, 0.03) < 0.03) {
          return [...lit(c.stem, unit3(-0.5 * Math.sign(x - 0.02), -0.2, 1), 0.2), 1, OUTLINED, 2];
        }
        // a round body, a little wider than tall
        const u = x / 0.5;
        const v = (y - 0.575) / 0.415;
        const a = u * Math.PI * 2.5;
        const rib = Math.cos(a);
        if (u * u + v * v > 1 + 0.035 * rib * (1 - v * v)) return null;
        // the openings, lit from inside: brighter nearer the flame
        const hole = inTri(x, y, ...EYES[0]) ? 0 : inTri(x, y, ...EYES[1]) ? 1 : inTri(x, y, ...NOSE) ? 2 : grin(x, y) ? 3 : -1;
        if (hole >= 0) {
          const d = Math.hypot(x - st.fx, (y - st.fy) * 1.2);
          return [...mix(st.g[0], st.g[1], 0.2 + 0.8 * clamp01(st.i * st.own[hole] * (1.3 - 1.1 * d))), 1, GLOWING];
        }
        // the skin, darker in the grooves between the ribs, which bulge;
        // drawn a little thinner than the light in the face
        const q = Math.min(1, u * u + v * v);
        const n = unit3(u - 0.22 * Math.sin(a) * (1 - v * v), v, Math.sqrt(1 - q));
        return [...lit(mix(c.groove, c.skin, 0.35 + 0.65 * (0.5 + 0.5 * rib) ** 0.6), n, 0.25), 0.8];
      },
    },
    // winter: a snowman, a small ball on a big round one, in a red knitted
    // cap with a bobble and a blue scarf whose end flutters in the wind,
    // with coal eyes, smile and buttons, and twig arms raised
    winter: {
      w: 0.96,
      size: 1,
      colors: {
        snow: '#eef4fa', fur: '#f7f3ec', cap: '#c4534b', cap2: '#a23f39', coal: '#2a2420',
        scarf: '#86b0cb', scarf2: '#5f88a3', stick: '#7d634a',
      },
      // what moves: the end of the scarf
      moving: () => [[-0.33, 0.52, -0.07, 0.8]],
      // the coal: eyes, a smile, buttons
      marks: () => [
        [-0.06, 0.37, '@', 'coal'], [0.06, 0.37, '@', 'coal'],
        [-0.065, 0.44, '.', 'coal'], [-0.022, 0.46, '.', 'coal'], [0.022, 0.46, '.', 'coal'], [0.065, 0.44, '.', 'coal'],
        [0, 0.65, 'o', 'coal'], [0, 0.75, 'o', 'coal'], [0, 0.85, 'o', 'coal'],
      ],
      sample(x, y, t, c) {
        // the bobble on top
        let n = ball(x, y, 0.02, 0.07, 0.05);
        if (n) return [...lit(c.fur, n, 0.25), 1, OUTLINED, 2];
        // the cap: a band of fur round the brim, and a cone knitted in ribs
        const bu = x / 0.18;
        const bv = (y - 0.25) / 0.035;
        if (bu * bu + bv * bv < 1) return [...lit(c.fur, unit3(bu * 0.7, bv * 0.8, 1), 0.2), 1, OUTLINED, 3];
        if (y > 0.1 && y < 0.25) {
          const s = (y - 0.1) / 0.15;
          const u = (x - 0.015 * (1 - s)) / (0.03 + 0.12 * s);
          if (u > -1 && u < 1) {
            const rib = Math.floor(Math.asin(u) / 0.4 + 10) % 2;
            return [...lit(rib ? c.cap : c.cap2, unit3(u * 0.85, -0.35, Math.sqrt(1 - u * u)), 0.15), 1, OUTLINED, 3];
          }
        }
        // the scarf's end, hanging down on the left and fluttering
        const se = (y - 0.55) / 0.22;
        if (se > -0.05 && se < 1.05 && x < -0.06 && x > -0.34) {
          const k = clamp01(se);
          const sx = -0.12 - 0.06 * k - 0.045 * k * k * (1 + Math.sin(t * 4.3 - k * 4));
          if (Math.abs(x - sx) < 0.04) return [...lit(Math.floor(k * 5) % 2 ? c.scarf2 : c.scarf, unit3(-0.3, 0, 1), 0.1), 1, OUTLINED, 4];
        }
        // the scarf round the neck, striped
        const sc = 0.525 + 0.02 * (x / 0.2) ** 2;
        if (Math.abs(x) < 0.2 && Math.abs(y - sc) < 0.04) {
          const stripe = Math.floor((x + 1) / 0.06) % 2;
          return [...lit(stripe ? c.scarf : c.scarf2, unit3(x / 0.24, (y - sc) / 0.08, 1), 0.15), 1, OUTLINED, 4];
        }
        // the head and the body
        n = ball(x, y, 0, 0.375, 0.165) || ball(x, y, 0, 0.73, 0.28, 0.265);
        if (n) return lit(c.snow, n, 0.25);
        // the twig arms
        if (Math.abs(x) > 0.2 && y > 0.36 && y < 0.67) {
          for (const [ax, ay, bx, by] of ARMS) {
            if (toSeg(x, y, ax, ay, bx, by) < 0.018) return [...lit(c.stick, unit3(-0.3, -0.5, 1), 0), 1, OUTLINED, 5];
          }
        }
        return null;
      },
    },
  };
  for (const s of Object.values(SCENES)) {
    s.c = {};
    for (const [k, h] of Object.entries(s.colors)) s.c[k] = hex(h);
  }
  // the character for a piece of outline, from the direction (gx, gy) in
  // which the scene (or the part) lies, per pixel, and how much of the cell
  // it fills
  const edgeGlyph = (gx, gy, cover, inner) => {
    const ax = Math.abs(gx);
    const ay = Math.abs(gy);
    if (ax > 2.4 * ay) return inner ? '|' : gx > 0 ? '(' : ')';
    if (ay > 2.4 * ax) return gy > 0 ? (cover < 0.5 ? '_' : '-') : cover > 0.5 ? '_' : '-';
    return gx > 0 === gy > 0 ? '/' : '\\';
  };
  // a colour for the theme: light things stay visible on the light page,
  // dark things on the dark one
  const forTheme = (c, dark, own) => {
    let out = c;
    if (!own) {
      const Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      if (!dark && Y > 0.55) {
        // darker, and a little more vivid, so that pale colours still show
        const d = c.map((v) => v * (0.55 / Y));
        const m = (d[0] + d[1] + d[2]) / 3;
        out = d.map((v) => m + (v - m) * 1.5);
      }
      if (dark && Y < 0.3) out = mix(c, [0.5, 0.48, 0.46], (0.3 - Y) / (0.48 - Y));
    }
    const q = (v) => Math.round((Math.min(1, Math.max(0, v)) * 255) / 6) * 6;
    return `rgb(${q(out[0])}, ${q(out[1])}, ${q(out[2])})`;
  };
  // the change of a mask across cell (q, r) of a grid C wide and R high,
  // towards the right and downwards (an edge filter), into out: the mask is
  // val (how much of each cell is the scene) or, with p, how much is part p.
  // Below the grid is the ground: the bottom row goes on into it, with no
  // edge there
  const sobel = (val, part, p, C, R, q, r, out) => {
    let gx = 0;
    let gy = 0;
    for (let dr = -1; dr <= 1; dr++) {
      const rr = Math.min(R - 1, r + dr);
      if (rr < 0) continue;
      for (let dq = -1; dq <= 1; dq++) {
        const qq = q + dq;
        if (qq < 0 || qq >= C || (!dq && !dr)) continue;
        const j = rr * C + qq;
        const m = !p ? val[j] : part[j] === p ? val[j] : 0;
        const w = dq && dr ? 1 : 2;
        gx += dq * w * m;
        gy += dr * w * m;
      }
    }
    out[0] = gx / 8;
    out[1] = gy / 8;
  };
  const DITHER = [-0.025, 0.015, 0.025, -0.015];

  // characters ([cell, [character, colour, opacity]]) drawn grouped by
  // colour and opacity, at x(cell), y(cell)
  const paintCells = (ctx, list, x, y) => {
    const groups = new Map();
    for (const [i, cell] of list) {
      const key = `${cell[1]}|${(Math.round(cell[2] * 10) / 10).toFixed(1)}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(i, cell[0]);
    }
    for (const [key, g] of groups) {
      const k = key.lastIndexOf('|');
      ctx.fillStyle = key.slice(0, k);
      ctx.globalAlpha = parseFloat(key.slice(k + 1));
      for (let m = 0; m < g.length; m += 2) ctx.fillText(g[m + 1], x(g[m]), y(g[m]));
    }
    ctx.globalAlpha = 1;
  };

  class Sakura {
    constructor(canvas, season) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.seed = parseInt(canvas.dataset.seed || '11', 10);
      this.season = season;
      this.cfg = SEASONS[season];
      this.petals = [];
      this.fallen = [];
      this.flakes = [];
      this.pointer = null;
      this.time = 0;
      this.gust = 0.5;
      this.debt = 0;
      this.snowDebt = 0;
      this.running = false;
      this.visible = false;
      this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.rand = rng(this.seed * 7919 + 13);
      this.layout();
    }

    // the character grid from the canvas size and the character cell
    layout() {
      const cs = getComputedStyle(this.canvas);
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(1, rect.width);
      this.h = Math.max(1, rect.height);
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.dpr = dpr;
      const fs = parseFloat(cs.fontSize) || 12;
      const lh = parseFloat(cs.lineHeight);
      this.fontSize = fs * GRAIN;
      this.lineH = (Number.isFinite(lh) ? lh : fs * 1.15) * GRAIN;
      this.font = `500 ${this.fontSize}px ${cs.fontFamily}`; // a little bolder: the characters are small
      this.ctx.font = this.font;
      this.cellW = this.ctx.measureText('M').width || this.fontSize * 0.6;
      this.cols = Math.max(4, Math.floor(this.w / this.cellW));
      this.rows = Math.max(4, Math.floor(this.h / this.lineH));
      this.aspect = this.lineH / this.cellW; // a row, in column units
      this.steps = this.cols / Z; // the width, in steps
      this.fall = 1 + this.rows / Z / 120; // taller canvases: things fall a little faster
      const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
      this.room = v('--sakura-x', this.canvas.dataset.x || '0.58,0.98').split(',').map(Number);
      const pre = `--${this.season}`;
      const mid = v(pre, '#d899ab');
      this.colors = {
        wood: v('--tree-wood', 'rgba(68, 51, 34, 0.45)'),
        light: v(`${pre}-light`, mid),
        bloom: mid,
        deep: v(`${pre}-deep`, mid),
        petal: v(`${pre}-fall`, mid),
      };
      this.dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.build();
    }

    // the tree in column units (x: columns, y: rows * aspect)
    build() {
      const r = rng(this.seed);
      const cfg = this.cfg;
      const segs = [];
      const clusters = [];
      const grow = (x, y, a, len, thick, depth) => {
        // a branch in two halves, slightly bent, so that it does not look ruled
        const mid = a + between(r, -0.25, 0.25);
        const x1 = x + Math.cos(mid) * len * 0.5;
        const y1 = y + Math.sin(mid) * len * 0.5;
        const a2 = a + 0.15 * 0.6 ** depth + between(r, -0.2, 0.2);
        const x2 = x1 + Math.cos(a2) * len * 0.5;
        const y2 = y1 + Math.sin(a2) * len * 0.5;
        segs.push({ x1: x, y1: y, x2: x1, y2: y1, thick });
        segs.push({ x1, y1, x2, y2, thick: thick * 0.85 });
        if (depth >= 2) {
          clusters.push({ x: x2, y: y2, r: between(r, 2.4, 3.6) });
          if (r() < 0.7) clusters.push({ x: x1, y: y1, r: between(r, 1.4, 2.4) });
        }
        if (depth >= 4) return;
        const n = depth === 0 ? 3 : r() < 0.35 ? 3 : 2;
        const spread = depth === 0 ? 0.62 : 0.7;
        for (let i = 0; i < n; i++) {
          let na = a2 + spread * (i - (n - 1) / 2) + between(r, -0.15, 0.15);
          // sakura limbs reach out sideways; the outer twigs droop a little
          if (depth >= 1) na += 0.1 * Math.sign(Math.cos(na));
          grow(x2, y2, na, len * between(r, 0.68, 0.82), thick * 0.64, depth + 1);
        }
      };
      grow(0, 0, -Math.PI / 2 + between(r, -0.08, 0.08), 9, 3.6, 0);

      // fit the tree into its room; it stands on the bottom edge
      const W = this.cols;
      const H = this.rows * this.aspect;
      const [fx0, fx1] = this.room;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = -1;
      for (const g of segs) {
        x0 = Math.min(x0, g.x1, g.x2);
        x1 = Math.max(x1, g.x1, g.x2);
        y0 = Math.min(y0, g.y1, g.y2);
      }
      for (const c of clusters) {
        x0 = Math.min(x0, c.x - c.r);
        x1 = Math.max(x1, c.x + c.r);
        y0 = Math.min(y0, c.y - c.r);
      }
      const s = Math.min((W * (fx1 - fx0)) / (x1 - x0), (H * 0.94) / -y0);
      const ox = (W * (fx0 + fx1)) / 2 - ((x0 + x1) / 2) * s;
      const oy = H + 0.3;
      this.segs = segs.map((g) => ({ x1: ox + g.x1 * s, y1: oy + g.y1 * s, x2: ox + g.x2 * s, y2: oy + g.y2 * s, thick: g.thick * s }));
      this.clusters = clusters.map((c) => ({ x: ox + c.x * s, y: oy + c.y * s, r: c.r * s }));

      // the wood: characters along each branch; several across the trunk,
      // but a level bough stays one row thick
      const cols = this.cols;
      const rows = this.rows;
      this.wood = new Map();
      const line = (g, into = this.wood) => {
        const dx = g.x2 - g.x1;
        const dy = g.y2 - g.y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = (dx / len) * 0.35;
        const half = Math.max(0, (Math.min(g.thick, 4 * Z) - 1) / 2);
        const steps = Math.ceil(len * 2);
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          for (let o = -half; o <= half + 0.001; o += 0.5) {
            const col = Math.round(g.x1 + dx * t + nx * o);
            const fy = (g.y1 + dy * t + ny * o) / this.aspect;
            const row = Math.round(fy);
            if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
            into.set(row * cols + col, lineGlyph(dx, dy, fy - row));
          }
        }
      };
      this.segs.forEach((g) => line(g));
      // bare in winter: a few fine twigs at the ends of the larger branches,
      // reaching up and out where the blossoms and leaves were (drawn
      // lighter than the branches)
      this.twigs = new Map();
      if (cfg.snow) {
        const tr = rng(this.seed + 5);
        const big = this.clusters.map((c) => c.r).sort((a, b) => a - b)[Math.floor(this.clusters.length / 2)] || 0;
        for (const c of this.clusters) {
          if (c.r < big) continue;
          const side = tr() < 0.5 ? -1 : 1;
          const n = tr() < 0.4 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const a = -Math.PI / 2 + side * (k ? -1 : 1) * between(tr, 0.35, 1.0);
            const len = c.r * between(tr, 0.5, 0.85);
            line({ x1: c.x, y1: c.y, x2: c.x + Math.cos(a) * len, y2: c.y + Math.sin(a) * len, thick: 1 }, this.twigs);
          }
        }
        for (const i of this.wood.keys()) this.twigs.delete(i);
      }

      // the crown: a soft density field around the clusters, read as
      // characters from sparse to dense, shaded as if lit from above
      const field = new Float32Array(cols * rows);
      for (const c of this.clusters) {
        const sig = c.r * LOOK.sig;
        const reach = sig * 2.4;
        const xa = Math.max(0, Math.floor(c.x - reach));
        const xb = Math.min(cols - 1, Math.ceil(c.x + reach));
        const ya = Math.max(0, Math.floor((c.y - reach) / this.aspect));
        const yb = Math.min(rows - 1, Math.ceil((c.y + reach) / this.aspect));
        for (let row = ya; row <= yb; row++) {
          for (let col = xa; col <= xb; col++) {
            const ddx = col - c.x;
            const ddy = row * this.aspect - c.y;
            field[row * cols + col] += Math.exp(-(ddx * ddx + ddy * ddy) / (2 * sig * sig));
          }
        }
      }
      const f = (col, row) => (col < 0 || row < 0 || col >= cols || row >= rows ? 0 : field[row * cols + col]);
      this.blooms = [];
      const bloom = (i, col, row, v, tone, n) => this.blooms.push({
        i,
        col,
        row,
        v,
        tone,
        ph: n * 6.283,
        sp: 0.6 + n,
        charge: 1, // what it still has to give (1: full)
        stir: 0, // how much the pointer is shaking it
      });
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const raw = field[i];
          if (raw < 0.04) continue;
          const d = 1 - Math.exp(-LOOK.sat * raw * cfg.crown);
          const n = hash(col, row, this.seed);
          // ragged edges: the thinner the crown, the more cells stay empty
          if (n > d * LOOK.drop) continue;
          if (this.wood.has(i) && d < 0.55) continue; // the wood shows through
          const val = clamp01(d * (LOOK.tex0 + LOOK.tex1 * hash(row, col, this.seed + 7)));
          // light from above and a little from the left: the field falls away
          // towards the light on the lit side
          const gx = (f(col + 1, row) - f(col - 1, row)) * 0.5;
          const gy = (f(col, row + 1) - f(col, row - 1)) * 0.5;
          const lit = (gx * 0.45 + gy * 0.9) * 2.2 * Z;
          bloom(i, col, row, val, lit > 0.12 ? 'light' : lit < -0.12 ? 'deep' : 'bloom', n);
        }
      }
      if (cfg.snow) {
        // snow lying on the branches: a little on top of most of the wood,
        // in places two characters deep
        const taken = new Set(this.blooms.map((b) => b.i));
        const free = (i) => i >= 0 && !this.wood.has(i) && !this.twigs.has(i) && !taken.has(i);
        for (const [i, g] of this.wood) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const up = i - cols;
          if (row === 0 || g === '|' || !free(up)) continue;
          const n = hash(col, row, this.seed + 9);
          if (n < 0.45) continue;
          taken.add(up);
          bloom(up, col, row - 1, 0.18 + 0.3 * n, 'light', n);
          if (n > 0.7 && row > 1 && free(up - cols)) {
            taken.add(up - cols);
            bloom(up - cols, col, row - 2, 0.1 + 0.2 * n, 'light', n);
          }
        }
      }
      this.crownAt = new Set(this.blooms.map((b) => b.i));
      for (const i of this.twigs.keys()) this.crownAt.add(i);

      // the object of the season: left of the tree's room, standing on the
      // ground line, at most half as tall as the tree (its size of that;
      // less where the band is narrow; none if there is too little room).
      // Its grid of characters, in pixels from the canvas's corner
      this.object = null;
      const scene = SCENES[this.season];
      if (scene) {
        const right = Math.floor(cols * this.room[0]) - 2; // the tree's room starts after this column
        let top = rows - 1;
        for (const b of this.blooms) top = Math.min(top, b.row);
        for (const i of this.wood.keys()) top = Math.min(top, Math.floor(i / cols));
        let orows = Math.floor(0.5 * scene.size * (rows - 1 - top));
        const across = () => Math.ceil((scene.w * orows * this.lineH) / this.cellW);
        let ocols = across();
        while (orows > 10 && ocols > right - 1) {
          orows--;
          ocols = across();
        }
        if (ocols <= right - 1) {
          const x0 = Math.max(1, Math.min(Math.round(cols * 0.17 - ocols / 2), right - ocols));
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(ocols * this.cellW * this.dpr);
          canvas.height = Math.ceil(orows * this.lineH * this.dpr);
          const ctx = canvas.getContext('2d');
          ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          ctx.font = this.font;
          ctx.textBaseline = 'top';
          const n = orows * ocols;
          this.object = {
            scene,
            rows: orows,
            cols: ocols,
            left: x0 * this.cellW,
            top: (rows - 1 - orows) * this.lineH, // on the ground line
            st: scene.init ? scene.init() : {},
            canvas, // its characters are drawn here, and copied onto the band
            ctx,
            ready: false, // drawn in full yet
            moved: [], // where something moved in the last frame
            cover: new Float32Array(n), // how much of each cell the scene fills
            rgb: new Float32Array(n * 3),
            thick: new Float32Array(n),
            part: new Int16Array(n), // the outlined part in the cell
            share: new Float32Array(n), // how much of the cell it fills
            glow: new Uint8Array(n),
            glowing: new Set(), // the parts that give light
            markAt: new Map(), // the details drawn as characters: cell -> [character, colour]
            glyph: new Array(n).fill(null), // [character, colour, opacity]
            solid: new Set(), // the tree's cells it covers: what falls passes behind it
          };
        }
      }

      // a faint, broken ground line under the tree; under an object on a
      // lawn, grass
      this.ground = new Map();
      this.lawn = new Set();
      const last = (rows - 1) * cols;
      const o = this.object;
      const grass = o && o.scene.lawn ? [Math.floor(o.left / this.cellW) - 1, Math.ceil(o.left / this.cellW + o.cols) + 1] : null;
      this.lawnColor = grass && forTheme(hex(o.scene.lawn), this.dark);
      for (let col = 0; col < cols; col++) {
        const h = hash(col, rows, this.seed + 3);
        if (grass && col >= grass[0] && col <= grass[1]) {
          this.lawn.add(last + col);
          this.ground.set(last + col, h < 0.3 ? ',' : h < 0.45 ? '\'' : '_');
          continue;
        }
        if (h < 0.18) continue;
        this.ground.set(last + col, h < 0.26 ? '.' : h < 0.31 ? ',' : '_');
      }

      // start in the middle of it: petals or leaves in the air, some on the
      // ground (in autumn and winter a good many), snow falling in winter
      this.petals = [];
      this.fallen = [];
      this.flakes = [];
      const target = this.petalTarget();
      for (let k = 0; k < target; k++) this.spawn(true);
      const lying = cfg.snow ? 0.45 : this.season === 'autumn' ? 0.25 : 0;
      for (let col = 0; col < cols; col++) {
        if (this.rand() < lying) this.settle(col, this.rand());
      }
      if (cfg.snow) {
        const n = this.flakeTarget();
        for (let k = 0; k < n; k++) this.flake(true);
      }
    }

    // how many petals (or leaves) are in the air by themselves, and how many
    // snowflakes: twice as many as characters the size of a step would need
    petalTarget() {
      return Math.max(0, Math.min(84, Math.round(((this.cols * this.rows) / (Z * Z * 85)) * 2 * this.cfg.trickle)));
    }

    flakeTarget() {
      return Math.min(MAX_FLAKES, Math.round(((this.cols * this.rows) / (Z * Z * 40)) * 2));
    }

    // a petal (or a leaf, or a bit of snow): it falls at the speed its drag
    // allows and moves with the air, swaying and turning over as it goes
    petal(x, y, extra) {
      const r = this.rand;
      const fall = between(r, 0.9, 1.6) * this.fall; // the speed it falls at in still air
      const drift = between(r, 0.6, 1.4); // how much the wind takes it along
      return Object.assign({
        x,
        y,
        vx: WIND * drift,
        vy: fall,
        drag: G / fall,
        drift,
        sway: between(r, 0.4, 1.2),
        freq: between(r, 0.5, 1.1),
        phase: r() * 6.28,
        rot: r() * 6.28,
        spin: between(r, 1.4, 3.6) * (r() < 0.5 ? -1 : 1),
        // the shaken ones: a quick drop out of the tree (columns per second
        // downwards), then a breeze that catches them at catchAt seconds and
        // carries them to the left (columns per second), dying away with the
        // time constant tau, while they bob up and down a little
        drop: 0,
        breeze: 0,
        catchAt: 0,
        tau: 1,
        bob: 0,
        age: 0,
        appear: 0.7, // seconds to fade in
        life: Infinity, // seconds until it drifts out of sight
      }, extra);
    }

    // a petal or a leaf that comes loose by itself
    spawn(anywhere) {
      const r = this.rand;
      let x;
      let y;
      if (this.clusters.length && r() < 0.88) {
        const c = this.clusters[Math.floor(r() * this.clusters.length)];
        x = (c.x + gauss(r) * c.r) / Z;
        y = (c.y + gauss(r) * c.r * 0.6) / Z;
      } else {
        x = between(r, -2, this.steps + 2) - WIND * 3;
        y = between(r, -3, 0);
      }
      if (anywhere) {
        y += between(r, 0, (this.rows / Z) * this.aspect * 0.9);
        x += WIND * between(r, 0, 8);
      }
      this.petals.push(this.petal(x, y, { age: anywhere ? 2 : 0 }));
    }

    // something shaken loose from the crown at blossom (or leaf, or snow) b
    loosen(b) {
      const r = this.rand;
      const x = b.col / Z + between(r, -0.4, 0.4);
      const y = (b.row * this.aspect) / Z + between(r, -0.5, 0.5);
      if (this.cfg.snow) {
        // a puff of snow: it falls almost straight down, spreading a little
        // and drifting only a short way to the left
        this.petals.push(this.petal(x, y, {
          vx: between(r, -1.2, 0.6),
          vy: between(r, -0.4, 1),
          drop: between(r, 1.5, 3.5),
          breeze: -between(r, 1, 2.5),
          catchAt: between(r, 0.2, 0.6),
          tau: between(r, 1, 2),
          bob: between(r, 0.2, 0.6),
          size: r(),
          snow: true,
          appear: 0.05,
          life: between(r, 0.8, 2.6),
        }));
        return;
      }
      // a petal or a leaf: tossed out of the crown (some a little upwards),
      // it drops out of the tree; then the breeze catches it and carries it
      // far to the left while it sinks only slowly. Each one drifts out of
      // sight after a while of its own, so the flurry thins out gradually on
      // its way to the left
      this.petals.push(this.petal(x, y, {
        vx: between(r, -3, -0.5),
        vy: between(r, -1, 0.8),
        spin: between(r, 2.4, 4.8) * (r() < 0.5 ? -1 : 1),
        drop: between(r, 2.5, 5),
        breeze: -between(r, 7, 11),
        catchAt: between(r, 0.5, 1.1),
        tau: between(r, 8, 12),
        bob: between(r, 0.8, 1.8),
        appear: 0.05,
        life: 1.8 + Math.min(10.2, -Math.log(1 - r()) * 5),
      }));
    }

    // something comes to rest on the ground at column col
    settle(col, age) {
      const r = this.rand;
      const [a, b] = this.cfg.rest;
      const life = between(r, a, b);
      const g = this.cfg.ground;
      this.fallen.push({ col, age: age * life, life, g: g[Math.floor(r() * g.length)] });
    }

    // a snowflake: nearer ones (depth d close to 1) are bigger, brighter and
    // faster; far ones pass behind the tree
    flake(anywhere) {
      const r = this.rand;
      const d = r();
      this.flakes.push({
        x: between(r, -2, this.steps + 10),
        y: anywhere ? between(r, 0, (this.rows / Z) * this.aspect) : between(r, -2, 0),
        d,
        vy: (0.5 + 1.3 * d) * this.fall,
        sway: between(r, 0.3, 1),
        freq: between(r, 0.4, 1),
        phase: r() * 6.28,
        age: anywhere ? 2 : 0,
      });
    }

    // the pointer over the canvas (character cells); moving faster stirs
    // the crown harder, a tap stirs it at once
    point(e, tap) {
      if (this.reduce) return;
      const rect = this.canvas.getBoundingClientRect();
      const col = (e.clientX - rect.left) / this.cellW;
      const row = (e.clientY - rect.top) / this.lineH;
      const now = e.timeStamp || performance.now();
      const p = this.pointer;
      let speed = 0; // steps per second
      if (p && now > p.t && now - p.t < 250) {
        speed = Math.hypot(col - p.col, (row - p.row) * this.aspect) / Z / ((now - p.t) / 1000);
      }
      const push = tap ? 1.6 : Math.min(1.6, 0.55 + speed / 40);
      this.pointer = { col, row, t: now, energy: Math.max(p ? p.energy : 0, push) };
      if (tap && this.running) this.shake(0.25); // a tap: a handful at once
    }

    // the crown near the pointer shakes, and some of it comes loose
    shake(dt) {
      const p = this.pointer;
      const r = this.rand;
      const rate = 4 * this.cfg.shed;
      const reach = REACH * Z; // in characters
      for (const b of this.blooms) {
        const dx = b.col - p.col;
        const dy = (b.row - p.row) * this.aspect;
        const d2 = dx * dx + dy * dy;
        if (d2 > reach * reach) continue;
        const w = 1 - Math.sqrt(d2) / reach;
        b.stir = Math.max(b.stir, w * Math.min(1, p.energy));
        // it thins out as it is shaken, and now and then a petal goes
        const k = p.energy * w * b.charge * rate * dt;
        b.charge = Math.max(0, b.charge - 0.26 * k);
        if (this.petals.length < MAX_PETALS && r() < k * EMIT) this.loosen(b);
      }
    }

    step(dt) {
      this.time += dt;
      const t = this.time;
      const r = this.rand;
      // the wind comes and goes
      this.gust = 0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.17 + 1.3);
      const blow = 0.6 + 0.8 * this.gust;
      if (this.pointer) {
        this.pointer.energy *= Math.exp(-1.6 * dt); // a resting pointer soon stops stirring
        if (this.pointer.energy > 0.04) this.shake(dt);
      }
      for (const b of this.blooms) {
        if (b.charge < 1) b.charge = Math.min(1, b.charge + 0.09 * dt); // fills in again (about 10 s)
        if (b.stir > 0.01) b.stir *= Math.exp(-2.5 * dt);
        else b.stir = 0;
      }
      // in steps: the height, and the top of the ground line
      const H = (this.rows / Z) * this.aspect;
      const groundY = ((this.rows - 1) / Z) * this.aspect;
      const keep = [];
      for (const p of this.petals) {
        p.age += dt;
        if (p.age > p.life) continue; // drifted out of sight
        // the air it moves in: the wind and, for a shaken one, first the
        // drop out of the tree, then the breeze that catches it (it holds
        // it up a little and slowly dies away). It takes on the air's motion
        // and falls at the speed its drag allows (face-on, it catches more
        // air than edge-on)
        const drag = p.drag * (0.75 + 0.5 * Math.abs(Math.cos(p.rot)));
        let ax = WIND * p.drift * blow;
        let ay = G / drag;
        if (p.breeze) {
          const u = clamp01((p.age - p.catchAt) / 0.8);
          const caught = u * u * (3 - 2 * u);
          ax += p.breeze * caught * Math.exp(-Math.max(0, p.age - p.catchAt) / p.tau);
          ay += p.drop * (1 - caught) - caught * (0.6 * ay - p.bob * Math.sin(t * p.freq * 2.3 + p.phase));
        }
        const kx = Math.exp(-1.6 * dt);
        const ky = Math.exp(-drag * dt);
        p.vx = ax + (p.vx - ax) * kx;
        p.vy = ay + (p.vy - ay) * ky;
        p.x += (p.vx + Math.sin(t * p.freq + p.phase) * p.sway) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt * (0.7 + 0.6 * this.gust);
        if (p.y >= groundY && p.x >= 0 && p.x < this.steps && r() < 0.75) {
          this.settle(Math.round(p.x * Z), 0); // it comes to rest on the ground
          continue;
        }
        if (p.y < H + 1 && p.x > -4 && p.x < this.steps + 4) keep.push(p);
      }
      this.petals = keep;
      // what goes on in the object's scene (the goldfish's bubbles)
      const ob = this.object;
      if (ob && ob.scene.step) ob.scene.step(ob.st, t, dt, r);
      // the snow: it keeps falling, and much of it settles on the ground
      if (this.cfg.snow) {
        const flakes = [];
        for (const fl of this.flakes) {
          fl.age += dt;
          fl.x += (WIND * blow * (0.4 + fl.d) + Math.sin(t * fl.freq + fl.phase) * fl.sway) * dt;
          fl.y += fl.vy * dt;
          if (fl.y >= groundY && fl.x >= 0 && fl.x < this.steps && r() < 0.6) {
            this.settle(Math.round(fl.x * Z), 0);
            continue;
          }
          if (fl.y < H + 1 && fl.x > -4) flakes.push(fl);
        }
        this.flakes = flakes;
        this.snowDebt += dt * this.flakeTarget() * 0.16;
        while (this.snowDebt >= 1) {
          if (this.flakes.length < this.flakeTarget()) this.flake(false);
          this.snowDebt -= 1;
        }
      }
      for (const f of this.fallen) f.age += dt;
      this.fallen = this.fallen.filter((f) => f.age < f.life).slice(-MAX_FALLEN);
      // a steady trickle, a little more when the wind picks up
      const target = this.petalTarget();
      this.debt += dt * target * 0.3 * (0.6 + 0.8 * this.gust);
      while (this.debt >= 1) {
        if (this.petals.length < target) this.spawn(false);
        this.debt -= 1;
      }
    }

    draw() {
      const ctx = this.ctx;
      const cols = this.cols;
      const t = this.time;
      const cfg = this.cfg;
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.textBaseline = 'top';
      // the object first: what falls passes behind it
      if (this.object) this.updateObject(t);
      ctx.font = this.font;
      const cells = new Map();
      for (const [i, g] of this.ground) cells.set(i, this.lawn.has(i) ? [g, this.lawnColor, 0.9] : [g, this.colors.wood, 0.55]);
      // far snowflakes pass behind the tree
      for (const fl of this.flakes) {
        if (fl.d >= 0.5) continue;
        const i = this.flakeCell(fl);
        if (i >= 0) cells.set(i, ['.', this.colors.bloom, (0.3 + 0.6 * fl.d) * Math.min(1, fl.age / 0.6)]);
      }
      for (const [i, g] of this.twigs) cells.set(i, [g, this.colors.wood, 0.6]);
      for (const [i, g] of this.wood) cells.set(i, [g, this.colors.wood, 1]);
      // a gust runs through the crown in the direction of the wind; the
      // shaken parts flicker, the ones that lost petals (or leaves, or snow)
      // are thinner
      const gust = 0.6 + 0.8 * this.gust;
      const ramp = cfg.ramp;
      const n = ramp.length;
      for (const b of this.blooms) {
        const w = 0.5 + 0.5 * Math.sin((b.col * 0.21 + b.row * 0.3) / Z + 1.1 * t);
        let v = b.v * (0.45 + 0.55 * b.charge) * (0.84 + 0.16 * w * gust) + 0.05 * Math.sin(t * b.sp + b.ph);
        if (b.stir) v += 0.22 * b.stir * Math.sin(t * 19 + b.ph * 3);
        v = clamp01(v);
        if (v < 0.04) continue;
        const g = ramp[Math.min(n - 1, Math.floor(v ** LOOK.gamma * n))];
        cells.set(b.i, [g, this.colors[b.tone], 0.5 + 0.5 * v]);
      }
      const last = (this.rows - 1) * cols;
      for (const f of this.fallen) {
        if (f.col < 0 || f.col >= cols || this.wood.has(last + f.col)) continue;
        cells.set(last + f.col, [f.g, this.colors.petal, 0.75 * Math.min(1, f.age / 0.3, (f.life - f.age) / 1.5)]);
      }
      const falls = cfg.falls;
      for (const p of this.petals) {
        const col = Math.round(p.x * Z);
        const row = Math.round((p.y * Z) / this.aspect);
        if (col < 0 || row < 0 || col >= cols || row >= this.rows) continue;
        if (this.object && this.object.solid.has(row * cols + col)) continue; // behind the object
        let g;
        if (p.snow) {
          g = falls[Math.min(falls.length - 1, Math.floor(p.size * falls.length))];
        } else {
          // face-on, turning, or edge-on one way or the other
          const c = Math.abs(Math.cos(p.rot));
          g = c > 0.75 ? falls[0] : c > 0.4 ? falls[1] : Math.sin(p.rot) > 0 ? falls[2] : falls[3];
        }
        // faded in at first and out towards the side edges; a shaken one
        // drifting out of sight gets smaller, then is gone
        let a = 0.9 * Math.min(1, p.age / p.appear, (col + 1) / (3 * Z), (cols - col) / (3 * Z));
        const left = p.life - p.age;
        if (left < 0.9) {
          a *= left / 0.9;
          if (left < 0.5) g = '.';
        }
        cells.set(row * cols + col, [g, this.colors.petal, a]);
      }
      // near snowflakes pass in front
      for (const fl of this.flakes) {
        if (fl.d < 0.5) continue;
        const i = this.flakeCell(fl);
        if (i < 0) continue;
        const g = fl.d > 0.78 ? '*' : '+';
        cells.set(i, [g, fl.d > 0.65 ? this.colors.petal : this.colors.bloom, (0.3 + 0.6 * fl.d) * Math.min(1, fl.age / 0.6)]);
      }
      // draw grouped by colour and opacity; then the object over it all
      paintCells(ctx, cells, (i) => (i % cols) * this.cellW, (i) => Math.floor(i / cols) * this.lineH);
      const o = this.object;
      if (o) ctx.drawImage(o.canvas, o.left, o.top, o.canvas.width / this.dpr, o.canvas.height / this.dpr);
    }

    // ---- the object ----
    // It is drawn the way a picture is turned into ASCII art, on a canvas of
    // its own: in full once, then in each frame only where something moves
    // (the scene says where). Every cell of its grid is sampled 3 x 4 times;
    // where the outline of the scene or of one of its parts runs (found the
    // way an image filter finds edges, one character thick), the cell gets
    // a character that follows it, elsewhere one as dense as the light
    // (dark theme) or the shade (light theme) there.

    // sample cell i
    sampleCell(i, t) {
      const o = this.object;
      shade.ambient = this.dark ? 0.55 : 0.62;
      const { scene, st, cover, rgb, thick, part, share, glow } = o;
      const ow = this.cellW;
      const oh = this.lineH;
      const unit = o.rows * oh; // the height of the scene, in pixels
      const half = (o.cols * ow) / 2;
      const q = i % o.cols;
      const r = Math.floor(i / o.cols);
      let n = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let th = 0;
      let pid = 0; // the first part met in the cell, and how much of it
      let pn = 0;
      let pg = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const s = scene.sample(((q + (sx + 0.5) / 3) * ow - half) / unit, ((r + (sy + 0.5) / 4) * oh) / unit, t, scene.c, st);
          if (!s) continue;
          n++;
          red += s[0];
          green += s[1];
          blue += s[2];
          th += s[3] === undefined ? 1 : s[3];
          if (s[4]) {
            const id = s[5] || s[4];
            if (!pid) pid = id;
            if (id === pid) {
              pn++;
              if (s[4] === GLOWING) pg++;
            }
          }
        }
      }
      cover[i] = n / 12;
      rgb[i * 3] = n ? red / n : 0;
      rgb[i * 3 + 1] = n ? green / n : 0;
      rgb[i * 3 + 2] = n ? blue / n : 0;
      thick[i] = n ? th / n : 0;
      part[i] = pid;
      share[i] = pn / 12;
      glow[i] = pg * 2 > pn ? 1 : 0;
      if (glow[i]) o.glowing.add(pid);
    }

    // the character of cell i ([character, colour, opacity], or null):
    // 0 if it is as it was, 1 if it changed, 2 if it appeared or went
    glyphCell(i) {
      const o = this.object;
      const was = o.glyph[i];
      const now = o.cover[i] < 1 / 6 ? null : this.glyphOf(i);
      o.glyph[i] = now;
      if (!was !== !now) return 2;
      return now && (now[0] !== was[0] || now[1] !== was[1] || now[2] !== was[2]) ? 1 : 0;
    }

    glyphOf(i) {
      const o = this.object;
      const { cover, rgb, thick, part, share, glow } = o;
      const dark = this.dark;
      const mark = o.markAt.get(i);
      if (mark) return [mark[0], forTheme(o.scene.c[mark[1]], dark), 1];
      const C = o.cols;
      const R = o.rows;
      const q = i % C;
      const r = Math.floor(i / C);
      const col = [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
      const g = [0, 0];
      // the scene's outline, one character thick: in the cells it runs
      // through, or, where it runs between two cells, in the one inside
      sobel(cover, null, 0, C, R, q, r, g);
      let [gx, gy] = g;
      let mag = Math.hypot(gx, gy);
      const bare = (qq, rr) => qq < 0 || rr < 0 || qq >= C || (rr < R && cover[rr * C + qq] < 1 / 6);
      if (cover[i] >= 0.9 && !(bare(q - 1, r) || bare(q + 1, r) || bare(q, r - 1) || bare(q, r + 1))) mag = 0;
      let inner = false;
      let lightOf = -1;
      // the outlines of its parts: the strongest among the parts here and
      // next to here
      const ids = [];
      for (let rr = Math.max(0, r - 1); rr <= Math.min(R - 1, r + 1); rr++) {
        for (let qq = Math.max(0, q - 1); qq <= Math.min(C - 1, q + 1); qq++) {
          const p = part[rr * C + qq];
          if (p && !ids.includes(p)) ids.push(p);
        }
      }
      for (const p of ids) {
        sobel(share, part, p, C, R, q, r, g);
        const m = Math.hypot(g[0], g[1]);
        // the outline of a part runs round its outside
        if (m <= mag || (part[i] === p && share[i] >= 0.5)) continue;
        [gx, gy] = g;
        mag = m;
        inner = true;
        // a glowing part lights its own outline
        lightOf = -1;
        for (let rr = Math.max(0, r - 1); rr <= Math.min(R - 1, r + 1) && lightOf < 0; rr++) {
          for (let qq = Math.max(0, q - 1); qq <= Math.min(C - 1, q + 1); qq++) {
            const j = rr * C + qq;
            if (part[j] === p && glow[j]) {
              lightOf = j;
              break;
            }
          }
        }
      }
      if (mag > 0.16) {
        // (a shape's own edge is rounded, ( or ), where it is wide)
        const wide = !inner && (gx > 0 ? q + 2 < C && cover[i + 2] > 0.5 : q >= 2 && cover[i - 2] > 0.5);
        const ch = edgeGlyph(gx / this.cellW, gy / this.lineH, inner ? share[i] : cover[i], !wide);
        if (lightOf < 0) return [ch, forTheme(col.map((v) => v * (dark ? 1.25 : 0.5)), dark), 1];
        const lc = [rgb[lightOf * 3], rgb[lightOf * 3 + 1], rgb[lightOf * 3 + 2]];
        return [ch, forTheme(glow[i] ? lc : mix(col, lc, 0.7), dark, true), 1];
      }
      // inside: as dense as the light (or the shade) there
      const Y = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2];
      // (on the light page even white things get some ink, and what glows
      // is drawn dense, its colour telling how bright it is)
      let ink;
      if (glow[i]) ink = dark ? 0.1 + 0.9 * clamp01(Y / 0.85) ** 0.9 : 0.72 + 0.28 * clamp01(Y / 0.7);
      else if (dark) ink = 0.12 + 0.88 * clamp01(Y / 0.78) ** 1.2;
      else {
        // (more for a vivid colour, so that it shows)
        const hi = Math.max(...col);
        ink = 0.3 + 0.6 * clamp01((1 - Y) / 0.78) ** 1.1 + (hi ? 0.25 * (1 - Math.min(...col) / hi) : 0);
      }
      ink = clamp01(ink * thick[i] + DITHER[(r & 1) * 2 + (q & 1)]);
      const a = glow[i] ? 0.7 + 0.3 * ink : dark ? 0.55 + 0.45 * ink : 0.75 + 0.25 * ink;
      return [FILL[Math.max(1, Math.min(9, Math.round(ink * 9)))], forTheme(col, dark, glow[i]), a];
    }

    // paint the cells marked in mask afresh on the object's canvas (all of
    // them without one)
    paintObject(mask) {
      const o = this.object;
      const ow = this.cellW;
      const oh = this.lineH;
      const C = o.cols;
      const c = o.ctx;
      const list = [];
      c.save();
      if (mask) {
        // only there: each row's runs of marked cells
        c.beginPath();
        for (let r = 0; r < o.rows; r++) {
          for (let q = 0; q < C; q++) {
            if (!mask[r * C + q]) continue;
            let e = q;
            while (e + 1 < C && mask[r * C + e + 1]) e++;
            c.rect(q * ow, r * oh, (e - q + 1) * ow, oh);
            q = e;
          }
        }
        c.clip();
        // with the characters round them, which may reach into them
        const near = this.grown(mask);
        for (let i = 0; i < near.length; i++) if (near[i] && o.glyph[i]) list.push([i, o.glyph[i]]);
      } else {
        for (let i = 0; i < o.glyph.length; i++) if (o.glyph[i]) list.push([i, o.glyph[i]]);
      }
      c.clearRect(0, 0, C * ow, o.rows * oh);
      paintCells(c, list, (i) => (i % C) * ow, (i) => Math.floor(i / C) * oh);
      c.restore();
    }

    // a mask of the object's cells, grown by one cell all round
    grown(mask) {
      const o = this.object;
      const C = o.cols;
      const out = new Uint8Array(mask.length);
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        const q = i % C;
        const r = Math.floor(i / C);
        for (let rr = Math.max(0, r - 1); rr <= Math.min(o.rows - 1, r + 1); rr++) {
          for (let qq = Math.max(0, q - 1); qq <= Math.min(C - 1, q + 1); qq++) out[rr * C + qq] = 1;
        }
      }
      return out;
    }

    // the tree's cells under the object's characters: what falls passes
    // behind them
    solidObject() {
      const o = this.object;
      o.solid.clear();
      for (let i = 0; i < o.glyph.length; i++) {
        if (!o.glyph[i]) continue;
        const x = o.left + (i % o.cols) * this.cellW;
        const y = o.top + Math.floor(i / o.cols) * this.lineH;
        for (let row = Math.floor(y / this.lineH); row <= Math.floor((y + this.lineH - 0.01) / this.lineH); row++) {
          for (let c = Math.floor(x / this.cellW); c <= Math.floor((x + this.cellW - 0.01) / this.cellW); c++) o.solid.add(row * this.cols + c);
        }
      }
    }

    // bring the object up to time t: in full the first time; then where
    // something moves now or moved in the last frame, and where it glows
    updateObject(t) {
      const o = this.object;
      const { scene, st } = o;
      if (scene.frame) scene.frame(st, t, this.dark);
      const N = o.rows * o.cols;
      const unit = o.rows * this.lineH; // the height of the scene, in pixels
      const half = (o.cols * this.cellW) / 2;
      // the details drawn as characters, in their cells now
      const marked = o.markAt;
      o.markAt = new Map();
      for (const [mx, my, ch, name] of scene.marks ? scene.marks(st, t) : []) {
        const q = Math.floor((mx * unit + half) / this.cellW);
        const r = Math.floor((my * unit) / this.lineH);
        if (q >= 0 && q < o.cols && r >= 0 && r < o.rows) o.markAt.set(r * o.cols + q, [ch, name]);
      }
      if (!o.ready) {
        o.glowing = new Set();
        o.glyph.fill(null);
        for (let i = 0; i < N; i++) this.sampleCell(i, t);
        for (let i = 0; i < N; i++) this.glyphCell(i);
        this.paintObject(null);
        this.solidObject();
        o.lit = new Uint8Array(N); // the glowing cells
        for (let i = 0; i < N; i++) o.lit[i] = o.glow[i];
        o.moved = new Uint8Array(N);
        o.key = st.key;
        o.ready = true;
        return;
      }
      // to sample afresh: where things move now (and so again in the next
      // frame, when they have moved on), where they were in the last frame,
      // what changes where it is (a box marked so), and the glowing cells
      // when the light has changed
      const now = new Uint8Array(N);
      const resample = st.key === o.key ? new Uint8Array(N) : o.lit.slice();
      o.key = st.key;
      for (const [x0, y0, x1, y1, still] of scene.moving ? scene.moving(st, t) : []) {
        const q0 = Math.max(0, Math.floor((x0 * unit + half) / this.cellW) - 1);
        const r0 = Math.max(0, Math.floor((y0 * unit) / this.lineH) - 1);
        const q1 = Math.min(o.cols - 1, Math.floor((x1 * unit + half) / this.cellW) + 1);
        const r1 = Math.min(o.rows - 1, Math.floor((y1 * unit) / this.lineH) + 1);
        for (let r = r0; r <= r1; r++) (still ? resample : now).fill(1, r * o.cols + q0, r * o.cols + q1 + 1);
      }
      let any = false;
      for (let i = 0; i < N; i++) {
        if (now[i] || o.moved[i]) resample[i] = 1;
        if (resample[i]) {
          this.sampleCell(i, t);
          any = true;
        }
      }
      o.moved = now;
      // the cells a detail came to or left
      const shifted = [];
      for (const [i, m] of o.markAt) if (!marked.has(i) || marked.get(i)[0] !== m[0]) shifted.push(i);
      for (const i of marked.keys()) if (!o.markAt.has(i)) shifted.push(i);
      if (!any && !shifted.length) return;
      // a cell's character depends on its neighbours too; only the ones
      // that changed are painted again
      const redo = this.grown(resample);
      for (const i of shifted) redo[i] = 1;
      const changed = new Uint8Array(N);
      let some = 0;
      for (let i = 0; i < N; i++) {
        if (redo[i]) {
          changed[i] = this.glyphCell(i);
          some |= changed[i];
        }
      }
      if (some) this.paintObject(changed);
      if (some & 2) this.solidObject();
    }

    // the cell of a snowflake, or -1 off the canvas (far ones: also behind
    // the tree)
    flakeCell(fl) {
      const col = Math.round(fl.x * Z);
      const row = Math.round((fl.y * Z) / this.aspect);
      if (col < 0 || row < 0 || col >= this.cols || row >= this.rows - 1) return -1;
      const i = row * this.cols + col;
      if (fl.d < 0.5 && (this.wood.has(i) || this.crownAt.has(i))) return -1;
      if (this.object && this.object.solid.has(i)) return -1; // behind the object
      return i;
    }

    start() {
      if (this.reduce) {
        for (let k = 0; k < 40; k++) this.step(0.15); // a still frame, petals in the air
        this.draw();
        return;
      }
      if (this.running || !this.visible || document.hidden) return;
      this.running = true;
      let last = performance.now();
      let acc = 0;
      const tick = (now) => {
        if (!this.running) return;
        acc += Math.min(0.25, (now - last) / 1000);
        last = now;
        if (acc >= 1 / FPS) {
          this.step(acc);
          this.draw();
          acc = 0;
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  }

  const init = () => {
    const season = pickSeason();
    const items = [...document.querySelectorAll('canvas.ascii-sakura')].map((c) => {
      c.dataset.season = season;
      return new Sakura(c, season);
    });
    if (!items.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const s = items.find((x) => x.canvas === e.target);
        if (!s) return;
        s.visible = e.isIntersecting;
        if (s.visible) s.start();
        else s.stop();
      });
    });
    items.forEach((s) => {
      io.observe(s.canvas);
      // a mouse stirs the crown it passes over; a finger, the part it taps
      const c = s.canvas;
      c.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') s.point(e, false); });
      c.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') s.point(e, true); });
      c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') s.pointer = null; });
    });
    document.addEventListener('visibilitychange', () => {
      items.forEach((s) => (document.hidden ? s.stop() : s.start()));
    });
    const redo = (s) => {
      s.layout();
      s.draw();
    };
    const ro = new ResizeObserver(() => {
      items.forEach((s) => {
        const rect = s.canvas.getBoundingClientRect();
        if (Math.abs(rect.width - s.w) > 1 || Math.abs(rect.height - s.h) > 1) redo(s);
      });
    });
    items.forEach((s) => ro.observe(s.canvas));
    // the colours change with the theme (light or dark)
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    if (dark.addEventListener) dark.addEventListener('change', () => items.forEach(redo));
    // a font that arrives late changes the character cell: lay out again
    if (document.fonts) {
      document.fonts.addEventListener('loadingdone', () => {
        items.forEach((s) => {
          s.ctx.font = s.font;
          if (Math.abs((s.ctx.measureText('M').width || 0) - s.cellW) > 0.01) redo(s);
        });
      });
    }
    window.asciiSakura = items; // (for tests)
  };
  // draw with the web font once it is ready
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
  else window.addEventListener('load', init);
})();
