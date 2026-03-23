// content.js v6.1 — Mirra
// 修复：同步读取选区（不用 rAF），加完整诊断日志

const PAGE_KEY = 'mirra_pins_aistudio';
let pinsCache = {};
let pending = null;
let toolbarVisible = false;

async function init() {
  try {
    const r = await chrome.storage.local.get(PAGE_KEY);
    pinsCache = r[PAGE_KEY] || {};
    console.log('[Mirra] init, 已有 pins:', Object.keys(pinsCache).length);
  } catch(e) {
    console.error('[Mirra] init 读取 storage 失败:', e);
    if (e.message && e.message.includes('Extension context invalidated')) {
      showContextInvalidated();
      return;
    }
    pinsCache = {};
  }

  injectStyles();
  buildUI();
  restoreHighlights();

  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousedown', onDocMouseDown);

  // 监听 sidepanel 发来的清空指令
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'CLEAR_PINS') {
      // 清空内存缓存，移除页面高亮
      Object.keys(pinsCache).forEach(() => {});
      for (const key in pinsCache) delete pinsCache[key];
      document.querySelectorAll('.mirra-hl').forEach(el => {
        el.outerHTML = el.innerHTML;
      });
      document.querySelectorAll('.mirra-block-hl').forEach(el => {
        el.classList.remove('mirra-block-hl');
        delete el.dataset.mirraId;
      });
      console.log('[Mirra] pinsCache 已清空');
    }
  });
}

// ── UI ───────────────────────────────────────────────────
let toolbar, annoBox;

function buildUI() {
  // 防止重复创建
  document.getElementById('mirra-bar')?.remove();
  document.getElementById('mirra-anno')?.remove();

  toolbar = document.createElement('div');
  toolbar.id = 'mirra-bar';
  toolbar.innerHTML = `
    <button id="mirra-pin">📌 钉选</button>
    <div class="msep"></div>
    <button id="mirra-note">✍️ 批注</button>
  `;
  document.body.appendChild(toolbar);

  document.getElementById('mirra-pin').addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
  });
  document.getElementById('mirra-pin').addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[Mirra] 钉选按钮点击, pending:', pending?.text?.slice(0,20));
    if (!pending) {
      console.warn('[Mirra] pending 为空，忽略');
      hideAll();
      return;
    }
    const text = pending.text;
    const role = pending.role;
    pending = null;
    hideAll();
    doSave(text, role, '');
  });

  document.getElementById('mirra-note').addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
  });
  document.getElementById('mirra-note').addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (!pending) { hideAll(); return; }
    toolbar.style.display = 'none';
    toolbarVisible = false;
    showAnnoBox();
  });

  annoBox = document.createElement('div');
  annoBox.id = 'mirra-anno';
  annoBox.innerHTML = `
    <div class="ma-title">✍️ 加入你的批注</div>
    <textarea id="ma-ta" placeholder="为什么这句话打动了你？"></textarea>
    <div class="ma-btns">
      <button id="ma-cancel">取消</button>
      <button id="ma-save">📌 保存钉选</button>
    </div>`;
  document.body.appendChild(annoBox);

  annoBox.addEventListener('mousedown', e => e.stopPropagation());

  document.getElementById('ma-cancel').addEventListener('click', () => {
    pending = null;
    hideAll();
  });
  document.getElementById('ma-save').addEventListener('click', () => {
    const note = document.getElementById('ma-ta').value.trim();
    if (pending) {
      const text = pending.text;
      const role = pending.role;
      pending = null;
      doSave(text, role, note);
    }
    document.getElementById('ma-ta').value = '';
    hideAll();
  });
}

function showAnnoBox() {
  const tb = toolbar.getBoundingClientRect();
  annoBox.style.top  = (tb.bottom + window.scrollY + 8) + 'px';
  annoBox.style.left = Math.max(8, Math.min(tb.left, window.innerWidth - 272)) + 'px';
  annoBox.style.display = 'block';
  setTimeout(() => document.getElementById('ma-ta')?.focus(), 30);
}

