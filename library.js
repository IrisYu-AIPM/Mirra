// library.js — Mirra 资产库页面逻辑
// 作为扩展内置页面运行，可以直接访问 chrome.storage

const LIBRARY_KEY = 'cogpin_asset_library';

function eh(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function load() {
  const r = await chrome.storage.local.get(LIBRARY_KEY);
  const library = r[LIBRARY_KEY] || [];

  document.getElementById('subtitle').textContent =
    '共 ' + library.length + ' 次对话 · 点击「下次对话开头」复制 · 点击「展开全部」查看所有内容';

  const container = document.getElementById('content');
  container.innerHTML = '';

  // ── 空状态 ──
  if (!library.length) {
    container.innerHTML = `
      <div class="empty-lib">
        <div class="el-icon">✦</div>
        <div class="el-title">你的认知资产库还是空的</div>
        <div class="el-desc">
          生成第一份 Mirra 洞察之后，这里将沉淀：<br>
          · 每次对话中你真正困扰的深层问题<br>
          · 被这次对话撼动的旧信念，和涌现的新原则<br>
          · 专属于你的认知画像，随对话次数持续进化<br>
          · 每次对话定制的「下一场对话起点」，让思考持续复利
        </div>
        <div class="el-cta">回到 AI Studio，钉选你觉得有价值的片段<br>然后点击「✦ 生成 Mirra 洞察」</div>
      </div>`;
    return;
  }

  // ── 命运镜像 ──
  const mirrorData = await (async () => {
    try {
      const mr = await chrome.storage.local.get('mirra_mirror_cache');
      return mr['mirra_mirror_cache'] || null;
    } catch(e) { return null; }
  })();

  if (mirrorData && mirrorData.data) {
    const m = mirrorData.data;
    const dna = m.cognitive_dna || [];
    const p2035 = m.parallel_2035 || {};
    const blind = m.blind_spot || {};
    const ts = mirrorData.ts ? new Date(mirrorData.ts).toLocaleDateString('zh-CN', {month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';

    let html = '<div class="mirror-block" id="mirrorBlock">';

    // header
    html += '<div class="mirror-hdr">';
    html += '<div class="mirror-hdr-left">';
    html += '<div class="mirror-hdr-title">The Mirror of Destiny</div>';
    html += '<div class="mirror-hdr-meta">基于 ' + (mirrorData.sessionCount || '?') + ' 次对话 · 命运镜像</div>';
    html += '</div>';
    html += '<button class="mirror-regen" id="btnRegen">↻ 重新生成</button>';
    html += '</div>';

    // DNA
    if (dna.length) {
      html += '<div class="mirror-dna">';
      html += '<div class="mirror-sec-lbl">Cognitive DNA</div>';
      dna.forEach(function(d) {
        html += '<div class="dna-item">';
        html += '<div class="dna-trait">' + eh(d.trait || '') + '</div>';
        html += '<div class="dna-evidence">"' + eh(d.evidence || '') + '"</div>';
        html += '<div class="dna-impact">' + eh(d.impact || '') + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // 2035
    if (p2035.trajectory_a || p2035.trajectory_b) {
      html += '<div class="mirror-2035">';
      html += '<div class="mirror-sec-lbl">2035 · 平行时空</div>';
      html += '<div class="parallel-tracks">';
      if (p2035.trajectory_a) {
        html += '<div class="track track-a">';
        html += '<div class="track-label">' + eh(p2035.trajectory_a.label || '顺着现在的惯性') + '</div>';
        html += '<div class="track-scene">' + eh(p2035.trajectory_a.scene || '') + '</div>';
        html += '</div>';
      }
      if (p2035.trajectory_b) {
        html += '<div class="track track-b">';
        html += '<div class="track-label">' + eh(p2035.trajectory_b.label || '如果突破核心盲点') + '</div>';
        html += '<div class="track-scene">' + eh(p2035.trajectory_b.scene || '') + '</div>';
        html += '</div>';
      }
      html += '</div>';
      if (p2035.pivot) {
        html += '<div class="pivot-box">';
        html += '<div class="pivot-label">分叉点</div>';
        html += '<div class="pivot-text">' + eh(p2035.pivot) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    // 盲点
    if (blind.statement) {
      html += '<div class="mirror-blindspot">';
      html += '<div class="mirror-sec-lbl">盲点击穿</div>';
      html += '<div class="blindspot-statement">' + eh(blind.statement) + '</div>';
      if (blind.pattern) html += '<div class="blindspot-pattern">' + eh(blind.pattern) + '</div>';
      if (blind.cost) {
        html += '<div class="blindspot-cost"><span class="cost-lbl">代价</span>' + eh(blind.cost) + '</div>';
      }
      html += '</div>';
    }

    if (ts) html += '<div class="mirror-ts">生成于 ' + ts + '</div>';
    html += '</div>';

    const mirrorEl = document.createElement('div');
    mirrorEl.innerHTML = html;
    container.appendChild(mirrorEl);

    // 重新生成按钮：跳回侧边栏（无法在 library 页直接生成，提示用户）
    document.getElementById('btnRegen')?.addEventListener('click', function() {
      if (confirm('重新生成需要回到侧边栏操作。关闭此页面？')) window.close();
    });
  }

  // ── 认知画像 ──
  const portraits = library
    .map(e => e.assets && e.assets.hook && e.assets.hook.seen_by)
    .filter(Boolean);

  if (portraits.length) {
    const pb = document.createElement('div');
    pb.className = 'profile-block';
    let inner = '<div class="profile-title">🌱 你的认知画像（持续进化中 · ' + portraits.length + ' 次对话）</div>';
    if (portraits.length === 1) {
      inner += '<div class="profile-body">' + eh(portraits[0]) + '</div>';
      inner += '<div class="profile-cta">再积累 2 次对话，Mirra 将开始识别你独有的思维模式，生成专属于你的认知指纹。</div>';
    } else {
      portraits.forEach(function(p, i) {
        inner += '<div class="profile-item"><span class="pi-n">' + (i+1) + '</span><span>' + eh(p) + '</span></div>';
      });
    }
    inner += '<div class="profile-use"><span class="use-label">这有什么用？</span>随着对话积累，这里将提炼出你独有的思维偏好、决策模式和认知盲区——成为你最了解自己的镜子，也是你与 AI 协作的私人操作系统。</div>';
    pb.innerHTML = inner;
    container.appendChild(pb);
  }

  // ── 每条记录 ──
  library.forEach(function(entry, idx) {
    const date = new Date(entry.time).toLocaleString('zh-CN', {
      month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'
    });
    const hook = (entry.assets && entry.assets.hook) || {};
    const bu   = (entry.assets && entry.assets.belief_update) || {};
    const ap   = (entry.assets && entry.assets.action_pack) || {};
    const pins = entry.pinTexts || [];

    const entryEl = document.createElement('div');
    entryEl.className = 'entry';

    // meta
    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.innerHTML =
      '<span class="entry-date">' + date + '</span>' +
      '<span class="entry-pins">📌 ' + entry.pinCount + ' 条钉选</span>' +
      '<span class="entry-title">' + eh((entry.pageTitle||'').slice(0,40)) + '</span>';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'entry-toggle';
    toggleBtn.textContent = '展开全部 ▾';
    meta.appendChild(toggleBtn);
    entryEl.appendChild(meta);

    // 常驻内容
    if (hook.real_struggle) {
      const r = document.createElement('div');
      r.className = 'entry-real';
      r.innerHTML = '<span class="real-badge">核心困扰</span>' + eh(hook.real_struggle);
      entryEl.appendChild(r);
    }
    if (hook.shift) {
      const s = document.createElement('div');
      s.className = 'entry-shift';
      s.textContent = hook.shift;
      entryEl.appendChild(s);
    }

    // 可展开区域
    const expEl = document.createElement('div');
    expEl.className = 'entry-exp';

    function addSec(label, html) {
      const sec = document.createElement('div');
      sec.innerHTML = '<div class="exp-lbl">' + label + '</div>' + html;
      expEl.appendChild(sec);
    }

    if (hook.seen_by) {
      addSec('✦ 此刻，你是这样的人',
        '<div class="exp-portrait">' + eh(hook.seen_by) + '</div>');
    }

    if (bu.before && bu.after) {
      let bhtml = '<div class="belief-box">';
      bhtml += '<div class="b-old">' + eh(bu.before) + '</div>';
      bhtml += '<div class="b-arr">↓ 现在我知道</div>';
      bhtml += '<div class="b-new">' + eh(bu.after) + '</div>';
      if (bu.why_it_matters) bhtml += '<div class="b-impact">这意味着：' + eh(bu.why_it_matters) + '</div>';
      bhtml += '</div>';
      addSec('⚡ 这次，有什么被撼动了', bhtml);
    }

    const insights = ap.insights || ap.beliefs || [];
    if (insights.length) {
      let ihtml = '<div class="insights-exp">';
      insights.forEach(function(ins, i) {
        ihtml += '<div class="ins-item"><span class="ins-n">' + (i+1) + '</span><span>' + eh(ins) + '</span></div>';
      });
      ihtml += '</div>';
      addSec('💎 认知升维：这次我真正明白了', ihtml);
    }

    if (ap.actions && ap.actions.length) {
      let ahtml = '';
      ap.actions.forEach(function(act) {
        ahtml += '<div class="act-item"><span class="act-when">' + eh(act.when||'') + '</span><span>' + eh(act.what||'') + '</span></div>';
      });
      addSec('🎯 离开屏幕之后——行动清单', ahtml);
    }

    if (ap.open_questions && ap.open_questions.length) {
      let qhtml = '';
      ap.open_questions.forEach(function(q) {
        qhtml += '<div class="open-q">' + eh(q) + '</div>';
      });
      addSec('🔭 还没想通的——留给下次对话', qhtml);
    }

    if (pins.length) {
      const pinSec = document.createElement('div');
      pinSec.innerHTML = '<div class="exp-lbl">📌 你钉住的原话</div>';

      pins.forEach(function(p) {
        const rl = p.role==='user'?'我':p.role==='note'?'随记':'AI';
        const rc = p.role==='user'?'pin-u':p.role==='note'?'pin-n':'pin-a';
        const LIMIT = 120;
        const isLong = p.text.length > LIMIT;

        const item = document.createElement('div');
        item.className = 'pin-item ' + rc;

        const roleEl = document.createElement('span');
        roleEl.className = 'pin-role';
        roleEl.textContent = rl;
        item.appendChild(roleEl);

        const wrap = document.createElement('div');
        wrap.style.flex = '1';
        wrap.style.minWidth = '0';

        const contentEl = document.createElement('span');
        contentEl.className = 'pin-content' + (isLong ? ' pin-clamp' : '');
        contentEl.textContent = p.text;
        wrap.appendChild(contentEl);

        if (isLong) {
          const expBtn = document.createElement('button');
          expBtn.className = 'pin-exp-btn';
          expBtn.textContent = '展开全文 ▾';
          expBtn.addEventListener('click', function() {
            const expanded = contentEl.classList.toggle('pin-clamp');
            expBtn.textContent = expanded ? '展开全文 ▾' : '收起 ▴';
          });
          wrap.appendChild(expBtn);
        }

        if (p.annotation) {
          const anno = document.createElement('div');
          anno.className = 'pin-anno-lib';
          anno.textContent = '💬 ' + p.annotation;
          wrap.appendChild(anno);
        }

        item.appendChild(wrap);
        pinSec.appendChild(item);
      });

      expEl.appendChild(pinSec);
    }

    entryEl.appendChild(expEl);

    // 展开/收起 事件（直接在 JS 里绑定，不用 inline）
    toggleBtn.addEventListener('click', function() {
      const open = expEl.classList.toggle('open');
      toggleBtn.textContent = open ? '收起 ▴' : '展开全部 ▾';
    });

    // 下次对话开头
    if (ap.next_prompt) {
      const nextDiv = document.createElement('div');
      nextDiv.className = 'entry-next';
      nextDiv.innerHTML =
        '<div class="next-label">🧭 带着这些，去开启下一场深度对话</div>' +
        '<div class="next-sub">这是根据你本次思考定制的对话起点——直接复制，粘贴到 AI Studio 新对话开头</div>';

      const nextText = document.createElement('div');
      nextText.className = 'next-text';
      nextText.textContent = ap.next_prompt;
      nextText.addEventListener('click', function() {
        navigator.clipboard.writeText(ap.next_prompt).then(function() {
          nextText.classList.add('copied');
          setTimeout(function() { nextText.classList.remove('copied'); }, 2000);
        });
      });
      nextDiv.appendChild(nextText);
      entryEl.appendChild(nextDiv);
    }

    container.appendChild(entryEl);
  });
}

load();
