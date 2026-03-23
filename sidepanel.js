// sidepanel.js v4.0 — 渲染新结构：B情感钩子 + C离场包 + A可选框架

// ── 启动 ──────────────────────────────────────────────────
// 用 window.onload 代替 DOMContentLoaded，更晚触发更稳定
window.addEventListener('load', async () => {
  await loadConfig();
  await loadPins();
  bind();
  startPolling();
  // 如果已有历史洞察，显示相关 UI
  try {
    const r = await chrome.storage.local.get('cogpin_asset_library');
    const lib = r['cogpin_asset_library'] || [];
    if (lib.length > 0) {
      const hint = document.getElementById('libraryHint');
      if (hint) hint.classList.add('visible');
      // 如果有缓存的镜像数据，直接渲染
      const mirrorCache = r['mirra_mirror_cache'];
      if (mirrorCache) renderMirror(mirrorCache.data, mirrorCache.sessionCount);
      else checkMirrorEligibility(lib);
    }
  } catch(e) {}
});

// ── 轮询（唯一同步机制，不依赖消息） ──────────────────────
function startPolling() {
  const KEY = 'mirra_pins_aistudio';
  let lastHash = '';

  async function tick() {
    try {
      const r = await chrome.storage.local.get(KEY);
      const pins = r[KEY] || {};
      const hash = Object.keys(pins).sort().join(',');
      if (hash !== lastHash) {
        lastHash = hash;
        const arr = Object.values(pins).sort((a, b) => new Date(a.time) - new Date(b.time));
        renderPins(arr);
        const cntEl = document.getElementById('cnt');
        if (cntEl) cntEl.textContent = arr.length;
      }
    } catch(e) {
      // storage 读取失败时静默忽略
    }
    setTimeout(tick, 400); // 用递归 setTimeout 代替 setInterval，避免堆叠
  }

  tick(); // 立刻执行第一次
}

let pageKey = 'mirra_pins_aistudio';

async function getPageKey() {
  pageKey = 'mirra_pins_aistudio';  // 固定 key，不依赖 URL
}

function bind() {
  document.getElementById('errX').addEventListener('click', hideErr);
  document.getElementById('hAPI').addEventListener('click', () => toggleSec('bAPI', 'cAPI', 'hAPI'));
  document.getElementById('hBask').addEventListener('click', () => { toggleSec('bBask', 'cBask', 'hBask'); loadPins(); });
  document.getElementById('hNote').addEventListener('click', () => toggleSec('bNote', 'cNote', 'hNote'));
  document.getElementById('provider').addEventListener('change', syncProvider);
  document.getElementById('btnSave').addEventListener('click', saveConfig);
  document.getElementById('btnNote').addEventListener('click', saveNote);
  document.getElementById('btnGen').addEventListener('click', generate);
  document.getElementById('btnClr').addEventListener('click', clearAll);
  document.getElementById('libEntryBtn').addEventListener('click', openAssetLibrary);
  document.getElementById('libraryHint').addEventListener('click', openAssetLibrary);
  document.getElementById('hMirror').addEventListener('click', () => toggleSec('bMirror', 'cMirror', 'hMirror'));
}

function toggleSec(bodyId, chvId, hdrId) {
  const body = document.getElementById(bodyId);
  const chv = document.getElementById(chvId);
  const hdr = document.getElementById(hdrId);
  const hiding = !body.classList.contains('hidden');
  body.classList.toggle('hidden', hiding);
  chv.classList.toggle('open', !hiding);
  hdr.classList.toggle('collapsed', hiding);
}

function syncProvider() {
  const p = document.getElementById('provider').value;
  document.getElementById('epRow').style.display = p === 'openai' ? 'block' : 'none';
}

async function saveConfig() {
  const provider = document.getElementById('provider').value;
  const key = document.getElementById('apiKey').value.trim();
  const ep = document.getElementById('apiEp').value.trim();
  if (!key) { showErr('API Key 不能为空'); return; }
  await chrome.storage.local.set({ cogpin_cfg: { provider, key, ep } });
  const btn = document.getElementById('btnSave');
  btn.textContent = '✅ 已保存';
  setTimeout(() => btn.textContent = '💾 保存配置', 1400);
  hideErr();
  // 保存后强制折叠（不管当前展开/收起状态）
  const body = document.getElementById('bAPI');
  if (!body.classList.contains('hidden')) {
    body.classList.add('hidden');
    document.getElementById('cAPI').classList.remove('open');
    document.getElementById('hAPI').classList.add('collapsed');
  }
}

async function loadConfig() {
  const r = await chrome.storage.local.get('cogpin_cfg');
  const c = r.cogpin_cfg; if (!c) return;
  if (c.provider) document.getElementById('provider').value = c.provider;
  if (c.key) document.getElementById('apiKey').value = c.key;
  if (c.ep) document.getElementById('apiEp').value = c.ep;
  syncProvider();
  if (c.key) {
    const body = document.getElementById('bAPI');
    if (!body.classList.contains('hidden')) {
      body.classList.add('hidden');
      document.getElementById('cAPI').classList.remove('open');
      document.getElementById('hAPI').classList.add('collapsed');
    }
  }
}

