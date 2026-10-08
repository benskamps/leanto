// scene.js — renderer, camera, lights, sky, room, table. Three.js mirrors physics.
// The register is a craft table by a window in late-afternoon light: a pool of
// window light (with a houseplant's shadow in it) falls across a walnut table and
// a green cutting mat; the room around it dissolves into warm haze. A little dial
// slides the room from golden afternoon to lamp-lit evening.

import * as THREE from './vendor/three/three.module.min.js';
import { OrbitControls } from './vendor/three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/three/addons/geometries/RoundedBoxGeometry.js';

// a tiny seeded PRNG, so the table, floor and window look the same every visit
function rng(seed){
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function createScene(ctx) {
  const { RAPIER, world } = ctx;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(42, innerWidth/innerHeight, 0.01, 100);
  camera.position.set(0.30, 0.30, 0.48);

  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.id = 'workbench-canvas';   // the skip link's target
  renderer.domElement.setAttribute('aria-label', 'Popsicle-stick workbench');
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.01, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 0.18;
  controls.maxDistance = 2.2;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  const canvas2d = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const tex = (c, srgb = true, aniso = 2) => { const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(aniso, renderer.capabilities.getMaxAnisotropy()); return t; };

  // ---------- sky: a painted dome — warm haze at the horizon, a glow where the sun is ----------
  const skyU = {
    top:     { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    bottom:  { value: new THREE.Color() }, glowCol: { value: new THREE.Color() },
    glowDir: { value: new THREE.Vector3(0.55, 0.42, -0.72).normalize() },
    glow:    { value: 1 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    toneMapped: false,                         // painted colours, shown as authored
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top, horizon, bottom, glowCol, glowDir; uniform float glow; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 c = mix(horizon, top, smoothstep(0.0, 1.0, d.y));
        c = mix(c, bottom, smoothstep(0.0, -0.4, d.y));
        float s = max(dot(d, glowDir), 0.0);
        c += glowCol * glow * (0.16 * pow(s, 3.0) + 0.22 * pow(s, 18.0)) * smoothstep(-0.1, 0.15, d.y);
        float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        c += (n - 0.5) / 200.0;                    // dither: no banding in the gradient
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -1;
  scene.add(sky);

  // ---------- image-based light: a soft warm room with one bright window, prefiltered ----------
  // Gives the wood a gentle sheen, the jar real reflections and the shade side of every
  // stick some bounce, without an HDR download (the page loads nothing off-origin).
  const envScene = new THREE.Scene();
  const envU = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(5, 32, 16), new THREE.ShaderMaterial({
    uniforms: envU, side: THREE.BackSide,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, bottom; varying vec3 vDir;
      void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.3, 0.6, normalize(vDir).y)), 1.0); }`,
  })));
  const envWindow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  envWindow.position.set(2.4, 2.2, -3.0); envWindow.lookAt(0, 0, 0);
  envScene.add(envWindow);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  function bakeEnvironment(){
    const rt = pmrem.fromScene(envScene, 0.035);
    scene.environment = rt.texture;
    if (envRT) envRT.dispose();
    envRT = rt;
  }

  // ---------- lights ----------
  // The key is a window: a spot far away with a painted cookie (panes, mullions, the
  // leaves of a plant on the sill), so its shadows stay near-parallel like sunlight.
  const hemi = new THREE.HemisphereLight('#fff3e2', '#4a3626', 0.35);
  scene.add(hemi);
  const KEY_POS = new THREE.Vector3(1.55, 2.55, -1.15);
  const key = new THREE.SpotLight('#ffe8c8', 7, 0, 0.36, 0.55, 0);
  key.position.copy(KEY_POS);
  key.target.position.set(-0.06, 0, 0.06);
  scene.add(key.target);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);       // interactive budget; photo mode may spend more
  key.shadow.camera.near = 1.8; key.shadow.camera.far = 4.4;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.0022;
  key.shadow.radius = 3;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#d9e4ff', 0.32);   // cool skylight from the room side
  fill.position.set(-0.8, 0.6, 0.7);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#ffd6a8', 0.0);     // the evening desk lamp's back-light
  rim.position.set(-0.5, 0.5, -0.8);
  scene.add(rim);

  // the window cookie, repainted as the dial moves (afternoon panes ⟷ a lamp's round pool)
  const [cookieC, cg] = canvas2d(256, 256);
  const cookie = tex(cookieC, true, 1);
  key.map = cookie;
  const leaves = (() => {                     // a pothos trailing off the sill: fixed, seeded
    const r = rng(7), out = [];
    const stems = [[0.08, 0.98, 0.42, 0.60], [0.02, 0.92, 0.30, 0.78], [0.16, 1.02, 0.20, 0.48]];
    for (const [x0, y0, x1, y1] of stems){
      const n = 7 + (r() * 4 | 0);
      for (let i = 0; i < n; i++){
        const t = (i + r() * 0.4) / n;
        const x = x0 + (x1 - x0) * t + Math.sin(t * 6 + x0 * 9) * 0.03, y = y0 + (y1 - y0) * t;
        out.push({ x, y, a: r() * Math.PI * 2, s: 0.03 + r() * 0.03, t });
      }
      out.push({ stem: [x0, y0, x1, y1] });
    }
    return out;
  })();
  function paintCookie(night){
    const W = cookieC.width;
    cg.save();
    cg.globalCompositeOperation = 'source-over';
    cg.fillStyle = '#000'; cg.fillRect(0, 0, W, W);
    // afternoon: four tall panes, soft at the edges (the glass is old, the light is low)
    const day = 1 - night;
    if (day > 0.01){
      cg.globalAlpha = day;
      cg.filter = 'blur(2.5px)';
      cg.fillStyle = '#fff';
      const x0 = W*0.14, y0 = W*0.12, w = W*0.72, h = W*0.76, bar = W*0.03;
      const pw = (w - bar) / 2, ph = (h - 2*bar) / 3;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++)
        cg.fillRect(x0 + i*(pw + bar), y0 + j*(ph + bar), pw, ph);
      // the plant on the sill: leaves are hearts on curling stems
      cg.filter = 'blur(1.3px)';
      cg.fillStyle = '#000'; cg.strokeStyle = '#000'; cg.lineWidth = W*0.007;
      for (const l of leaves){
        if (l.stem){
          const [a, b, c, d] = l.stem.map(v => v * W);
          cg.beginPath(); cg.moveTo(a, b); cg.quadraticCurveTo(a + (c-a)*0.2 + W*0.08, (b+d)/2, c, d); cg.stroke();
          continue;
        }
        cg.save(); cg.translate(l.x * W, l.y * W); cg.rotate(l.a); cg.scale(l.s * W, l.s * W);
        cg.beginPath(); cg.moveTo(0, 1);
        cg.bezierCurveTo(-1.3, 0.1, -0.8, -1.0, 0, -0.45);
        cg.bezierCurveTo(0.8, -1.0, 1.3, 0.1, 0, 1); cg.fill();
        cg.restore();
      }
    }
    // evening: one warm round pool, brightest in the middle
    if (night > 0.01){
      cg.globalAlpha = night;
      cg.filter = 'none';
      cg.globalCompositeOperation = 'lighter';
      const g = cg.createRadialGradient(W/2, W/2, 0, W/2, W/2, W*0.48);
      g.addColorStop(0, '#fff'); g.addColorStop(0.55, '#d8d8d8'); g.addColorStop(1, '#000');
      cg.fillStyle = g; cg.fillRect(0, 0, W, W);
    }
    cg.restore();
    cookie.needsUpdate = true;
  }

  // ---------- table: walnut planks, a green cutting mat, rounded edges ----------
  function makeTableTextures(){
    const W = 2048, H = 1418;                 // 1.3 × 0.9 m, ~1.6 px/mm
    const [c, g] = canvas2d(W, H);
    const [rc, rg] = canvas2d(W >> 1, H >> 1);   // roughness: the mat is matte, the finish less so
    const r = rng(1931);
    const planks = 5, ph = H / planks;
    for (let p = 0; p < planks; p++){
      const y0 = p * ph;
      const L = 30 + r() * 7, hue = 24 + r() * 6;
      g.fillStyle = `hsl(${hue} 38% ${L}%)`; g.fillRect(0, y0, W, ph);
      // long, slightly wandering grain with the odd cathedral arch
      for (let i = 0; i < 140; i++){
        const y = y0 + r() * ph, amp = 2 + r() * 5, f = 0.002 + r() * 0.004, ph0 = r() * 6;
        g.strokeStyle = r() < 0.5 ? `rgba(30,16,6,${0.05 + r()*0.12})` : `rgba(255,215,160,${0.02 + r()*0.05})`;
        g.lineWidth = 0.6 + r() * 2.4;
        g.beginPath();
        for (let x = 0; x <= W; x += 24){
          const yy = y + Math.sin(x * f + ph0) * amp;
          if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
        }
        g.stroke();
      }
      for (let k = 0; k < 2; k++){             // knots
        const kx = r() * W, ky = y0 + ph * (0.25 + r() * 0.5);
        for (let ring = 7; ring > 0; ring--){
          g.strokeStyle = `rgba(25,12,4,${0.10 + (7-ring)*0.03})`; g.lineWidth = 1.4;
          g.beginPath(); g.ellipse(kx, ky, ring * 9, ring * 3.2, 0, 0, Math.PI * 2); g.stroke();
        }
      }
      // seam: a dark hairline with a soft bevel highlight above it
      g.fillStyle = 'rgba(18,9,3,0.55)'; g.fillRect(0, y0 - 1.5, W, 3);
      g.fillStyle = 'rgba(255,220,170,0.08)'; g.fillRect(0, y0 + 1.5, W, 2);
    }
    rg.fillStyle = '#8c8c8c'; rg.fillRect(0, 0, rc.width, rc.height);   // satin oil finish
    const [ec, eg] = canvas2d(1024, 709);       // the planks alone, for the table's edges
    eg.drawImage(c, 0, 0, ec.width, ec.height);

    // the cutting mat: sage green, grid every 1 cm, heavier every 5, ruler along two edges
    const mm = W / 1300;
    const mw = 450 * mm, mh = 320 * mm, mx = (W - mw) / 2 - 30 * mm, my = (H - mh) / 2 + 40 * mm;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 10 * mm; g.shadowOffsetY = 2 * mm;
    g.fillStyle = '#4f7a62';
    g.beginPath(); g.roundRect(mx, my, mw, mh, 8 * mm); g.fill();
    g.restore();
    g.save();
    g.beginPath(); g.roundRect(mx, my, mw, mh, 8 * mm); g.clip();
    const sheen = g.createLinearGradient(mx, my, mx + mw, my + mh);
    sheen.addColorStop(0, 'rgba(255,255,255,0.05)'); sheen.addColorStop(1, 'rgba(0,0,0,0.08)');
    g.fillStyle = sheen; g.fillRect(mx, my, mw, mh);
    const inset = 16 * mm;
    for (let i = 0; i * 10 * mm <= mw - 2 * inset + 0.5; i++){
      const x = mx + inset + i * 10 * mm;
      g.strokeStyle = i % 5 ? 'rgba(225,240,228,0.07)' : 'rgba(235,248,238,0.22)';
      g.lineWidth = i % 5 ? 1 : 1.6;
      g.beginPath(); g.moveTo(x, my + inset); g.lineTo(x, my + mh - inset); g.stroke();
      if (i % 5 === 0){ g.fillStyle = 'rgba(235,248,238,0.6)'; g.font = `${5 * mm}px ui-monospace,monospace`;
        g.textAlign = 'center'; g.fillText(String(i), x, my + inset - 5 * mm); }
      if (x > mx + mw - 120 * mm) continue;   // leave room for the maker's mark
      g.strokeStyle = 'rgba(235,248,238,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, my + mh - 4 * mm); g.lineTo(x, my + mh - (i % 5 ? 8 : 13) * mm); g.stroke();
    }
    for (let j = 0; j * 10 * mm <= mh - 2 * inset + 0.5; j++){
      const y = my + inset + j * 10 * mm;
      g.strokeStyle = j % 5 ? 'rgba(225,240,228,0.07)' : 'rgba(235,248,238,0.22)';
      g.lineWidth = j % 5 ? 1 : 1.6;
      g.beginPath(); g.moveTo(mx + inset, y); g.lineTo(mx + mw - inset, y); g.stroke();
    }
    g.strokeStyle = 'rgba(235,248,238,0.2)'; g.lineWidth = 1.2;     // the 45° and 60° cutting guides
    g.beginPath(); g.moveTo(mx + inset, my + mh - inset); g.lineTo(mx + inset + (mh - 2*inset), my + inset); g.stroke();
    g.beginPath(); g.moveTo(mx + mw - inset, my + mh - inset);
    g.lineTo(mx + mw - inset - (mh - 2*inset) / Math.tan(Math.PI/3), my + inset); g.stroke();
    for (let i = 0; i < 26; i++){             // old knife scores
      const x = mx + r() * mw, y = my + r() * mh, a = (r() < 0.5 ? 0 : Math.PI/2) + (r()-0.5)*0.3, l = (20 + r()*90) * mm;
      g.strokeStyle = `rgba(20,40,28,${0.15 + r()*0.2})`; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a)*l, y + Math.sin(a)*l); g.stroke();
    }
    g.fillStyle = 'rgba(235,248,238,0.5)'; g.font = `italic ${6 * mm}px ui-serif,Georgia,serif`;
    g.textAlign = 'right'; g.fillText('leanto · self-healing', mx + mw - inset, my + mh - 5 * mm);
    g.restore();
    rg.fillStyle = '#e0e0e0';
    rg.beginPath(); rg.roundRect(mx/2, my/2, mw/2, mh/2, 4 * mm); rg.fill();

    // soft rim darkening: a century of hands on the middle, dust at the edges
    const vig = g.createRadialGradient(W/2, H/2, H*0.42, W/2, H/2, W*0.66);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(15,7,2,0.38)');
    g.fillStyle = vig; g.fillRect(0, 0, W, H);

    const map = tex(c, true, 4), rough = tex(rc, false, 1), edge = tex(ec, true, 1);
    return { map, rough, edge };
  }
  const TW = 1.3, TD = 0.9, TT = 0.06;
  const tableTex = makeTableTextures();
  // The box carries plain planks (its UVs squeeze the whole texture onto each thin
  // side); the top is its own plane with the mat painted on, offset to avoid z-fighting.
  const tableMesh = new THREE.Mesh(new RoundedBoxGeometry(TW, TT, TD, 4, 0.014),
    new THREE.MeshStandardMaterial({ map: tableTex.edge, roughness: 0.7, metalness: 0, envMapIntensity: 0.55 }));
  tableMesh.position.y = -TT/2;            // top surface sits at y = 0
  tableMesh.receiveShadow = true; tableMesh.castShadow = true;
  scene.add(tableMesh);
  const R = 0.014;
  const tableTop = new THREE.Mesh(new THREE.PlaneGeometry(TW - 2*R, TD - 2*R),
    new THREE.MeshStandardMaterial({ map: tableTex.map, roughnessMap: tableTex.rough, roughness: 0.78,
      metalness: 0, envMapIntensity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  tableTop.rotation.x = -Math.PI/2;
  tableTop.receiveShadow = true;
  tableTop.raycast = () => {};             // picking keeps using the table box underneath
  scene.add(tableTop);
  const tableBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -TT/2, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(TW/2, TT/2, TD/2).setFriction(0.95).setRestitution(0.0),
    tableBody
  );

  // ---------- the room under and around the table: legs, a rug, floorboards ----------
  const FLOOR_Y = -0.76;
  const legMat = new THREE.MeshLambertMaterial({ color: '#4a2f1c' });   // the room is lit cheaply: it lives in the haze
  const legGeo = new RoundedBoxGeometry(0.055, -FLOOR_Y - TT, 0.055, 2, 0.008);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(sx * (TW/2 - 0.07), (FLOOR_Y - TT) / 2, sz * (TD/2 - 0.07));
    leg.castShadow = true; scene.add(leg);
  }
  for (const [w, d, x, z] of [[TW - 0.14, 0.02, 0, TD/2 - 0.07], [TW - 0.14, 0.02, 0, -(TD/2 - 0.07)],
                              [0.02, TD - 0.14, TW/2 - 0.07, 0], [0.02, TD - 0.14, -(TW/2 - 0.07), 0]]){
    const apron = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), legMat);
    apron.position.set(x, -TT - 0.035, z); scene.add(apron);
  }
  function makeFloorTexture(){
    const [c, g] = canvas2d(1024, 1024), r = rng(42);
    const rows = 8, rh = 1024 / rows;
    for (let i = 0; i < rows; i++){
      let x = -r() * 600;
      while (x < 1024){
        const len = 380 + r() * 520;
        g.fillStyle = `hsl(${22 + r()*6} ${30 + r()*8}% ${20 + r()*7}%)`;
        g.fillRect(x, i * rh, len, rh);
        for (let k = 0; k < 14; k++){
          g.strokeStyle = `rgba(10,5,2,${0.08 + r()*0.12})`; g.lineWidth = 0.6 + r() * 1.6;
          const y = i * rh + r() * rh;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r()-0.5)*4); g.stroke();
        }
        g.fillStyle = 'rgba(8,4,1,0.7)'; g.fillRect(x, i * rh, 2, rh);
        x += len;
      }
      g.fillStyle = 'rgba(8,4,1,0.7)'; g.fillRect(0, i * rh, 1024, 2);
    }
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4);
    return t;
  }
  const [fc, fg] = canvas2d(256, 256);         // the floor dissolves into the haze, no hard edge
  const fgr = fg.createRadialGradient(128, 128, 0, 128, 128, 128);
  fgr.addColorStop(0, '#fff'); fgr.addColorStop(0.3, '#fff'); fgr.addColorStop(0.62, '#000');
  fg.fillStyle = fgr; fg.fillRect(0, 0, 256, 256);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64),
    new THREE.MeshLambertMaterial({ map: makeFloorTexture(), alphaMap: tex(fc, false, 1), transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI/2; floor.position.y = FLOOR_Y; floor.renderOrder = -0.5;
  scene.add(floor);
  function makeRugTexture(){
    const [c, g] = canvas2d(1024, 512), r = rng(3);
    const bands = ['#7a4a38', '#a88a66', '#64382b', '#b8a588', '#7d5440', '#566150'];
    g.fillStyle = '#6a3d2e'; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 9; i++){               // concentric woven bands
      const k = i / 9;
      g.strokeStyle = bands[i % bands.length]; g.lineWidth = 9 - i * 0.6;
      g.beginPath(); g.ellipse(512, 256, 500 * (1 - k*0.9), 250 * (1 - k*0.9), 0, 0, Math.PI*2); g.stroke();
    }
    const id = g.getImageData(0, 0, 1024, 512);   // weave noise
    for (let p = 0; p < id.data.length; p += 4){
      const n = (r() - 0.5) * 26 + ((p >> 2) % 3 === 0 ? 6 : 0);
      id.data[p] += n; id.data[p+1] += n; id.data[p+2] += n;
    }
    g.putImageData(id, 0, 0);
    return tex(c);
  }
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 72),
    new THREE.MeshLambertMaterial({ map: makeRugTexture() }));
  rug.scale.set(1.15, 0.85, 1); rug.rotation.x = -Math.PI/2; rug.position.y = FLOOR_Y + 0.002;
  scene.add(rug);
  // contact shadow: the table's own soft shadow on the rug (painted, not traced)
  const [sc, sg] = canvas2d(256, 256);
  const sgr = sg.createRadialGradient(128, 128, 20, 128, 128, 128);
  sgr.addColorStop(0, 'rgba(0,0,0,0.65)'); sgr.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = sgr; sg.fillRect(0, 0, 256, 256);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(TW * 1.5, TD * 1.6),
    new THREE.MeshBasicMaterial({ map: tex(sc), transparent: true, depthWrite: false }));
  under.rotation.x = -Math.PI/2; under.position.y = FLOOR_Y + 0.004; under.renderOrder = 1;
  scene.add(under);
  // the floor is solid: a stick knocked off the table lands on it instead of falling forever
  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, FLOOR_Y - 0.05, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(4, 0.05, 4).setFriction(0.9), floorBody);

  // ---------- daylight dial: golden afternoon ⟷ lamp-lit evening ----------
  const C = (h) => new THREE.Color(h);
  const DAY = {
    skyTop: C('#f2e4cd'), skyHor: C('#ecd0aa'), skyBot: C('#d9b994'), glow: C('#ffd9a0'), glowAmt: 1,
    envTop: C('#f6ead8'), envBot: C('#6e5440'),
    hemi: 0.35, hemiCol: C('#fff3e2'), ground: C('#4a3626'),
    key: 7.0, keyCol: C('#ffe6c2'), keyAngle: 0.36,
    fill: 0.32, fillCol: C('#d9e4ff'), rim: 0.0,
    exp: 1.0, fog: C('#ecd6b6'),
  };
  const NIGHT = {
    skyTop: C('#17120e'), skyHor: C('#2e2218'), skyBot: C('#20170f'), glow: C('#ff9d4a'), glowAmt: 0.35,
    envTop: C('#4a3a2a'), envBot: C('#1a120c'),
    hemi: 0.12, hemiCol: C('#ffcf96'), ground: C('#1a120b'),
    key: 6.0, keyCol: C('#ffd3a3'), keyAngle: 0.26,
    fill: 0.06, fillCol: C('#56679a'), rim: 0.55,
    exp: 0.9, fog: C('#241b13'),
  };
  const lerpC = (k, out) => out.lerpColors(DAY[k], NIGHT[k], ctx.daylight);
  scene.fog = new THREE.Fog('#ecd6b6', 1.6, 4.8);      // the room melts into warm haze
  const keyBase = (t) => THREE.MathUtils.lerp(DAY.key, NIGHT.key, t ?? ctx.daylight ?? 0);
  let cookieNight = -1, envAt = -1;
  function setDaylight(t){                              // t: 0 = day, 1 = night
    ctx.daylight = t;
    lerpC('skyTop', skyU.top.value); lerpC('skyHor', skyU.horizon.value);
    lerpC('skyBot', skyU.bottom.value); lerpC('glow', skyU.glowCol.value);
    skyU.glow.value = THREE.MathUtils.lerp(DAY.glowAmt, NIGHT.glowAmt, t);
    hemi.intensity = THREE.MathUtils.lerp(DAY.hemi, NIGHT.hemi, t);
    lerpC('hemiCol', hemi.color); lerpC('ground', hemi.groundColor);
    key.intensity = keyBase(t);
    lerpC('keyCol', key.color);
    key.angle = THREE.MathUtils.lerp(DAY.keyAngle, NIGHT.keyAngle, t);
    // evening: the light comes from a desk lamp just above the table's far corner
    key.position.lerpVectors(KEY_POS, new THREE.Vector3(0.35, 1.25, -0.55), t);
    fill.intensity = THREE.MathUtils.lerp(DAY.fill, NIGHT.fill, t);
    lerpC('fillCol', fill.color);
    rim.intensity = THREE.MathUtils.lerp(DAY.rim, NIGHT.rim, t);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(DAY.exp, NIGHT.exp, t);
    lerpC('fog', scene.fog.color);
    const n = Math.round(t * 20) / 20;                  // repaint the cookie in 5% steps
    if (n !== cookieNight){ cookieNight = n; paintCookie(n); }
    if (Math.abs(t - envAt) > 0.04 || t === 0 || t === 1){
      envAt = t; lerpC('envTop', envU.top.value); lerpC('envBot', envU.bottom.value);
      envWindow.material.color.setScalar(THREE.MathUtils.lerp(3.2, 0.6, t));
      bakeEnvironment();
    }
    const d = key.position.distanceTo(key.target.position);     // keep the shadow frustum hugging the table
    key.shadow.camera.near = Math.max(0.2, d - 1.3); key.shadow.camera.far = d + 1.5;
    key.shadow.camera.updateProjectionMatrix();
    document.documentElement.style.setProperty('--dusk', t.toFixed(2));
  }
  setDaylight(0);

  // the dial: a labelled slider between a sun and a moon, styled in index.html
  const dialWrap = document.createElement('label');
  dialWrap.className = 'daylight';
  dialWrap.title = 'Daylight: afternoon to evening';
  dialWrap.innerHTML = '<span class="sr-only">Daylight</span><span class="sun" aria-hidden="true">☀</span>' +
    '<input id="daylight" type="range" min="0" max="1" step="0.01" value="0">' +
    '<span class="moon" aria-hidden="true">☾</span>';
  const dial = dialWrap.querySelector('input');
  dial.addEventListener('input', () => setDaylight(parseFloat(dial.value)));
  (document.getElementById('workbench') || document.body).appendChild(dialWrap);

  addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  ctx.scene = scene;
  ctx.camera = camera;
  ctx.renderer = renderer;
  ctx.controls = controls;
  ctx.keyLight = key;
  ctx.keyBase = keyBase;
  ctx.fillLight = fill;
  ctx.hemiLight = hemi;
  ctx.tableMesh = tableMesh;
  ctx.tableBody = tableBody;
  ctx.TABLE = { TW, TD, TT };
  ctx.setDaylight = setDaylight;
  ctx.daylightDial = dialWrap;
}
