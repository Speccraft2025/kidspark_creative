/* Zel XR Viewer — camera-marker AR (v2).
   Start screen → camera → find the K✦ square → the apple pops up on the picture.
   Tracking is smoothed by a follower that eases toward the marker pose and holds it
   briefly when the marker flickers out, so the apple stays calm. */
(() => {
  const $ = s => document.querySelector(s);
  const root = $('#zx'), statusText = $('#zxa-status span'), message = $('#zx-message');
  const reduceMotion = () => root.classList.contains('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const say = t => { message.textContent = t; };

  // Page-specific links (Kidspark copy overrides these with data attributes on #zx).
  const home = root.dataset.home || 'viewer.html', print = root.dataset.print || 'assets/printables/a-is-for-apple-ar.pdf';
  ['#zxa-home', '#zxa-brand', '#zxa-home-link', '#zxa-fallback-home'].forEach(s => { const e = $(s); if (e) e.href = home; });
  ['#zxa-print', '#zxa-print-link', '#zxa-fallback-print'].forEach(s => { const e = $(s); if (e) e.href = print; });

  /* ---------------- sound ---------------- */
  let actx = null, soundOn = true;
  try { soundOn = localStorage.getItem('zx-sound') !== '0'; } catch (e) {}
  const unlockAudio = () => {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {}
    try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
  };
  const tone = (f, t, d, { type = 'sine', gain = .18, to = null } = {}) => {
    const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + .02);
  };
  const sfx = {
    pop() { if (!soundOn || !actx) return; const t = actx.currentTime; tone(420, t, .16, { to: 900, gain: .2 }); tone(1046, t + .1, .32, { type: 'triangle', gain: .09 }); tone(1568, t + .18, .4, { type: 'triangle', gain: .06 }); },
    boing() { if (!soundOn || !actx) return; const t = actx.currentTime; tone(300, t, .22, { to: 520, gain: .16 }); tone(660, t + .05, .18, { type: 'triangle', gain: .05 }); }
  };
  const speak = text => {
    if (!soundOn || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = .86; u.pitch = 1.15; u.lang = 'en-GB';
      const v = speechSynthesis.getVoices().find(v => /en-(GB|KE|ZA|AU|US)/i.test(v.lang) && /female|samantha|karen|serena|moira|google uk english female/i.test(v.name)) || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang));
      if (v) u.voice = v; speechSynthesis.speak(u);
    } catch (e) {}
  };
  const sayApple = () => speak('A is for apple! A, a, apple!');

  /* ---------------- tracking smoother ---------------- */
  AFRAME.registerComponent('zx-follow', {
    schema: { target: { type: 'selector' }, hold: { default: 900 } },
    init() {
      this.p = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3();
      this.has = false; this.lastSeen = -1e9; this.shown = false;
      this.el.object3D.visible = false; this.el.object3D.matrixAutoUpdate = true;
    },
    tick(t, dt) {
      const m = this.data.target && this.data.target.object3D; if (!m) return;
      const now = performance.now(), o = this.el.object3D;
      if (m.visible) {
        m.updateMatrixWorld(true); m.matrixWorld.decompose(this.p, this.q, this.s);
        const jump = this.has ? o.position.distanceTo(this.p) : Infinity;
        if (!this.has || now - this.lastSeen > this.data.hold || jump > 6) {
          o.position.copy(this.p); o.quaternion.copy(this.q); o.scale.copy(this.s); this.has = true;
        } else {
          // Frame-rate independent easing; quicker when the page really moves, softer for jitter.
          const k = 1 - Math.exp(-(dt || 16) / (jump > .35 ? 45 : 90));
          o.position.lerp(this.p, k); o.quaternion.slerp(this.q, k); o.scale.lerp(this.s, k);
        }
        this.lastSeen = now;
      }
      const visible = this.has && now - this.lastSeen < this.data.hold;
      if (visible !== this.shown) { this.shown = visible; o.visible = visible; this.el.emit(visible ? 'zx-found' : 'zx-lost'); }
    }
  });

  /* ---------------- the object ---------------- */
  const ease = t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2); // gentle overshoot
  AFRAME.registerComponent('zx-object', {
    schema: { src: { type: 'string' }, height: { type: 'number', default: 1.55 } },
    init() {
      this.model = this.el.querySelector('#zxa-model');
      this.model.setAttribute('gltf-model', `url(${this.data.src})`);
      this.yaw = 0; this.user = 1; this.pop = 0; this.popStart = -1; this.spin = false; this.bounceStart = -1;
      this.el.object3D.scale.setScalar(0.0001);
      this.model.addEventListener('model-loaded', () => this.fit());
      this.addShadow(); this.addLook(); this.addBurst(); this.bindGestures();
    },
    fit() {
      const mesh = this.model.getObject3D('mesh'); if (!mesh) return;
      mesh.position.set(0, 0, 0); mesh.scale.setScalar(1); mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      box.applyMatrix4(new THREE.Matrix4().copy(this.model.object3D.matrixWorld).invert());
      const size = box.getSize(new THREE.Vector3()), s = this.data.height / Math.max(size.y, 1e-6);
      mesh.scale.setScalar(s);
      mesh.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
      mesh.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      this.width = Math.max(size.x, size.z) * s;
      this.shadow.scale.set(this.width * 1.3, this.width * 1.3, 1);
      this.el.emit('zx-ready');
    },
    addShadow() {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
      grd.addColorStop(0, 'rgba(20,12,8,0.62)'); grd.addColorStop(0.38, 'rgba(20,12,8,0.3)'); grd.addColorStop(1, 'rgba(20,12,8,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0 }));
      this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.004; this.shadow.renderOrder = -1;
      this.el.parentNode.object3D.add(this.shadow);
    },
    // Soft studio reflections so the apple's glossy skin and water drops read as real.
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
        const pm = new THREE.PMREMGenerator(r); scene.object3D.environment = pm.fromEquirectangular(tex).texture; pm.dispose();
      };
      if (scene.renderer) go(); else scene.addEventListener('renderstart', go, { once: true });
    },
    addBurst() {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 72), new THREE.MeshBasicMaterial({ color: 0xffcb00, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      g.translate(32, 32); g.fillStyle = '#fff'; g.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? 7 : 30; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill();
      const starTex = new THREE.CanvasTexture(c), cols = [0xffcb00, 0xff9427, 0x51def6, 0xffffff, 0x8bd450];
      this.sparks = Array.from({ length: 14 }, (_, i) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: cols[i % cols.length], transparent: true, opacity: 0, depthWrite: false }));
        const a = (i / 14) * Math.PI * 2 + Math.random() * .4, d = .55 + Math.random() * .55;
        sp.userData = { x: Math.cos(a) * d, z: Math.sin(a) * d, rise: .9 + Math.random() * 1.1, s: .14 + Math.random() * .14, delay: Math.random() * .22 };
        sp.scale.setScalar(.0001); return sp;
      });
      const parent = this.el.parentNode.object3D; this.ring = ring; parent.add(ring); this.sparks.forEach(sp => parent.add(sp));
      this.burstStart = -1;
    },
    burst() { if (!reduceMotion()) this.burstStart = performance.now(); },
    appear() {
      this.burst(); sfx.pop();
      if (reduceMotion()) { this.pop = 1; this.popStart = -1; return; }
      this.popStart = performance.now();
    },
    bounce() { this.bounceStart = reduceMotion() ? -1 : performance.now(); this.burst(); sfx.boing(); sayApple(); },
    reset() { this.yaw = 0; this.user = 1; this.spin = false; },
    hit(clientX, clientY) {
      const scene = this.el.sceneEl, cam = scene.camera, canvas = scene.canvas, mesh = this.model.getObject3D('mesh');
      if (!cam || !canvas || !mesh || !this.el.parentNode.parentNode.object3D.visible) return false;
      const r = canvas.getBoundingClientRect();
      const v = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      // AR.js replaces the projection matrix without refreshing its inverse; raycasting needs both.
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      const rc = new THREE.Raycaster(); rc.setFromCamera(v, cam);
      if (rc.intersectObject(mesh, true).length) return true;
      // Generous target for small fingers: anywhere near the apple's centre on screen counts.
      const c = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()); c.project(cam);
      const px = (c.x + 1) / 2 * r.width + r.left, py = (1 - c.y) / 2 * r.height + r.top;
      return Math.hypot(px - clientX, py - clientY) < Math.min(innerWidth, innerHeight) * .16;
    },
    bindGestures() {
      const scene = this.el.sceneEl; let start = null, lastTap = 0;
      const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      const bind = () => {
        const el = scene.canvas; el.style.touchAction = 'none';
        el.addEventListener('touchstart', e => {
          if (e.touches.length === 1) start = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false, t: Date.now() };
          else if (e.touches.length === 2) start = { d: dist(e.touches), u: this.user, moved: true };
        }, { passive: true });
        el.addEventListener('touchmove', e => {
          if (!start) return;
          if (e.touches.length === 2 && start.d) { this.user = Math.min(1.9, Math.max(0.55, start.u * dist(e.touches) / start.d)); return; }
          if (e.touches.length === 1 && start.x !== undefined) {
            const dx = e.touches[0].clientX - start.x; if (Math.abs(dx) > 4) start.moved = true;
            this.yaw += dx * 0.009; start.x = e.touches[0].clientX; if (start.moved) { this.spin = false; syncSpin(); }
          }
        }, { passive: true });
        el.addEventListener('touchend', e => {
          if (start && !start.moved && e.touches.length === 0) {
            const now = Date.now(), tc = e.changedTouches[0];
            if (now - lastTap < 280) { this.reset(); syncSpin(); say('View reset'); }
            else if (this.hit(tc.clientX, tc.clientY)) this.bounce();
            lastTap = now;
          }
          if (e.touches.length === 0) start = null;
        }, { passive: true });
        // Mouse (desktop webcams). Phones also fire emulated mouse events after a tap; ignore those.
        let m = null, moved = false, lastTouch = 0;
        el.addEventListener('touchstart', () => { lastTouch = Date.now(); }, { passive: true });
        el.addEventListener('mousedown', e => { if (Date.now() - lastTouch < 900) return; m = e.clientX; moved = false; });
        addEventListener('mousemove', e => { if (m === null) return; if (Math.abs(e.clientX - m) > 2) moved = true; this.yaw += (e.clientX - m) * 0.009; m = e.clientX; });
        addEventListener('mouseup', e => { if (m !== null && !moved && this.hit(e.clientX, e.clientY)) this.bounce(); m = null; });
        el.addEventListener('wheel', e => { this.user = Math.min(1.9, Math.max(0.55, this.user * (e.deltaY > 0 ? 0.94 : 1.06))); }, { passive: true });
      };
      if (scene.canvas) bind(); else scene.addEventListener('render-target-loaded', bind, { once: true });
    },
    tick(t, dt) {
      const o = this.el.object3D, now = performance.now();
      if (this.popStart >= 0) { const k = Math.min(1, (now - this.popStart) / 650); this.pop = ease(k); if (k >= 1) { this.popStart = -1; this.pop = 1; } }
      if (this.spin && dt) this.yaw += (dt / 1000) * 0.5;
      this.curYaw = this.curYaw === undefined ? this.yaw : this.curYaw + (this.yaw - this.curYaw) * 0.2;
      this.curUser = this.curUser === undefined ? this.user : this.curUser + (this.user - this.curUser) * 0.2;
      // Squash-and-stretch hop when tapped.
      let sy = 1, sxz = 1, hop = 0;
      if (this.bounceStart >= 0) {
        const k = (now - this.bounceStart) / 700;
        if (k >= 1) this.bounceStart = -1;
        else { const w = Math.sin(k * Math.PI); hop = Math.max(0, Math.sin(k * Math.PI * 1.0)) * .55 * (1 - k * .3); const sq = Math.sin(k * Math.PI * 3) * (1 - k) * .14; sy = 1 + sq; sxz = 1 - sq * .6; }
      }
      // Very slight "alive" breathing once settled.
      const breathe = reduceMotion() ? 0 : Math.sin(now / 900) * .006;
      const s = Math.max(0.0001, this.pop * this.curUser);
      o.rotation.y = this.curYaw;
      o.scale.set(s * sxz * (1 + breathe), s * sy * (1 - breathe), s * sxz * (1 + breathe));
      o.position.y = (1 - Math.min(1, this.pop)) * 0.45 + hop * this.curUser;
      if (this.shadow) { this.shadow.material.opacity = Math.min(1, this.pop) * (1 - hop * .6); this.shadow.scale.setScalar((this.width || 1.5) * 1.3 * this.curUser * (1 - hop * .25)); this.shadow.scale.z = 1; }
      if (this.burstStart >= 0 && this.ring) {
        const k = (now - this.burstStart) / 1000, w = (this.width || 1.5) * this.curUser;
        const rk = Math.min(1, k / .7); this.ring.scale.setScalar(w * (.4 + rk * .95)); this.ring.material.opacity = (1 - rk) * .9;
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

  const pose = () => { const e = $('#zxa-pose'); return e && e.components && e.components['zx-object']; };
  const syncSpin = () => { const p = pose(), on = !!(p && p.spin); document.querySelectorAll('[data-action="rotate"],[data-act="spin"]').forEach(b => b.setAttribute('aria-pressed', String(on))); };

  /* ---------------- flow ---------------- */
  const loading = $('#zxa-loading'), loadingText = $('#zxa-loading-text'), found = $('#zxa-found');
  let started = false, everFound = false, foundTimer, lostTimer;
  const done = () => { if (root.dataset.state !== 'loading') return; root.dataset.state = 'ready'; loading.classList.add('is-out'); setTimeout(() => loading.hidden = true, 500); };
  const fail = () => { root.dataset.state = 'error'; loading.hidden = true; $('#zxa-start').hidden = true; $('#zxa-fallback').hidden = false; };

  function start() {
    if (started) return; started = true; unlockAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext) { fail(); return; }
    root.dataset.state = 'loading'; loading.hidden = false;
    $('#zxa-start').classList.add('is-out'); setTimeout(() => { $('#zxa-start').hidden = true; }, 450);
    document.body.appendChild($('#zxa-scene').content.cloneNode(true));
    const follow = $('#zxa-follow');
    follow.addEventListener('zx-found', () => {
      clearTimeout(lostTimer);
      root.dataset.track = 'locked'; statusText.textContent = 'Page found';
      const p = pose(); if (p) p.appear();
      if (!everFound) {
        everFound = true; found.classList.add('is-on'); clearTimeout(foundTimer); foundTimer = setTimeout(() => found.classList.remove('is-on'), 3200);
        if (navigator.vibrate) navigator.vibrate(18); setTimeout(sayApple, 450);
      }
      say('Drag to turn it, pinch to resize, tap it to hear it');
    });
    follow.addEventListener('zx-lost', () => {
      root.dataset.track = 'lost'; statusText.textContent = 'Hold steady';
      lostTimer = setTimeout(() => { root.dataset.track = 'search'; statusText.textContent = 'Looking for your page'; say('Bring the K✦ square back into view'); }, 900);
    });
    $('#zxa-model').addEventListener('model-loaded', () => { if (document.querySelector('#arjs-video')) done(); });
  }
  $('#zxa-go').addEventListener('click', start);
  if (new URLSearchParams(location.search).has('autostart')) start();

  addEventListener('camera-init', () => { loadingText.textContent = 'Camera ready — getting your apple…'; });
  addEventListener('camera-error', fail);
  // AR.js matches <body> (and so the 3D canvas) to the camera image on resize; nudge it once
  // the video is live so the overlay lines up from the first frame.
  const fitToVideo = () => dispatchEvent(new Event('resize'));
  addEventListener('arjs-video-loaded', () => { setTimeout(fitToVideo, 60); setTimeout(fitToVideo, 600); setTimeout(done, 400); });
  addEventListener('orientationchange', () => setTimeout(fitToVideo, 400));
  setTimeout(function check() { if (root.dataset.state === 'loading') { if (started) done(); else setTimeout(check, 4000); } }, 14000);

  /* ---------------- action bar ---------------- */
  const sndBtn = document.querySelector('[data-act="sound"]');
  const syncSound = () => { sndBtn.setAttribute('aria-pressed', String(soundOn)); sndBtn.setAttribute('aria-label', soundOn ? 'Sound on' : 'Sound off'); };
  syncSound();
  $('#zxa-actions').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return; const p = pose(); unlockAudio();
    if (b.dataset.act === 'say') { if (p) p.bounce(); else sayApple(); }
    if (b.dataset.act === 'spin' && p) { p.spin = !p.spin; syncSpin(); }
    if (b.dataset.act === 'reset' && p) { p.reset(); syncSpin(); say('View reset'); }
    if (b.dataset.act === 'sound') { soundOn = !soundOn; if (!soundOn && 'speechSynthesis' in window) speechSynthesis.cancel(); try { localStorage.setItem('zx-sound', soundOn ? '1' : '0'); } catch (e) {} syncSound(); }
  });

  /* ---------------- controls panel (official viewer pattern) ---------------- */
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
    if (k === 'enter' && root.dataset.state === 'start') start();
    else if (k === 'r') recenter(); else if (k === ' ') { e.preventDefault(); rotate(); } else if (k === 'c') setOpen(!open, open); else if (k === 'escape' && open) setOpen(false, true);
  });
  let sw = null;
  document.addEventListener('touchstart', e => { const t = e.changedTouches[0]; sw = { x: t.clientX, y: t.clientY }; }, { passive: true });
  document.addEventListener('touchend', e => { if (!sw) return; const t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y; if (Math.abs(dy) < 80 && Math.abs(dx) > 70) { if (!open && sw.x > innerWidth - 36 && dx < 0) setOpen(true); else if (open && dx > 0 && sw.x > innerWidth * .45) setOpen(false); } sw = null; }, { passive: true });
})();
