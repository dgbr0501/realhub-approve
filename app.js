// RealHub Approve — the phone app (see index.html). Rod, 2026-10-17.
const CFG = window.REALHUB_APPROVE || {};
const FN = `${CFG.supabaseUrl}/functions/v1/security`;
const KEY = 'realhub.approve.device';
const app = document.getElementById('app');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const device = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
const focusId = new URLSearchParams(location.search).get('r');
const S = { msg: '', tone: '', busy: false, requests: [], loaded: false, done: {} };

async function call(body) {
  const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', apikey: CFG.publishableKey }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (_) {}
  if (!r.ok) throw new Error(j?.error || `RealHub said ${r.status}.`);
  return j;
}
const keyBytes = (s) => { const b = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(b + '==='.slice((b.length + 3) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };

async function subscribe() {
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await call({ action: 'vapid' });
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const cur = new Uint8Array(sub.options?.applicationServerKey || []);
    const want = keyBytes(publicKey);
    if (cur.length && (cur.length !== want.length || cur.some((x, i) => x !== want[i]))) { await sub.unsubscribe(); sub = null; }
  }
  return sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

function paint() {
  const d = device();
  const msg = S.msg ? `<div class="msg ${S.tone}">${esc(S.msg)}</div>` : '';
  if (!d && iOS && !standalone()) {
    app.innerHTML = `<div class="card"><h2>Add it to your Home Screen first</h2>
      <p class="muted">iPhones send notifications only to apps on the Home Screen.</p>
      <ol><li>Tap <b>Share</b> (the square with the arrow) at the bottom of Safari.</li>
        <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Open <b>Approve</b> from your Home Screen.</li></ol></div>`;
    return;
  }
  if (!d) {
    app.innerHTML = `<div class="card"><h2>Pair with RealHub</h2>
      <p class="muted">On your computer: RealHub › My Settings › Sign-in &amp; Security › <b>+ Pair a phone</b>. Type the code it shows.</p>
      <label for="code">Pairing code</label><input id="code" class="code" maxlength="9" placeholder="ABCD-EFGH" autocomplete="off" autocapitalize="characters">
      <label for="label">This phone's name</label><input id="label" value="iPhone" maxlength="40" style="font-size:16px">
      <button class="go" id="pair" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Pairing…' : 'Turn on notifications &amp; pair'}</button>${msg}</div>`;
    return;
  }
  const list = S.requests.filter((r) => !S.done[r.id]);
  const when = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  app.innerHTML = `${list.map((r) => `<div class="card req ${r.id === focusId ? 'hl' : ''}">
      <h2>${r.purpose === 'unlock' ? 'Unlock RealHub?' : 'Approve RealHub sign-in?'}</h2>
      <div class="what"><b>${esc(r.browser || 'A browser')}</b></div>
      <div class="muted">${esc(when(r.created_at))}${r.ip ? ` · ${esc(r.ip)}` : ''}</div>
      <div class="row"><button class="no" data-deny="${esc(r.id)}">Deny</button><button class="ok" data-approve="${esc(r.id)}">Approve</button></div></div>`).join('')}
    ${Object.entries(S.done).map(([, v]) => `<div class="card"><div class="msg ${v === 'approved' ? 'good' : 'err'}">${v === 'approved' ? '✓ Approved — RealHub is opening on the computer.' : 'Denied. If that wasn\'t you, change your RealHub password.'}</div></div>`).join('')}
    ${!list.length && !Object.keys(S.done).length ? `<div class="card"><h2>All set</h2><p class="muted">${S.loaded ? 'Nothing waiting.' : 'Checking…'} When you sign in to RealHub on a new computer (or once a month), a notification comes here — tap it, then Approve.</p></div>` : ''}
    ${msg}
    <button class="link" id="forget">Unpair this phone</button>`;
}

async function refresh() {
  const d = device(); if (!d) return;
  try { S.requests = (await call({ action: 'pending', device_id: d.device_id, secret: d.secret })).requests || []; S.loaded = true; if (S.tone === 'err' && /reach/.test(S.msg)) S.msg = ''; }
  catch (e) {
    if (/isn't paired/.test(e.message)) { localStorage.removeItem(KEY); S.msg = e.message; S.tone = 'err'; }
    else { S.msg = 'Can\'t reach RealHub right now.'; S.tone = 'err'; }
  }
  paint();
}

app.addEventListener('click', async (e) => {
  const t = e.target.closest('button'); if (!t || t.disabled) return;
  if (t.id === 'pair') {
    const code = document.getElementById('code').value, label = document.getElementById('label').value.trim() || 'iPhone';
    if (code.replace(/[^a-z0-9]/gi, '').length !== 8) { S.msg = 'The code is 8 letters and numbers, like ABCD-EFGH.'; S.tone = 'err'; return paint(); }
    S.busy = true; S.msg = ''; paint();
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Notifications are off. Turn them on in Settings › Notifications › Approve, then try again.');
      const sub = await subscribe();
      const r = await call({ action: 'pair-finish', code, label, subscription: sub.toJSON() });
      localStorage.setItem(KEY, JSON.stringify({ device_id: r.device_id, secret: r.secret, label, endpoint: sub.endpoint }));
      S.msg = 'Paired. You can close this — approvals will come as notifications.'; S.tone = 'good';
    } catch (err) { S.msg = err.message || String(err); S.tone = 'err'; }
    S.busy = false; paint(); refresh();
    return;
  }
  const d = device();
  if (t.dataset.approve || t.dataset.deny) {
    const id = t.dataset.approve || t.dataset.deny;
    t.disabled = true;
    try { await call({ action: 'decide', device_id: d.device_id, secret: d.secret, id, approve: !!t.dataset.approve }); S.done[id] = t.dataset.approve ? 'approved' : 'denied'; S.msg = ''; }
    catch (err) { S.msg = err.message; S.tone = 'err'; }
    return refresh();
  }
  if (t.id === 'forget') {
    if (!confirm('Unpair this phone? Remove it in RealHub › My Settings too.')) return;
    localStorage.removeItem(KEY); S.requests = []; S.msg = ''; paint();
  }
});

/* A new notification address (iOS can change it): tell RealHub. */
async function keepSubscription() {
  const d = device(); if (!d || Notification.permission !== 'granted') return;
  try {
    const sub = await subscribe();
    if (sub.endpoint !== d.endpoint) {
      await call({ action: 'device-update', device_id: d.device_id, secret: d.secret, subscription: sub.toJSON() });
      localStorage.setItem(KEY, JSON.stringify({ ...d, endpoint: sub.endpoint }));
    }
  } catch (_) {}
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
navigator.serviceWorker?.addEventListener('message', () => refresh());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 3000);
paint();
refresh();
keepSubscription();
