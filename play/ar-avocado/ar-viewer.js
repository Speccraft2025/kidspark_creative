/* Zel XR Viewer — camera-marker AR.
   Any model is fitted the same way the 3D viewer frames it: upright, facing the reader,
   standing on the centre of the printed page at a fixed height. */
(() => {
  const OBJECTS = {
    apple: { name: 'Red Apple', found: 'A is for apple!', page: 'A is for Apple', src: 'assets/Red-Apple-3D.glb', height: 1.55, print: 'assets/printables/a-is-for-apple-ar.pdf', viewer: 'viewer.html?object=apple' },
    avocado: { name: 'Avocado', found: 'Your avocado is here!', page: 'A is for Avocado', src: 'assets/Avocado-3D.glb', height: 1.75, print: 'assets/printables/a-is-for-avocado-ar.pdf', viewer: 'viewer.html?object=avocado' }
  };
  const params = new URLSearchParams(location.search);
  const want = document.querySelector('#zx').dataset.object || params.get('object');
  const key = OBJECTS[want] ? want : 'apple';
  const OBJ = Object.assign({}, OBJECTS[key], JSON.parse(document.querySelector('#zx').dataset.links || '{}'));

  const $ = s => document.querySelector(s);
  const root = $('#zx'), statusText = $('#zxa-status span'), message = $('#zx-message');
  const reduceMotion = () => root.classList.contains('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const say = t => { message.textContent = t; };

  $('#zxa-title').textContent = OBJ.name;
  $('#zxa-found-text').textContent = OBJ.found;
  $('#zxa-guide-title').textContent = `Point at your ${OBJ.page} page`;
  if (OBJ.guide) $('#zxa-guide-text').textContent = OBJ.guide;
  $('#zxa-viewer-link').href = OBJ.viewer;
  $('#zxa-fallback-viewer').href = OBJ.viewer;
  $('#zxa-print-link').href = OBJ.print; $('#zxa-fallback-print').href = OBJ.print;

  const ease = t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2); // gentle overshoot

  AFRAME.registerComponent('zx-object', {
    schema: { height: { type: 'number', default: 1.75 } },
    init() {
      this.model = this.el.querySelector('#zxa-model');
      this.data.height = OBJ.height || this.data.height;
      this.model.setAttribute('gltf-model', `url(${OBJ.src})`);
      this.yaw = 0; this.user = 1; this.pop = 0; this.popStart = -1; this.spin = false;
      this.el.object3D.scale.setScalar(0.0001);
      this.model.addEventListener('model-loaded', () => this.fit());
      this.addShadow();
      this.addLook();
      this.addBurst();
      this.bindGestures();
    },
    // Scale the model to a fixed height, stand it on the page and centre it.
    fit() {
      const mesh = this.model.getObject3D('mesh'); if (!mesh) return;
      mesh.position.set(0, 0, 0); mesh.scale.setScalar(1); mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      box.applyMatrix4(new THREE.Matrix4().copy(this.model.object3D.matrixWorld).invert());
      const size = box.getSize(new THREE.Vector3()), s = this.data.height / Math.max(size.y, 1e-6);
      mesh.scale.setScalar(s);
      mesh.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
      mesh.traverse(o => { if (o.isMesh) { o.frustumCulled = false; } });
      const w = Math.max(size.x, size.z) * s;
      this.shadow.scale.set(w * 1.25, w * 1.25, 1);
      this.el.emit('zx-ready');
    },
    addShadow() {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.45, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(c);
      this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.004; this.shadow.renderOrder = -1;
      this.el.parentNode.object3D.add(this.shadow);
    },
    // Soft studio reflections so glossy skins (apple clearcoat, avocado seed) read as real.
    addLook() {
      const scene = this.el.sceneEl;
      const go = () => {
        const r = scene.renderer; if (!r || scene.object3D.environment) return;
        const c = document.createElement('canvas'); c.width = 256; c.height = 128;
        const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 128);
        grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.45, '#f3efe8'); grd.addColorStop(0.55, '#8d8a86'); grd.addColorStop(1, '#3a3836');
        g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
        g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(40, 18, 60, 22); g.fillRect(150, 26, 50, 16);
        const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping;
        if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
        const pm = new THREE.PMREMGenerator(r);
        scene.object3D.environment = pm.fromEquirectangular(tex).texture;
        pm.dispose();
      };
      if (scene.renderer) go(); else scene.addEventListener('renderstart', go, { once: true });
    },
    // A landing ring and a few rising sparkles when the object first appears.
    addBurst() {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0x51def6, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      g.translate(32, 32); g.fillStyle = '#fff'; g.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? 7 : 30; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill();
      const starTex = new THREE.CanvasTexture(c), cols = [0xffcb00, 0xff9427, 0x51def6, 0xffffff, 0x8bd450];
      this.sparks = Array.from({ length: 12 }, (_, i) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: cols[i % cols.length], transparent: true, opacity: 0, depthWrite: false }));
        const a = (i / 12) * Math.PI * 2 + Math.random() * .4, d = .55 + Math.random() * .55;
        sp.userData = { x: Math.cos(a) * d, z: Math.sin(a) * d, rise: .9 + Math.random() * 1.1, s: .16 + Math.random() * .14, delay: Math.random() * .25 };
        sp.scale.setScalar(.001); return sp;
      });
      const parent = this.el.parentNode.object3D;
      this.ring = ring; parent.add(ring); this.sparks.forEach(sp => parent.add(sp));
      this.burstStart = -1;
    },
    appear() {
      if (!reduceMotion()) this.burstStart = performance.now();
      if (reduceMotion()) { this.pop = 1; this.popStart = -1; return; }
      this.popStart = performance.now();
    },
    reset() { this.yaw = 0; this.user = 1; this.spin = false; },
    bindGestures() {
      const scene = this.el.sceneEl; let start = null, lastTap = 0;
      const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      const target = () => scene.canvas || scene;
      const bind = () => {
        const el = target(); el.style.touchAction = 'none';
        el.addEventListener('touchstart', e => {
          if (e.touches.length === 1) start = { x: e.touches[0].clientX, moved: false };
          else if (e.touches.length === 2) start = { d: dist(e.touches), u: this.user, moved: true };
        }, { passive: true });
        el.addEventListener('touchmove', e => {
          if (!start) return;
          if (e.touches.length === 2 && start.d) { this.user = Math.min(1.9, Math.max(0.55, start.u * dist(e.touches) / start.d)); return; }
          if (e.touches.length === 1 && start.x !== undefined) {
            const dx = e.touches[0].clientX - start.x; if (Math.abs(dx) > 3) start.moved = true;
            this.yaw += dx * 0.009; start.x = e.touches[0].clientX; this.spin = false; syncSpin();
          }
        }, { passive: true });
        el.addEventListener('touchend', e => {
          if (start && !start.moved && e.touches.length === 0) { const now = Date.now(); if (now - lastTap < 300) { this.reset(); syncSpin(); say('View reset'); } lastTap = now; }
          if (e.touches.length === 0) start = null;
        }, { passive: true });
        // Mouse (desktop webcams)
        let m = null;
        el.addEventListener('mousedown', e => { m = e.clientX; });
        addEventListener('mousemove', e => { if (m === null) return; this.yaw += (e.clientX - m) * 0.009; m = e.clientX; });
        addEventListener('mouseup', () => { m = null; });
        el.addEventListener('wheel', e => { this.user = Math.min(1.9, Math.max(0.55, this.user * (e.deltaY > 0 ? 0.94 : 1.06))); }, { passive: true });
      };
      if (scene.canvas) bind(); else scene.addEventListener('render-target-loaded', bind, { once: true });
    },
    tick(t, dt) {
      const o = this.el.object3D;
      if (this.popStart >= 0) {
        const k = Math.min(1, (performance.now() - this.popStart) / 620);
        this.pop = ease(k); if (k >= 1) { this.popStart = -1; this.pop = 1; }
      }
      if (this.spin && dt) this.yaw += (dt / 1000) * 0.45;
      // Ease toward the target pose so gestures feel weighted rather than twitchy.
      this.curYaw = this.curYaw === undefined ? this.yaw : this.curYaw + (this.yaw - this.curYaw) * 0.22;
      this.curUser = this.curUser === undefined ? this.user : this.curUser + (this.user - this.curUser) * 0.2;
      o.rotation.y = this.curYaw;
      o.scale.setScalar(Math.max(0.0001, this.pop * this.curUser));
      o.position.y = (1 - Math.min(1, this.pop)) * 0.35;
      if (this.shadow) this.shadow.material.opacity = Math.min(1, this.pop);
      if (this.burstStart >= 0 && this.ring) {
        const k = (performance.now() - this.burstStart) / 1000, w = this.shadow ? this.shadow.scale.x / 1.25 : 1.5;
        const rk = Math.min(1, k / .7); this.ring.scale.setScalar(w * (.35 + rk * .9)); this.ring.material.opacity = (1 - rk) * .85;
        this.sparks.forEach(sp => {
          const u = sp.userData, q = Math.max(0, Math.min(1, (k - u.delay) / .95));
          sp.position.set(u.x * w * (0.6 + q * .5), q * u.rise * w * .9, u.z * w * (0.6 + q * .5));
          sp.scale.setScalar(u.s * w * Math.sin(Math.PI * Math.min(1, q * 1.15)) + .0001);
          sp.material.opacity = q > 0 ? Math.sin(Math.PI * q) : 0; sp.material.rotation = q * 2.5;
        });
        if (k > 1.4) { this.burstStart = -1; this.ring.material.opacity = 0; this.sparks.forEach(sp => { sp.material.opacity = 0; }); }
      }
    }
  });

  const pose = () => $('#zxa-pose').components['zx-object'];
  const syncSpin = () => { const p = pose(); document.querySelector('[data-action="rotate"]').setAttribute('aria-pressed', String(!!(p && p.spin))); };

  // Tracking states: search → found (locked) → lost (brief grace before the guide returns).
  const anchor = $('#zxa-anchor'), found = $('#zxa-found');
  let lostTimer, everFound = false, foundTimer;
  anchor.addEventListener('markerFound', () => {
    clearTimeout(lostTimer);
    const wasSearching = root.dataset.track !== 'lost';
    root.dataset.track = 'locked'; statusText.textContent = 'Page locked';
    if (wasSearching) {
      const p = pose(); if (p) p.appear();
      if (!everFound) { found.classList.add('is-on'); clearTimeout(foundTimer); foundTimer = setTimeout(() => found.classList.remove('is-on'), 2400); if (navigator.vibrate) navigator.vibrate(18); }
      everFound = true; say('Drag to turn it, pinch to resize');
    }
  });
  anchor.addEventListener('markerLost', () => {
    root.dataset.track = 'lost'; statusText.textContent = 'Hold steady';
    lostTimer = setTimeout(() => { root.dataset.track = 'search'; statusText.textContent = 'Looking for the page'; say('Bring the whole page back into view'); }, 1400);
  });

  // Camera lifecycle
  const loading = $('#zxa-loading'), loadingText = $('#zxa-loading-text');
  const done = () => { if (root.dataset.state !== 'loading') return; root.dataset.state = 'ready'; loading.classList.add('is-out'); setTimeout(() => loading.hidden = true, 500); };
  const fail = () => { root.dataset.state = 'error'; loading.hidden = true; $('#zxa-fallback').hidden = false; };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext) fail();
  addEventListener('camera-init', () => { loadingText.textContent = 'Camera ready — loading the object…'; });
  addEventListener('camera-error', fail);
  // AR.js matches <body> (and so the 3D canvas) to the camera image on resize; nudge it once
  // the video is live so the overlay lines up from the first frame.
  const fitToVideo = () => dispatchEvent(new Event('resize'));
  addEventListener('arjs-video-loaded', () => { setTimeout(fitToVideo, 60); setTimeout(fitToVideo, 600); setTimeout(done, 350); });
  addEventListener('orientationchange', () => setTimeout(fitToVideo, 400));
  $('#zxa-model').addEventListener('model-loaded', () => { if (root.dataset.state === 'loading' && document.querySelector('#arjs-video')) done(); });
  setTimeout(() => { if (root.dataset.state === 'loading') done(); }, 12000);

  // Controls panel (official viewer pattern)
  const panel = $('#zx-panel'), reveal = $('#zx-reveal'), settings = $('#zx-settings');
  let open = false;
  const setOpen = (next, focusBack) => {
    open = next; root.classList.toggle('is-open', next); panel.setAttribute('aria-hidden', String(!next)); panel.toggleAttribute('inert', !next); reveal.setAttribute('aria-expanded', String(next));
    if (!next) { settings.hidden = true; if (focusBack) reveal.focus(); }
  };
  reveal.addEventListener('click', () => setOpen(true)); $('#zx-edge').addEventListener('click', () => setOpen(true)); $('#zx-dismiss').addEventListener('click', () => setOpen(false, true));
  const recenter = () => { const p = pose(); if (p) { p.reset(); syncSpin(); } say('View recentered'); };
  const rotate = () => { const p = pose(); if (!p) return; p.spin = !p.spin; syncSpin(); say(p.spin ? 'Auto-rotate on' : 'Auto-rotate off'); };
  $('.zx-tools').addEventListener('click', e => {
    const b = e.target.closest('button[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'recenter') recenter(); if (a === 'rotate') rotate(); if (a === 'hide') setOpen(false, true);
    if (a === 'settings') { settings.hidden = !settings.hidden; b.setAttribute('aria-expanded', String(!settings.hidden)); }
  });
  const motion = $('#zx-motion'), dim = $('#zx-dim');
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  motion.checked = store.get('zx-reduce-motion') === '1'; dim.checked = store.get('zx-dim') === '1';
  const apply = () => { root.classList.toggle('reduced', motion.checked); root.classList.toggle('dim', dim.checked); store.set('zx-reduce-motion', motion.checked ? '1' : '0'); store.set('zx-dim', dim.checked ? '1' : '0'); };
  motion.addEventListener('change', apply); dim.addEventListener('change', apply); apply();
  document.addEventListener('keydown', e => {
    if (e.target.matches('input') || e.metaKey || e.ctrlKey) return; const k = e.key.toLowerCase();
    if (k === 'r') recenter(); else if (k === ' ') { e.preventDefault(); rotate(); } else if (k === 'c') setOpen(!open, open); else if (k === 'escape' && open) setOpen(false, true);
  });
  let sw = null;
  document.addEventListener('touchstart', e => { const t = e.changedTouches[0]; sw = { x: t.clientX, y: t.clientY }; }, { passive: true });
  document.addEventListener('touchend', e => { if (!sw) return; const t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y; if (Math.abs(dy) < 80 && Math.abs(dx) > 70) { if (!open && sw.x > innerWidth - 36 && dx < 0) setOpen(true); else if (open && dx > 0 && sw.x > innerWidth * .45) setOpen(false); } sw = null; }, { passive: true });
})();