function hideAll() {
  if (toolbar) toolbar.style.display = 'none';
  if (annoBox) annoBox.style.display = 'none';
  toolbarVisible = false;
}

// ── 划词（同步读取，不用 rAF）────────────────────────────
function onMouseUp(e) {
  if (toolbar?.contains(e.target) || annoBox?.contains(e.target)) return;

  // 同步立刻读取选区，不推迟
  const sel = window.getSelection();
  const text = sel?.toString().trim() || '';

  if (!text || text.length < 5 || isNoise(text)) {
    return; // 不关闭工具条，让 mousedown 来负责关闭
  }

  let role = 'ai';
  try {
    const range = sel.getRangeAt(0);
    const node  = range.commonAncestorContainer;
    const el    = node.nodeType === 3 ? node.parentElement : node;
    const turn  = el.closest?.('ms-chat-turn');
    if (turn) role = detectRole(turn);
  } catch(e) {}

  pending = { text, role };
  console.log('[Mirra] 选中文字，pending 已设置:', text.slice(0,30), '| role:', role);

  // 定位工具条
  try {
    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();
    const barW  = 170;
    toolbar.style.left = Math.max(8, Math.min(
      rect.left + rect.width / 2 - barW / 2,
      window.innerWidth - barW - 8
    )) + 'px';
    toolbar.style.top = Math.max(8, rect.top + window.scrollY - 46) + 'px';
  } catch(e) {
    toolbar.style.left = '20px';
    toolbar.style.top  = '80px';
  }

  toolbar.style.display = 'flex';
  toolbarVisible = true;
}

function onDocMouseDown(e) {
  if (toolbar?.contains(e.target) || annoBox?.contains(e.target)) return;
  if (toolbarVisible) {
    // 给 click 事件留足够时间执行（200ms）
    setTimeout(() => hideAll(), 200);
  }
}

// ── 保存（核心）──────────────────────────────────────────
async function doSave(text, role, annotation) {
  console.log('[Mirra] doSave 开始:', text.slice(0,30));
  const id = 'pin_' + Date.now() + '_' + hash6(text);
  const pin = { id, text, role, annotation: annotation || '', time: new Date().toISOString() };

  // 每次写入前先从 storage 读最新状态，防止内存缓存过期污染数据
  try {
    const latest = await chrome.storage.local.get(PAGE_KEY);
    const fresh = latest[PAGE_KEY] || {};
    // 同步内存缓存：只保留 storage 里实际存在的 pin
    for (const k of Object.keys(pinsCache)) {
      if (!fresh[k]) delete pinsCache[k];
    }
    Object.assign(pinsCache, fresh);
  } catch(e) {}

  pinsCache[id] = pin;

  try {
    await chrome.storage.local.set({ [PAGE_KEY]: pinsCache });
    const verify = await chrome.storage.local.get(PAGE_KEY);
    const count  = Object.keys(verify[PAGE_KEY] || {}).length;
    console.log('[Mirra] ✅ storage 写入成功，当前共', count, '条');
    showToast('📌 已钉选');
  } catch(e) {
    console.error('[Mirra] ❌ storage 写入失败:', e);
    if (e.message && e.message.includes('Extension context invalidated')) {
      showContextInvalidated();
    } else {
      showToast('⚠️ 保存失败: ' + e.message);
    }
    return;
  }

  tryHighlight(text, id, annotation);
  chrome.runtime.sendMessage({ type: 'PIN_UPDATED', pageKey: PAGE_KEY }).catch(() => {});
}