async function loadPins() {
  if (!pageKey) return;
  const r = await chrome.storage.local.get(pageKey);
  const arr = Object.values(r[pageKey] || {}).sort((a, b) => new Date(a.time) - new Date(b.time));
  document.getElementById('cnt').textContent = arr.length;
  renderPins(arr);
}

function renderPinsFromData(arr) { renderPins(arr); }
function renderPins(arr) {
  const list = document.getElementById('pinList');
  if (!arr.length) {
    list.innerHTML = '<div class="empty"><div class="empty-i">📎</div><div>前往 AI Studio 页面<br>点击「📎 钉选」开始收集</div></div>';
    return;
  }
  list.innerHTML = '';
  arr.forEach(p => {
    const cls = { user: 'u', ai: 'a', note: 'n' }[p.role] || 'a';
    const label = { user: '用户', ai: 'AI', note: '随记' }[p.role] || p.role;
    const time = p.time ? new Date(p.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    const text = p.text || '';
    const long = text.length > 120;
    const div = document.createElement('div');
    div.className = `pin ${cls}`;
    const annotation = p.annotation ? `<div class="pin-anno">💬 ${esc(p.annotation)}</div>` : '';
    div.innerHTML = `
      <div class="pin-meta"><span class="tag">${label}</span><span class="pin-t">${time}</span></div>
      <div class="pin-text${long ? ' clamp' : ''}">${esc(text)}</div>
      ${annotation}
      <div class="pin-row">
        ${long ? '<button class="btn-sm btn-exp">展开全文 ▾</button>' : ''}
        <button class="btn-sm btn-rm">× 移除</button>
      </div>`;
    if (long) {
      const expBtn = div.querySelector('.btn-exp');
      const txtEl = div.querySelector('.pin-text');
      expBtn.addEventListener('click', () => {
        const clamped = txtEl.classList.toggle('clamp');
        expBtn.textContent = clamped ? '展开全文 ▾' : '收起 ▴';
      });
    }
    div.querySelector('.btn-rm').addEventListener('click', () => removePin(p.id));
    list.appendChild(div);
  });
}

async function removePin(id) {
  if (!pageKey) return;
  const r = await chrome.storage.local.get(pageKey);
  const m = r[pageKey] || {};
  delete m[id];
  await chrome.storage.local.set({ [pageKey]: m });
  loadPins();
}

async function saveNote() {
  const text = document.getElementById('noteTA').value.trim();
  if (!text) { showErr('请输入随记内容'); return; }
  if (!pageKey) { showErr('无法获取当前页面'); return; }
  const r = await chrome.storage.local.get(pageKey);
  const m = r[pageKey] || {};
  const id = `note_${Date.now()}`;
  m[id] = { id, text, role: 'note', time: new Date().toISOString() };
  await chrome.storage.local.set({ [pageKey]: m });
  document.getElementById('noteTA').value = '';
  const btn = document.getElementById('btnNote');
  btn.textContent = '✅ 已保存';
  setTimeout(() => btn.textContent = '💾 保存思考', 1400);
  loadPins();
}

async function clearAll() {
  if (!confirm('清空当前所有 Pin 和随记？')) return;
  if (!pageKey) return;
  // 写空对象而非 remove，确保 content.js 读到的是空而非旧缓存
  await chrome.storage.local.set({ [pageKey]: {} });
  document.getElementById('secAssets').style.display = 'none';
  loadPins();
  // 通知 content.js 清空内存缓存
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'CLEAR_PINS' }).catch(() => {});
  });
}

// ── 生成 Mirra 洞察 ───────────────────────────────────────────
async function generate() {
  hideErr();
  const provider = document.getElementById('provider').value;
  const key = document.getElementById('apiKey').value.trim();
  if (!key) { showErr('请先填写并保存 API Key'); return; }
  if (!pageKey) { showErr('无法获取当前页面'); return; }

  const r = await chrome.storage.local.get(pageKey);
  const pins = Object.values(r[pageKey] || {}).sort((a, b) => new Date(a.time) - new Date(b.time));
  if (!pins.length) { showErr('灵感篮子是空的，请先钉选片段'); return; }

  setLoading(true);
  chrome.runtime.sendMessage({
    type: 'GENERATE_ASSETS',
    payload: {
      pins,
      apiKey: key,
      provider,
      customEndpoint: document.getElementById('apiEp').value.trim()
    }
  }, res => {
    setLoading(false);
    if (!res) { showErr('通信失败，请检查扩展状态'); return; }
    if (!res.ok) { showErr(res.error); return; }
    renderAssets(res.assets);
    saveToAssetLibrary(res.assets, pins);
    // 直接显示跳转按钮，不依赖异步
    const hint = document.getElementById('libraryHint');
    if (hint) hint.classList.add('visible');
    // 更新镜像资格
    setTimeout(async () => {
      const r2 = await chrome.storage.local.get('cogpin_asset_library');
      checkMirrorEligibility(r2['cogpin_asset_library'] || []);
    }, 500);
  });
}

