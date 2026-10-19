const COLORS = {sadness:'#5b8def', joy:'#ffc94a', love:'#ff6b9a', anger:'#ff5a4e', fear:'#9b7cff', surprise:'#3fd8c4'};
const EMOJIS = {sadness:'😢', joy:'😄', love:'❤️', anger:'😠', fear:'😨', surprise:'😲'};
const $ = id => document.getElementById(id);
const input = $('input'), go = $('go'), root = document.documentElement;
const CIRC = 2 * Math.PI * 52;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const history = [];

/* ---------- cursor-trailing light ---------- */
const glow = $('glow');
let gx = innerWidth / 2, gy = innerHeight * .3, tx = gx, ty = gy;
addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; });
(function follow(){ gx += (tx - gx) * .06; gy += (ty - gy) * .06;
  glow.style.left = gx + 'px'; glow.style.top = gy + 'px'; requestAnimationFrame(follow); })();

/* ---------- particle burst (runs only while particles are alive) ---------- */
const cv = $('fx'), ctx = cv.getContext('2d');
let parts = [], running = false;
function fit(){ const d = devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; ctx.setTransform(d,0,0,d,0,0); }
fit(); addEventListener('resize', fit);
function burst(x, y, color) {
  if (reduceMotion) return;
  for (let i = 0; i < 44; i++) {
    const a = Math.random() * Math.PI * 2, v = 1.2 + Math.random() * 4.2;
    parts.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - .6, r: 1.5 + Math.random() * 3, life: 1, color});
  }
  if (!running) { running = true; requestAnimationFrame(tick); }
}
function tick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter(p => p.life > 0);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vx *= .965; p.vy = p.vy * .965 + .05; p.life -= .014;
    ctx.globalAlpha = Math.max(p.life, 0) * .8; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
  }
  if (parts.length) requestAnimationFrame(tick); else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}

/* ---------- input ---------- */
input.addEventListener('input', () => { $('count').textContent = input.value.length; go.disabled = !input.value.trim(); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) analyze(); });
go.addEventListener('click', analyze);
function useText(t) { input.value = t; input.dispatchEvent(new Event('input')); analyze(); }
$('chips').addEventListener('click', e => { if (e.target.tagName === 'BUTTON') useText(e.target.textContent); });
$('hist').addEventListener('click', e => { const b = e.target.closest('button'); if (b) useText(b.dataset.text); });

function countUp(el, to, ms = 1200) {
  const t0 = performance.now();
  (function step(t){ const p = Math.min((t - t0) / ms, 1);
    el.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(1);
    if (p < 1) requestAnimationFrame(step); })(t0);
}

async function analyze() {
  const text = input.value.trim();
  if (!text || go.classList.contains('loading')) return;
  go.classList.add('loading'); go.disabled = true; $('error').hidden = true;
  try {
    const res = await fetch('/predict', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text})});
    if (!res.ok) {
      let msg = 'Something went wrong. Check your text and try again.';
      if (res.status === 503) msg = 'The model is still loading. Try again in a few seconds.';
      else if (res.status === 422) { const j = await res.json().catch(() => ({})); if (typeof j.detail === 'string') msg = j.detail; }
      throw new Error(msg);
    }
    const data = await res.json();
    render(data); remember(text, data);
  } catch (err) {
    $('error').textContent = err instanceof TypeError ? 'Cannot reach the server. Check your connection.' : err.message;
    $('error').hidden = false;
  } finally {
    go.classList.remove('loading'); go.disabled = !input.value.trim();
  }
}

function render(d) {
  const emo = d.predicted_emotion, color = COLORS[emo];
  root.style.setProperty('--c', color);
  $('result').hidden = false;
  $('emotion').textContent = emo;
  const em = $('emoji'); em.textContent = EMOJIS[emo];
  em.classList.remove('pop'); void em.offsetWidth; em.classList.add('pop');

  const arc = $('arc');
  arc.style.transition = 'none'; arc.style.strokeDashoffset = CIRC; void arc.getBoundingClientRect();
  arc.style.transition = ''; arc.style.strokeDashoffset = CIRC * (1 - d.confidence);
  countUp($('conf'), d.confidence * 100);

  const sorted = Object.entries(d.all_probabilites).sort((a, b) => b[1] - a[1]);
  const hint = $('hint');
  if (d.confidence < .5) hint.textContent = 'The model is not very sure about this one. A longer sentence usually helps.';
  else if (sorted[0][1] - sorted[1][1] < .15) hint.textContent = `Close call between ${sorted[0][0]} and ${sorted[1][0]}.`;
  else hint.textContent = '';
  hint.hidden = !hint.textContent;

  const bars = $('bars'); bars.innerHTML = '';
  sorted.forEach(([name, p], i) => {
    const li = document.createElement('li');
    if (i === 0) li.className = 'top';
    li.style.animationDelay = i * 70 + 'ms';
    li.style.setProperty('--bc', COLORS[name]);
    li.innerHTML = `<span class="name">${name}</span><div class="bar"><span></span></div><span class="pct">${(p * 100).toFixed(1)}%</span>`;
    bars.appendChild(li);
    setTimeout(() => li.querySelector('.bar span').style.width = (p * 100) + '%', 120 + i * 70);
  });

  const r = em.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, color);
  $('result').scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block:'nearest'});
}

function remember(text, d) {
  if (history[0] && history[0].text === text) return;
  history.unshift({text, emo: d.predicted_emotion, conf: d.confidence});
  history.length = Math.min(history.length, 5);
  const ul = $('hist'); ul.innerHTML = '';
  history.forEach((h, i) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.dataset.text = h.text; b.style.animationDelay = i * 40 + 'ms';
    b.innerHTML = `<span>${EMOJIS[h.emo]}</span><span class="t"></span><span class="p">${(h.conf * 100).toFixed(0)}%</span>`;
    b.querySelector('.t').textContent = h.text;       // textContent: no HTML injection
    li.appendChild(b); ul.appendChild(li);
  });
  $('history').hidden = false;
}