// ── 高亮 ──────────────────────────────────────────────────
function tryHighlight(text, pinId, annotation) {
  const turns = document.querySelectorAll('ms-chat-turn');
  for (const turn of turns) {
    if (!turn.innerText?.includes(text)) continue;
    const walker = document.createTreeWalker(turn, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(text);
      if (idx < 0) continue;
      try {
        const r = document.createRange();
        r.setStart(node, idx);
        r.setEnd(node, idx + text.length);
        const mark = document.createElement('mark');
        mark.className = 'mirra-hl';
        mark.dataset.pinId = pinId;
        mark.title = annotation ? `批注：${annotation}（点击取消）` : '已钉选（点击取消）';
        r.surroundContents(mark);
        mark.addEventListener('click', ev => {
          ev.stopPropagation();
          unpinById(pinId);
          mark.outerHTML = mark.innerHTML;
          showToast('📎 已取消钉选');
        });
        return;
      } catch(err) {
        // 跨节点：块级高亮兜底
        blockHighlight(turn, text, pinId, annotation);
        return;
      }
    }
    // 全文搜索失败：块级高亮整个 turn
    blockHighlight(turn, text, pinId, annotation);
    return;
  }
}

function blockHighlight(container, text, pinId, annotation) {
  const candidates = [...container.querySelectorAll('p, li, div, span')]
    .filter(el => el.children.length === 0 && el.innerText?.includes(text));
  const target = candidates[0] || container;
  target.classList.add('mirra-block-hl');
  target.dataset.mirraId = pinId;
  target.title = (annotation ? `批注：${annotation}\n` : '') + '已钉选（点击取消）';
  target.addEventListener('click', ev => {
    ev.stopPropagation();
    unpinById(pinId);
    target.classList.remove('mirra-block-hl');
    delete target.dataset.mirraId;
    showToast('📎 已取消钉选');
  }, { once: true });
}

function restoreHighlights() {
  Object.values(pinsCache).forEach(pin => {
    if (pin.text) tryHighlight(pin.text, pin.id, pin.annotation);
  });
}

async function unpinById(id) {
  delete pinsCache[id];
  await chrome.storage.local.set({ [PAGE_KEY]: pinsCache }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'PIN_UPDATED', pageKey: PAGE_KEY }).catch(() => {});
}

// ── 工具函数 ──────────────────────────────────────────────
function detectRole(turn) {
  const get = el => (el?.getAttribute?.('data-turn-role') || '').toLowerCase();
  return (get(turn) || get(turn.closest?.('[data-turn-role]')) ||
    get(turn.querySelector?.('[data-turn-role]'))) === 'user' ? 'user' : 'ai';
}

function isNoise(t) {
  const words = ['edit','more_vert','thumb_up','thumb_down','content_copy','share',
    'refresh','close','delete','send','add','search'];
  const s = t.toLowerCase().trim();
  return words.includes(s) || (s.length < 12 && /^[a-z_\s]+$/.test(s));
}