// ── 渲染新结构：B + C + A ──────────────────────────────────
function renderAssets(a) {
  const container = document.getElementById('assetsBody');
  container.innerHTML = '';

  // ── B：情感钩子 ──────────────────────────────────────────
  const hook = a.hook || {};
  const hookEl = document.createElement('div');
  hookEl.className = 'asset-block hook-block';
  hookEl.innerHTML = `
    <div class="asset-block-label">🎯 你真正困扰的是什么</div>
    <div class="hook-row surface">
      <div class="hook-badge">表面在问</div>
      <div class="hook-text">${esc(hook.surface_question || '—')}</div>
    </div>
    <div class="hook-arrow">↓</div>
    <div class="hook-row real">
      <div class="hook-badge">实际困扰</div>
      <div class="hook-text">${esc(hook.real_struggle || '—')}</div>
    </div>
    <div class="hook-arrow">↓</div>
    <div class="hook-row shift">
      <div class="hook-badge">这次看见了</div>
      <div class="hook-text">${esc(hook.shift || '—')}</div>
    </div>
  `;
  container.appendChild(hookEl);

  // ── 你是谁在问这个 + 认知偏向 ──────────────────────────────
  const seenText = hook.seen_by || hook.asker_portrait;
  if (seenText) {
    const apEl = document.createElement('div');
    apEl.className = 'asset-block portrait-block';
    const cb = hook.cognitive_bias;
    let modeClass = '';
    if (cb && cb.mode) {
      modeClass = ['执行型','战略型','情绪型','分析型'].includes(cb.mode) ? cb.mode : '分析型';
    }
    apEl.innerHTML =
      '<div class="asset-block-label">✦ 此刻，你是这样的人</div>' +
      '<div class="portrait-text">' + esc(seenText) + '</div>' +
      (cb && cb.mode ? (
        '<div class="bias-bar">' +
          '<div class="bias-mode ' + modeClass + '">' + esc(cb.mode) + '</div>' +
          '<div class="bias-texts">' +
            '<div class="bias-lean">' + esc(cb.lean || '') + '</div>' +
            (cb.alert ? '<div class="bias-alert"><span class="bias-alert-icon">⚠</span>' + esc(cb.alert) + '</div>' : '') +
          '</div>' +
        '</div>'
      ) : '');
    container.appendChild(apEl);
  }

  // ── 信念更新（升级版）───────────────────────────────────
  const bu = a.belief_update || {};
  if (bu.before && bu.after) {
    const buEl = document.createElement('div');
    buEl.className = 'asset-block belief-block';
    buEl.innerHTML = `
      <div class="asset-block-label">⚡ 这次，有什么被撼动了</div>
      <div class="belief-before">
        <div class="b-lbl-old">我曾以为</div>
        <div class="b-txt-old">${esc(bu.before)}</div>
      </div>
      <div class="belief-arrow-row"><span class="b-arrow">↓ 现在我知道</span></div>
      <div class="belief-after">
        <div class="b-txt-new">${esc(bu.after)}</div>
      </div>
      ${bu.why_it_matters ? `<div class="belief-impact"><span class="b-impact-label">这意味着</span>${esc(bu.why_it_matters)}</div>` : ''}
    `;
    container.appendChild(buEl);
  }

  // ── C：离场包 ────────────────────────────────────────────
  const ap = a.action_pack || {};
  const apEl = document.createElement('div');
  apEl.className = 'asset-block action-block';
  apEl.innerHTML = `<div class="asset-block-label">📦 离场包</div>`;

  // 洞见（升级版）
  const insights = ap.insights || ap.beliefs || [];
  if (insights.length) {
    const sec = document.createElement('div');
    sec.className = 'ap-section ap-insights';
    sec.innerHTML = `<div class="ap-sec-label">💎 这次，我真正明白了</div>
      <div class="insights-list">${insights.map((b,i) => `<div class="insight-item"><span class="insight-n">${i+1}</span><span>${esc(b)}</span></div>`).join('')}</div>`;
    apEl.appendChild(sec);
  }

  // 行动
  if (ap.actions?.length) {
    const sec = document.createElement('div');
    sec.className = 'ap-section ap-actions';
    sec.innerHTML = `<div class="ap-sec-label">✅ 接下来我要做的</div>
      <div class="ap-action-list">${ap.actions.map(act =>
        `<div class="ap-action"><span class="ap-when">${esc(act.when || '')}</span><span class="ap-what">${esc(act.what || '')}</span></div>`
      ).join('')}</div>`;
    apEl.appendChild(sec);
  }

  // 开放问题
  if (ap.open_questions?.length) {
    const sec = document.createElement('div');
    sec.className = 'ap-section ap-open';
    sec.innerHTML = `<div class="ap-sec-label">❓ 还没想清楚的</div>
      <ul class="ap-list ap-open-list">${ap.open_questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>`;
    apEl.appendChild(sec);
  }

  // 下次 Prompt（最重要）
  if (ap.next_prompt) {
    const sec = document.createElement('div');
    sec.className = 'ap-section ap-next';
    sec.innerHTML = `
      <div class="ap-sec-label">🧭 带着这些，去开启下一场深度对话</div>
      <div class="next-prompt-box">${esc(ap.next_prompt)}</div>
      <button class="btn-cp-prompt">📋 复制</button>
    `;
    sec.querySelector('.btn-cp-prompt').addEventListener('click', async (e) => {
      await navigator.clipboard.writeText(ap.next_prompt);
      e.target.textContent = '✅ 已复制';
      setTimeout(() => e.target.textContent = '📋 复制', 2000);
    });
    apEl.appendChild(sec);
  }

  container.appendChild(apEl);

  // 框架板块已移除

  document.getElementById('secAssets').style.display = 'block';
  document.getElementById('secAssets').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showErr(msg) { document.getElementById('errMsg').textContent = msg; document.getElementById('err').classList.add('on'); }
function hideErr() { document.getElementById('err').classList.remove('on'); }
let _loadingTimer = null;
function setLoading(on) {
  document.getElementById('ld').classList.toggle('on', on);
  const btn = document.getElementById('btnGen');
  const statusEl = document.getElementById('genStatus');
  btn.disabled = on;
  if (on) {
    btn.textContent = '✦ 正在蒸馏你的认知…';
    const msgs = [
      '🧠 理解你真正在问什么…',
      '🔍 挖掘对话背后的深层困扰…',
      '⚡ 识别这次被撼动的信念…',
      '💎 提炼认知升维的洞见…',
      '🧭 生成你的专属对话起点…'
    ];
    let i = 0;
    if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = msgs[0]; }
    _loadingTimer = setInterval(() => {
      i = (i + 1) % msgs.length;
      if (statusEl) statusEl.textContent = msgs[i];
    }, 2000);
  } else {
    btn.textContent = '✦ 生成 Mirra 洞察';
    clearInterval(_loadingTimer);
    if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
  }
}
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ── 跨会话资产库 ──────────────────────────────────────────
async function saveToAssetLibrary(assets, pins) {
  const LIBRARY_KEY = 'cogpin_asset_library';
  const r = await chrome.storage.local.get(LIBRARY_KEY);
  const library = r[LIBRARY_KEY] || [];
  
  const entry = {
    id: `asset_${Date.now()}`,
    time: new Date().toISOString(),
    pageUrl: (await getCurrentUrl()) || '',
    pageTitle: document.title || '',
    pinCount: pins.length,
    pinTexts: pins.map(p => ({ text: p.text, role: p.role, annotation: p.annotation || '' })),
    assets,
  };
  
  library.unshift(entry); // 最新的放最前
  // 最多保留 50 条
  if (library.length > 50) library.pop();
  
  await chrome.storage.local.set({ [LIBRARY_KEY]: library });
  showLibraryHint();
}

async function getCurrentUrl() {
  return new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, tabs => r(tabs[0]?.url || '')));
}

async function openAssetLibrary() {
  // 打开扩展内置的资产库页面（解决 CSP 问题）
  const url = chrome.runtime.getURL('library.html');
  chrome.tabs.create({ url });
}

function buildLibraryHTML(library) {
  function eh(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── 认知画像区块 ──
  var portraits = library.map(function(e){ return (e.assets&&e.assets.hook&&e.assets.hook.seen_by)||''; }).filter(Boolean);
  var portraitHTML = '';
  if (portraits.length >= 1) {
    portraitHTML += '<div class="profile-block">';
    portraitHTML += '<div class="profile-title">🌱 你的认知画像（持续进化中 · ' + portraits.length + ' 次对话）</div>';
    if (portraits.length === 1) {
      portraitHTML += '<div class="profile-body">' + eh(portraits[0]) + '</div>';
      portraitHTML += '<div class="profile-cta">再积累 2 次对话，Mirra 将开始识别你独有的思维模式，生成专属于你的认知指纹。</div>';
    } else {
      portraits.forEach(function(p,i){
        portraitHTML += '<div class="profile-item"><span class="pi-n">'+(i+1)+'</span><span>'+eh(p)+'</span></div>';
      });
    }
    portraitHTML += '<div class="profile-use"><span class="use-label">这有什么用？</span>随着对话积累，这里将提炼出你独有的思维偏好、决策模式和认知盲区——成为你最了解自己的镜子，也是你与 AI 协作的私人操作系统。</div>';
    portraitHTML += '</div>';
  }

  // ── 每条记录 ──
  var items = library.map(function(entry, idx) {
    var date = new Date(entry.time).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    var hook = (entry.assets&&entry.assets.hook)||{};
    var bu   = (entry.assets&&entry.assets.belief_update)||{};
    var ap   = (entry.assets&&entry.assets.action_pack)||{};
    var pins = entry.pinTexts||[];

    var html = '<div class="entry" id="entry-'+idx+'">';
    html += '<div class="entry-meta">';
    html += '<span class="entry-date">'+date+'</span>';
    html += '<span class="entry-pins">📌 '+entry.pinCount+' 条钉选</span>';
    html += '<span class="entry-title">'+eh((entry.pageTitle||'').slice(0,40))+'</span>';
    // 用 data-idx 替代 onclick
    html += '<button class="entry-toggle" data-idx="'+idx+'">展开全部 ▾</button>';
    html += '</div>';

    if (hook.real_struggle) {
      html += '<div class="entry-real"><span class="real-badge">核心困扰</span>'+eh(hook.real_struggle)+'</div>';
    }
    if (hook.shift) {
      html += '<div class="entry-shift">'+eh(hook.shift)+'</div>';
    }

    // 可展开内容
    html += '<div class="entry-exp" id="expand-'+idx+'">';

    if (hook.seen_by) {
      html += '<div class="exp-sec"><div class="exp-lbl">✦ 此刻，你是这样的人</div>';
      html += '<div class="exp-portrait">'+eh(hook.seen_by)+'</div></div>';
    }

    if (bu.before && bu.after) {
      html += '<div class="exp-sec"><div class="exp-lbl">⚡ 这次，有什么被撼动了</div>';
      html += '<div class="belief-box">';
      html += '<div class="b-old">'+eh(bu.before)+'</div>';
      html += '<div class="b-arr">↓ 现在我知道</div>';
      html += '<div class="b-new">'+eh(bu.after)+'</div>';
      if (bu.why_it_matters) html += '<div class="b-impact">这意味着：'+eh(bu.why_it_matters)+'</div>';
      html += '</div></div>';
    }

    var insights = ap.insights||ap.beliefs||[];
    if (insights.length) {
      html += '<div class="exp-sec"><div class="exp-lbl">💎 认知升维：这次我真正明白了</div>';
      html += '<div class="insights-exp">';
      insights.forEach(function(ins,i){
        html += '<div class="ins-item"><span class="ins-n">'+(i+1)+'</span><span>'+eh(ins)+'</span></div>';
      });
      html += '</div></div>';
    }

    if (ap.actions&&ap.actions.length) {
      html += '<div class="exp-sec"><div class="exp-lbl">🎯 离开屏幕之后——行动清单</div>';
      ap.actions.forEach(function(act){
        html += '<div class="act-item"><span class="act-when">'+eh(act.when||'')+'</span><span>'+eh(act.what||'')+'</span></div>';
      });
      html += '</div>';
    }

    if (ap.open_questions&&ap.open_questions.length) {
      html += '<div class="exp-sec"><div class="exp-lbl">🔭 还没想通的——留给下次对话</div>';
      ap.open_questions.forEach(function(q){
        html += '<div class="open-q">'+eh(q)+'</div>';
      });
      html += '</div>';
    }

    if (pins.length) {
      html += '<div class="exp-sec"><div class="exp-lbl">📌 你钉住的原话</div>';
      pins.forEach(function(p){
        var rl = p.role==='user'?'我':p.role==='note'?'随记':'AI';
        var rc = p.role==='user'?'pin-u':p.role==='note'?'pin-n':'pin-a';
        html += '<div class="pin-item '+rc+'">';
        html += '<span class="pin-role">'+rl+'</span>';
        html += '<span class="pin-content">'+eh(p.text)+'</span>';
        if (p.annotation) html += '<div class="pin-anno-lib">💬 '+eh(p.annotation)+'</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>'; // /exp

    if (ap.next_prompt) {
      html += '<div class="entry-next">';
      html += '<div class="next-label">🧭 带着这些，去开启下一场深度对话</div>';
      html += '<div class="next-sub">这是根据你本次思考定制的对话起点——直接复制，粘贴到 AI Studio 新对话开头</div>';
      html += '<div class="next-text" data-copy="true">'+eh(ap.next_prompt)+'</div>';
      html += '</div>';
    }

    html += '</div>'; // /entry
    return html;
  }).join('');

  // ── 空状态 ──
  if (!library.length) {
    items = '<div class="empty-lib">';
    items += '<div class="el-icon">✦</div>';
    items += '<div class="el-title">你的认知资产库还是空的</div>';
    items += '<div class="el-desc">生成第一份 Mirra 洞察之后，这里将沉淀：<br>';
    items += '· 每次对话中你真正困扰的深层问题<br>';
    items += '· 被这次对话撼动的旧信念，和涌现的新原则<br>';
    items += '· 专属于你的认知画像，随对话次数持续进化<br>';
    items += '· 每次对话定制的「下一场对话起点」，让思考持续复利</div>';
    items += '<div class="el-cta">回到 AI Studio，钉选你觉得有价值的片段，然后点击「✦ 生成 Mirra 洞察」</div>';
    items += '</div>';
  }

  var css = '';
  css += '*{box-sizing:border-box;margin:0;padding:0}\n';
  css += 'body{font-family:"Noto Sans SC",sans-serif;background:#0c0c14;color:#e0e0f0;font-size:14px;line-height:1.7;padding:40px 20px;min-height:100vh}\n';
  css += '.wrap{max-width:740px;margin:0 auto}\n';
  css += 'h1{font-family:"Noto Serif SC",serif;font-size:26px;color:#f0c040;margin-bottom:6px}\n';
  css += '.subtitle{font-size:13px;color:#555570;margin-bottom:32px}\n';
  // 认知画像
  css += '.profile-block{background:linear-gradient(135deg,rgba(96,160,240,.07),rgba(240,192,64,.04));border:1px solid rgba(96,160,240,.22);border-radius:14px;padding:22px 24px;margin-bottom:32px}\n';
  css += '.profile-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#60a0f0;margin-bottom:14px}\n';
  css += '.profile-body{font-size:13px;line-height:1.8;color:#a8c4e0;font-style:italic;margin-bottom:12px}\n';
  css += '.profile-cta{font-size:11px;color:#444466;margin-bottom:12px}\n';
  css += '.profile-item{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:#a8c4e0;font-style:italic;line-height:1.75;margin-bottom:10px}\n';
  css += '.pi-n{width:20px;height:20px;border-radius:50%;background:rgba(96,160,240,.12);border:1px solid rgba(96,160,240,.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#60a0f0;flex-shrink:0;margin-top:2px}\n';
  css += '.profile-use{font-size:12px;color:#5555777;border-top:1px solid rgba(96,160,240,.1);padding-top:12px;margin-top:4px;line-height:1.65}\n';
  css += '.use-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#60a0f0;margin-right:8px}\n';
  // entry
  css += '.entry{background:#14141e;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:22px;margin-bottom:18px}\n';
  css += '.entry:hover{border-color:rgba(240,192,64,.18)}\n';
  css += '.entry-meta{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}\n';
  css += '.entry-date{font-family:"JetBrains Mono",monospace;font-size:11px;color:#555570}\n';
  css += '.entry-pins{font-size:11px;background:rgba(240,192,64,.1);border:1px solid rgba(240,192,64,.3);color:#f0c040;padding:2px 8px;border-radius:4px}\n';
  css += '.entry-title{font-size:12px;color:#6666aa;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n';
  css += '.entry-toggle{background:transparent;border:1px solid rgba(255,255,255,.12);color:#8888aa;font-size:11px;padding:3px 11px;border-radius:4px;cursor:pointer;white-space:nowrap;font-family:inherit;transition:all .15s}\n';
  css += '.entry-toggle:hover{border-color:rgba(240,192,64,.45);color:#f0c040}\n';
  css += '.entry-real{display:flex;gap:10px;align-items:flex-start;background:rgba(232,144,74,.08);border:1px solid rgba(232,144,74,.2);border-radius:8px;padding:12px;margin-bottom:10px;font-size:13px;line-height:1.6}\n';
  css += '.real-badge{font-size:10px;font-weight:700;text-transform:uppercase;background:rgba(232,144,74,.2);color:#e8904a;padding:2px 7px;border-radius:4px;white-space:nowrap;flex-shrink:0;margin-top:2px}\n';
  css += '.entry-shift{font-size:13px;color:#aaaacc;line-height:1.65;margin-bottom:12px;padding-left:12px;border-left:2px solid rgba(255,255,255,.1)}\n';
  // expandable
  css += '.entry-exp{display:none;flex-direction:column;gap:14px;margin-top:14px;border-top:1px solid rgba(255,255,255,.06);padding-top:14px}\n';
  css += '.entry-exp.open{display:flex}\n';
  css += '.exp-sec{}\n';
  css += '.exp-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#555570;margin-bottom:8px}\n';
  css += '.exp-portrait{font-size:13px;color:#90b8e0;font-style:italic;line-height:1.75;background:rgba(96,160,240,.05);border:1px solid rgba(96,160,240,.12);border-radius:8px;padding:12px}\n';
  // belief
  css += '.belief-box{background:#0e0e1a;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:8px}\n';
  css += '.b-old{font-size:12px;color:#555570;text-decoration:line-through;line-height:1.55}\n';
  css += '.b-arr{font-size:11px;font-weight:700;color:#f0c040;text-transform:uppercase;letter-spacing:.06em}\n';
  css += '.b-new{font-size:14px;font-weight:600;color:#e8e8f0;line-height:1.6}\n';
  css += '.b-impact{font-size:12px;color:#8888aa;border-top:1px solid rgba(255,255,255,.06);padding-top:8px;line-height:1.55}\n';
  // insights
  css += '.insights-exp{display:flex;flex-direction:column;gap:8px}\n';
  css += '.ins-item{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.6}\n';
  css += '.ins-n{width:20px;height:20px;border-radius:50%;background:rgba(240,192,64,.1);border:1px solid rgba(240,192,64,.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#f0c040;flex-shrink:0;margin-top:2px}\n';
  // actions
  css += '.act-item{display:flex;gap:8px;align-items:baseline;font-size:13px;margin-bottom:6px;line-height:1.55}\n';
  css += '.act-when{font-family:"JetBrains Mono",monospace;font-size:10px;background:rgba(76,175,128,.12);color:#4caf80;padding:2px 7px;border-radius:4px;white-space:nowrap;flex-shrink:0}\n';
  css += '.open-q{font-size:13px;color:#8888aa;font-style:italic;line-height:1.6;margin-bottom:6px;padding-left:12px;border-left:2px dashed rgba(255,255,255,.1)}\n';
  // pins
  css += '.pin-item{display:flex;gap:8px;align-items:flex-start;font-size:12px;line-height:1.6;padding:8px 10px;border-radius:6px;margin-bottom:6px;background:#0b0b17;border:1px solid rgba(255,255,255,.06)}\n';
  css += '.pin-u{border-left:2px solid #f0c040}.pin-a{border-left:2px solid #60a0f0}.pin-n{border-left:2px solid #4caf80}\n';
  css += '.pin-role{font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;flex-shrink:0;margin-top:2px}\n';
  css += '.pin-u .pin-role{background:rgba(240,192,64,.15);color:#f0c040}.pin-a .pin-role{background:rgba(96,160,240,.12);color:#60a0f0}.pin-n .pin-role{background:rgba(76,175,128,.12);color:#4caf80}\n';
  css += '.pin-content{color:#c0c0d8;flex:1}\n';
  css += '.pin-anno-lib{font-size:11px;color:#4caf80;margin-top:4px;padding-top:4px;border-top:1px solid rgba(76,175,128,.15);width:100%}\n';
  // next prompt（升级版）
  css += '.entry-next{margin-top:16px;border-top:1px solid rgba(255,255,255,.06);padding-top:14px}\n';
  css += '.next-label{font-size:12px;font-weight:700;color:#f0c040;margin-bottom:4px}\n';
  css += '.next-sub{font-size:11px;color:#555570;margin-bottom:8px;line-height:1.5}\n';
  css += '.next-text{font-size:12px;background:#0b0b17;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:12px;color:#c0c0e0;line-height:1.65;cursor:pointer;transition:all .15s;position:relative}\n';
  css += '.next-text:hover{border-color:rgba(240,192,64,.5);background:#0e0c1a}\n';
  css += '.next-text::after{content:"点击复制";position:absolute;bottom:6px;right:8px;font-size:10px;color:#555570;font-family:"JetBrains Mono",monospace}\n';
  css += '.next-text.copied{border-color:rgba(240,192,64,.8);background:rgba(240,192,64,.05)}\n';
  css += '.next-text.copied::after{content:"✓ 已复制";color:#f0c040}\n';
  // 空状态
  css += '.empty-lib{text-align:center;padding:60px 20px}\n';
  css += '.el-icon{font-size:40px;margin-bottom:20px;opacity:.4}\n';
  css += '.el-title{font-size:20px;font-weight:700;color:#8888aa;margin-bottom:16px}\n';
  css += '.el-desc{font-size:13px;color:#555570;line-height:2;margin-bottom:20px;text-align:left;display:inline-block}\n';
  css += '.el-cta{font-size:12px;color:#f0c040;background:rgba(240,192,64,.08);border:1px solid rgba(240,192,64,.25);border-radius:8px;padding:12px 20px;display:inline-block}\n';

  var page = '<!DOCTYPE html>\n';
  page += '<html lang="zh-CN"><head><meta charset="UTF-8"><title>Mirra 资产库</title>\n';
  page += '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">\n';
  page += '<style>' + css + '</style></head><body>\n';
  page += '<div class="wrap">\n';
  page += '<h1>✦ Mirra 资产库</h1>\n';
  page += '<div class="subtitle">共 ' + library.length + ' 次对话 · 点击「下次对话开头」复制 · 点击「展开全部」查看所有内容</div>\n';
  page += portraitHTML;
  page += items;
  page += '</div>\n';
  // 用 addEventListener 替代 inline onclick，彻底规避 CSP
  page += '<script>\n';
  page += 'document.addEventListener("DOMContentLoaded", function() {\n';
  page += '  // 展开/收起\n';
  page += '  document.querySelectorAll(".entry-toggle").forEach(function(btn) {\n';
  page += '    btn.addEventListener("click", function() {\n';
  page += '      var idx = btn.dataset.idx;\n';
  page += '      var exp = document.getElementById("expand-" + idx);\n';
  page += '      var open = exp.classList.toggle("open");\n';
  page += '      btn.textContent = open ? "收起 ▴" : "展开全部 ▾";\n';
  page += '    });\n';
  page += '  });\n';
  page += '  // 复制下次对话开头\n';
  page += '  document.querySelectorAll(".next-text[data-copy]").forEach(function(el) {\n';
  page += '    el.addEventListener("click", function() {\n';
  page += '      navigator.clipboard.writeText(el.textContent.trim()).then(function() {\n';
  page += '        el.classList.add("copied");\n';
  page += '        setTimeout(function(){ el.classList.remove("copied"); }, 2000);\n';
  page += '      });\n';
  page += '    });\n';
  page += '  });\n';
  page += '});\n';
  page += '<\/script></body></html>';
  return page;
}

function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showLibraryHint() {
  const hint = document.getElementById('libraryHint');
  if (hint) {
    hint.classList.add('visible');
    // pulse 动画也给顶部的资产库入口
    const libEntry = document.getElementById('libEntryBtn');
    if (libEntry) {
      libEntry.classList.remove('pulse');
      void libEntry.offsetWidth;
      libEntry.classList.add('pulse');
      setTimeout(() => libEntry.classList.remove('pulse'), 700);
    }
  }
}


// ── 命运镜像 ─────────────────────────────────────────────────

function checkMirrorEligibility(library) {
  const sec = document.getElementById('mirrorSection');
  const inner = document.getElementById('mirrorInner');
  if (!sec || !inner) return;

  if (library.length === 0) return;

  sec.style.display = 'block';

  // 若只有1条，显示触发按钮但提示数据不足
  inner.innerHTML = buildMirrorTrigger(library.length);

  document.getElementById('btnMirror')?.addEventListener('click', () => generateMirror(library));
}

function buildMirrorTrigger(count) {
  const ready = count >= 2;
  const subText = ready
    ? `基于 ${count} 次对话深度分析`
    : `再积累 ${2 - count} 次对话即可解锁`;
  return `
    <div style="padding:12px 13px">
      <button class="mirror-trigger" id="btnMirror" ${ready ? '' : 'disabled'}>
        <div class="mirror-trigger-left">
          <div class="mirror-trigger-title">🪞 生成命运镜像</div>
          <div class="mirror-trigger-sub">${subText}</div>
        </div>
        <div class="mirror-sessions">${count} sessions</div>
      </button>
    </div>`;
}

async function generateMirror(library) {
  const inner = document.getElementById('mirrorInner');
  if (!inner) return;

  inner.innerHTML = '<div class="mirror-loading">analyzing cognitive patterns…</div>';

  const r = await chrome.storage.local.get('cogpin_cfg');
  const cfg = r.cogpin_cfg;
  if (!cfg?.key) {
    inner.innerHTML = '<div class="mirror-err">请先配置 API Key</div>';
    return;
  }

  chrome.runtime.sendMessage({
    type: 'GENERATE_MIRROR',
    payload: {
      history: library,
      apiKey: cfg.key,
      provider: cfg.provider || 'gemini',
      customEndpoint: cfg.ep || ''
    }
  }, res => {
    if (!res || !res.ok) {
      inner.innerHTML =
        '<div class="mirror-err">生成失败：' + ((res && res.error) || '未知错误') + '</div>' +
        '<div style="padding:0 13px 13px"><button class="mirror-trigger" id="btnMirrorRetry">重试</button></div>';
      setTimeout(() => {
        document.getElementById('btnMirrorRetry')?.addEventListener('click', () => generateMirror(library));
      }, 50);
      return;
    }
    // 缓存到 storage
    chrome.storage.local.set({ mirra_mirror_cache: { data: res.mirror, sessionCount: library.length, ts: Date.now() } });
    // 更新按钮状态，然后跳转资产库
    inner.innerHTML = '<div style="padding:14px 13px;text-align:center;color:#4caf80;font-size:12px">✦ 命运镜像已生成，正在打开资产库…</div>';
    setTimeout(() => openAssetLibrary(), 600);
  });
}

function renderMirror(m, sessionCount) {
  const sec = document.getElementById('mirrorSection');
  const inner = document.getElementById('mirrorInner');
  if (!sec || !inner || !m) return;
  sec.style.display = 'block';

  const dna = m.cognitive_dna || [];
  const p2035 = m.parallel_2035 || {};
  const blind = m.blind_spot || {};

  let html = `<div class="mirror-card">`;

  // header
  html += `<div class="mirror-header">
    <div class="mirror-title">The Mirror of Destiny</div>
    <div class="mirror-sessions-badge">${sessionCount} sessions</div>
  </div>`;

  // DNA
  if (dna.length) {
    html += `<div class="mirror-dna">
      <div class="mirror-sec-label">Cognitive DNA</div>`;
    dna.forEach(d => {
      html += `<div class="dna-item">
        <div class="dna-trait">${esc(d.trait || '')}</div>
        <div class="dna-evidence">"${esc(d.evidence || '')}"</div>
        <div class="dna-impact">${esc(d.impact || '')}</div>
      </div>`;
    });
    html += `</div>`;
  }

  // 2035
  if (p2035.trajectory_a || p2035.trajectory_b) {
    html += `<div class="mirror-2035">
      <div class="mirror-sec-label">2035 · 平行时空</div>
      <div class="parallel-tracks">
        <div class="track track-a">
          <div class="track-label">${esc(p2035.trajectory_a?.label || '轨迹 A')}</div>
          <div class="track-scene">${esc(p2035.trajectory_a?.scene || '')}</div>
        </div>
        <div class="track track-b">
          <div class="track-label">${esc(p2035.trajectory_b?.label || '轨迹 B')}</div>
          <div class="track-scene">${esc(p2035.trajectory_b?.scene || '')}</div>
        </div>
      </div>`;
    if (p2035.pivot) {
      html += `<div class="pivot-box">
        <div class="pivot-label">分叉点</div>
        <div class="pivot-text">${esc(p2035.pivot)}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // 盲点
  if (blind.statement) {
    html += `<div class="mirror-blindspot">
      <div class="mirror-sec-label">盲点击穿</div>
      <div class="blindspot-statement">${esc(blind.statement)}</div>
      <div class="blindspot-pattern">${esc(blind.pattern || '')}</div>
      <div class="blindspot-cost"><span class="cost-label">代价</span>${esc(blind.cost || '')}</div>
    </div>`;
  }

  // 重新生成按钮
  html += `<div style="padding:10px 13px;border-top:1px solid rgba(255,255,255,.06)">
    <button class="mirror-trigger" id="btnMirrorRefresh" style="opacity:.5;font-size:11px;padding:7px 13px">
      <div class="mirror-trigger-left"><div class="mirror-trigger-title">↻ 重新分析</div></div>
      <div class="mirror-sessions">${sessionCount} sessions</div>
    </button>
  </div>`;

  html += `</div>`;
  inner.innerHTML = html;

  document.getElementById('btnMirrorRefresh')?.addEventListener('click', async () => {
    const r2 = await chrome.storage.local.get('cogpin_asset_library');
    generateMirror(r2['cogpin_asset_library'] || []);
  });
}