function showContextInvalidated() {
  document.querySelector('.mirra-invalidated')?.remove();
  const el = document.createElement('div');
  el.className = 'mirra-invalidated';
  el.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">🔄 Mirra 插件已更新</div>
    <div style="font-size:12px;opacity:.85;margin-bottom:10px">请刷新页面后继续使用</div>
    <button onclick="location.reload()" style="background:#f0c040;color:#13111f;border:none;border-radius:6px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer">立即刷新</button>
  `;
  document.body.appendChild(el);
}

function showToast(msg) {
  document.querySelector('.mirra-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'mirra-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function hash6(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h).toString(36).slice(0, 6);
}

// ── 样式 ──────────────────────────────────────────────────
function injectStyles() {
  document.getElementById('mirra-styles')?.remove();
  const s = document.createElement('style');
  s.id = 'mirra-styles';
  s.textContent = `
    #mirra-bar {
      display:none; position:absolute; z-index:2147483647;
      background:#13111f; border:1px solid rgba(240,192,64,.6);
      border-radius:9px; padding:5px 8px; gap:4px; align-items:center;
      box-shadow:0 4px 24px rgba(0,0,0,.6);
      animation:mirra-pop .14s cubic-bezier(.34,1.56,.64,1) both;
    }
    #mirra-bar button {
      background:none; border:none; color:#e0e0f0; font-size:12px; font-weight:700;
      padding:4px 10px; border-radius:6px; cursor:pointer; white-space:nowrap;
      font-family:inherit; transition:background .12s,color .12s; user-select:none;
    }
    #mirra-pin:hover  { background:rgba(240,192,64,.18); color:#f0c040; }
    #mirra-note:hover { background:rgba(76,175,128,.18); color:#4caf80; }
    .msep { width:1px; height:16px; background:rgba(255,255,255,.12); flex-shrink:0; }

    #mirra-anno {
      display:none; position:absolute; z-index:2147483646;
      background:#13111f; border:1px solid rgba(255,255,255,.12);
      border-radius:12px; padding:14px; width:264px;
      box-shadow:0 12px 40px rgba(0,0,0,.6);
    }
    .ma-title { font-size:12px; font-weight:700; color:#6666aa; margin-bottom:10px; font-family:inherit; }
    #ma-ta {
      width:100%; background:#0a0916; border:1px solid rgba(255,255,255,.1);
      border-radius:7px; padding:9px; color:#e0e0f0; font-size:12px;
      font-family:inherit; resize:none; height:76px; outline:none;
      line-height:1.55; transition:border-color .15s;
    }
    #ma-ta:focus { border-color:#4caf80; }
    #ma-ta::placeholder { color:#333355; }
    .ma-btns { display:flex; gap:7px; margin-top:9px; justify-content:flex-end; }
    .ma-btns button {
      padding:5px 13px; border-radius:6px; font-size:12px; font-weight:700;
      cursor:pointer; font-family:inherit; border:1px solid; transition:background .12s;
    }
    #ma-cancel { background:transparent; border-color:rgba(255,255,255,.12); color:#6666aa; }
    #ma-cancel:hover { color:#e0e0f0; }
    #ma-save { background:rgba(240,192,64,.14); border-color:rgba(240,192,64,.5); color:#f0c040; }
    #ma-save:hover { background:rgba(240,192,64,.28); }

    .mirra-hl {
      background:rgba(240,192,64,.22)!important; border-bottom:2px solid rgba(240,192,64,.7)!important;
      border-radius:2px!important; cursor:pointer!important; color:inherit!important;
    }
    .mirra-hl:hover { background:rgba(240,192,64,.4)!important; }
    .mirra-block-hl {
      border-left:3px solid rgba(240,192,64,.7)!important;
      background:rgba(240,192,64,.05)!important;
      padding-left:8px!important; cursor:pointer!important;
    }
    .mirra-block-hl:hover { background:rgba(240,192,64,.11)!important; }

    .mirra-toast {
      position:fixed; bottom:30px; left:50%; transform:translateX(-50%);
      background:#13111f; color:#e0e0f8; padding:8px 20px; border-radius:9px;
      font-size:13px; font-family:inherit; z-index:2147483647;
      box-shadow:0 4px 20px rgba(0,0,0,.5); border:1px solid rgba(255,255,255,.1);
      pointer-events:none; animation:mirra-fade .2s ease both;
    }
    @keyframes mirra-pop  { from{opacity:0;transform:translateY(-6px) scale(.95)} to{opacity:1;transform:translateY(0) scale(1)} }
    .mirra-invalidated {
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:#13111f; color:#e0e0f8; padding:16px 20px; border-radius:12px;
      font-size:13px; font-family:inherit; z-index:2147483647;
      box-shadow:0 6px 30px rgba(0,0,0,.6); border:1px solid rgba(240,192,64,.4);
      text-align:center; min-width:200px;
      animation:mirra-pop .2s cubic-bezier(.34,1.56,.64,1) both;
    }
    @keyframes mirra-fade { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  `;
  document.head.appendChild(s);
}

init();
