// background.js — 后台服务线程 v4.0
// 职责：消息中转 + API调用（新Prompt结构：B情感钩子 + C离场包 + A可选框架）

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PIN_UPDATED') {
    chrome.runtime.sendMessage({ type: 'REFRESH_PIN_COUNT', tabId: sender.tab?.id })
      .catch(() => {}); // 接收端不存在时静默忽略
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === 'GENERATE_ASSETS') {
    handleGenerate(message.payload, sendResponse);
    return true;
  }
  if (message.type === 'GENERATE_MIRROR') {
    handleMirror(message.payload, sendResponse);
    return true;
  }
  return false;
});

async function handleGenerate({ pins, apiKey, provider, customEndpoint }, sendResponse) {

  // ── Prompt ────────────────────────────────────────────────
  // 结构：B（情感钩子）+ C（可执行离场包）+ A（可选框架）
  const textArray = pins.map((p, i) => ({
    index: i + 1,
    role: p.role,   // "user" | "ai" | "note"
    text: p.text,
    time: p.time
  }));

  const prompt = `你是一名兼具洞察力与行动力的思维教练。
基于用户精选的以下对话片段，生成一份认知资产报告。

## 输出结构（严格按此JSON，不加代码块，不加任何额外文字）

{
  "hook": {
    "surface_question": "一句话：我表面上在问/讨论什么（具体，第一人称）",
    "real_struggle": "一句话点破：我真正困扰的深层问题是什么（要让我看了说'对，就是这个'，第一人称）",
    "shift": "1-2句：经过这次对话，我隐约意识到了什么（第一人称，聚焦认知转变，不复述内容）",
    "seen_by": "2-3句，用第二人称'你'，克制而精准。不写诗，不造意象，不用隐喻。直接说：这个人的思维方式是什么、他真正在追求什么、这次提问暴露了他哪个具体的认知特征。要让他看了说'对，说的就是我'，而不是'写得真美'",
    "cognitive_bias": {
      "mode": "从这四个中选一个最准确的：执行型 / 战略型 / 情绪型 / 分析型",
      "lean": "这次对话中，用户思维的具体偏向是什么（一句话，10字以内，例如：过于聚焦细节落地，缺乏系统视角）",
      "alert": "如果这个偏向持续下去，会错过什么（一句话，直接，不超过20字）"
    }
  },
  "belief_update": {
    "before": "我之前默默持有的、被这次对话撼动的信念（一句话，要具体，不要'我以为X很重要'这种废话级表述）",
    "after": "更新后的信念（一句话，要有力量，像一条值得写在笔记本上的原则）",
    "why_it_matters": "这个信念更新为什么重要？它会改变我之后的哪个决策或行动方式？（1句话，直接点）"
  },
  "action_pack": {
    "insights": ["这次对话后，我真正明白了……（2-3条，每条是一个有重量的洞见，不是事实复述，是认知升级，第一人称）"],
    "actions": [
      {"when": "时间范围", "what": "具体行动，动词开头，一句话，要可执行不要'思考'类的动词"}
    ],
    "open_questions": ["真正没解决的核心问题（1-2条，必须是这次对话后新涌现的问题，不是已经讨论过的）"],
    "next_prompt": "一段可以直接粘贴到下次对话开头的Prompt，帮用户在新对话里继承这次的认知进展并推进到下一层（60-90字，第一人称，直接可用，像一个聪明人给AI的briefing）"
  }
}

## 重要原则
- belief_update.after 必须像一条原则，而不是一个描述
- action_pack.insights 是认知升级，不是总结，每条要让人有"对！就是这个"的感觉
- hook.seen_by 必须克制：禁止用诗意语言、禁止造意象比喻，用直白精准的语言描述他的思维特征，让人读完说"对"而不是"写得美"
- hook.cognitive_bias.mode 必须从四个选项中选一个，lean 和 alert 必须具体、简短、直接
- next_prompt 是最重要的输出之一，必须具体、有力、可以直接开启下一场深度对话
- 不要输出 framework 字段，框架已被移除

片段列表：
${JSON.stringify(textArray, null, 2)}`

  // ── 端点与格式 ────────────────────────────────────────────
  const PROVIDERS = {
    gemini:   { ep: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', fmt: 'gemini' },
    deepseek: { ep: 'https://api.deepseek.com/v1/chat/completions', fmt: 'openai', model: 'deepseek-chat' },
    openai:   { ep: customEndpoint || 'https://api.openai.com/v1/chat/completions', fmt: 'openai', model: 'gpt-4o-mini' },
  };

  const cfg = PROVIDERS[provider] || PROVIDERS.gemini;
  const ep = (provider === 'openai' && customEndpoint) ? customEndpoint : cfg.ep;

  try {
    let url, body, headers = { 'Content-Type': 'application/json' };

    if (cfg.fmt === 'gemini') {
      url = `${ep}?key=${apiKey}`;
      body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } };
    } else {
      url = ep;
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = { model: cfg.model || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 4096, temperature: 0.7 };
    }

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t}`); }

    const data = await res.json();
    let raw = cfg.fmt === 'gemini'
      ? data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      : data?.choices?.[0]?.message?.content || '';

    // 清洗JSON：去掉代码块标记
    raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // 提取第一个完整 JSON 对象（防止 AI 在 JSON 前后加文字）
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) raw = jsonMatch[0];

    // 修复 AI 常见的 JSON 错误：字符串内的未转义换行符
    // 用状态机处理：在字符串内把换行替换为 \n
    function fixJsonControlChars(str) {
      let result = '';
      let inString = false;
      let escaped = false;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (escaped) { result += ch; escaped = false; continue; }
        if (ch === '\\') { result += ch; escaped = true; continue; }
        if (ch === '"') { inString = !inString; result += ch; continue; }
        if (inString) {
          if (ch === '\n') { result += '\\n'; continue; }
          if (ch === '\r') { result += '\\r'; continue; }
          if (ch === '\t') { result += '\\t'; continue; }
          // 其他控制字符
          const code = ch.charCodeAt(0);
          if (code < 0x20) { result += '\\u' + code.toString(16).padStart(4,'0'); continue; }
        }
        result += ch;
      }
      return result;
    }

    let parsed;
    // 第1次：直接解析
    try { parsed = JSON.parse(raw); }
    catch (e1) {
      // 第2次：修复控制字符后解析
      try { parsed = JSON.parse(fixJsonControlChars(raw)); }
      catch (e2) {
        // 第3次：更暴力的清洗——把所有属性值里的换行全部替换
        try {
          const bruteFixed = raw.replace(/"([^"\\]*(\\.[^"\\]*)*)"/gs, (match) =>
            match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
          );
          parsed = JSON.parse(bruteFixed);
        } catch (e3) {
          throw new Error('JSON解析失败：' + e1.message + '\n原始：' + raw.slice(0, 400));
        }
      }
    }

    sendResponse({ ok: true, assets: parsed });

  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
}


// ── 命运镜像：基于历史洞察数据的深度认知分析 ──────────────
async function handleMirror({ history, apiKey, provider, customEndpoint }, sendResponse) {

  // 把历史洞察数据压缩成分析素材
  const material = history.map((entry, i) => ({
    session: i + 1,
    date: entry.date || '',
    seen_by: entry.assets?.hook?.seen_by || '',
    real_struggle: entry.assets?.hook?.real_struggle || '',
    shift: entry.assets?.hook?.shift || '',
    belief_before: entry.assets?.belief_update?.before || '',
    belief_after: entry.assets?.belief_update?.after || '',
    insights: entry.assets?.action_pack?.insights || [],
    open_questions: entry.assets?.action_pack?.open_questions || [],
    pin_texts: (entry.pinTexts || []).map(p => p.text).slice(0, 5) // 每次取前5条原话
  }));

  const prompt = `你是一位冷峻的认知分析师。以下是这个人在 ${material.length} 次深度AI对话中沉淀的认知数据。

## 你的任务
基于这些数据，生成「命运镜像」报告。不要温柔，不要模糊，不要鼓励性废话。

## 输出格式（严格JSON，不加代码块）

{
  "cognitive_dna": [
    {
      "trait": "思维特征名称（4字以内，精准）",
      "evidence": "从原始数据中引用1条最有力的证据（原话或改写）",
      "impact": "这个特征在现实中如何限制或助力他（一句话，直白）"
    }
  ],
  "parallel_2035": {
    "trajectory_a": {
      "label": "顺着现在的惯性",
      "scene": "2035年，具体描述他会在哪里、做什么、面对什么问题（2-3句，不要励志，要真实）"
    },
    "trajectory_b": {
      "label": "如果突破核心盲点",
      "scene": "2035年，另一条路的具体样貌（2-3句，不要乌托邦，要有代价）"
    },
    "pivot": "两条路的分叉点是什么——他现在需要做的那一个具体改变（一句话）"
  },
  "blind_spot": {
    "statement": "他最大的思维盲点（一句话，必须具体，必须基于数据，让他看了有点不舒服但无法反驳）",
    "pattern": "这个盲点在数据中重复出现的具体表现（1-2句，引用证据）",
    "cost": "如果不处理这个盲点，他将付出什么代价（一句话，直接）"
  }
}

## 原则
- cognitive_dna 必须有 2-3 条，每条都要有数据中的证据
- parallel_2035 的两条路都要有真实感，不是"成功 vs 失败"，而是两种不同的人生质地
- blind_spot 必须冷峻——这是整个报告最重要的输出，不能模糊
- 禁止使用励志语言，禁止说"你很有潜力"这类话

## 数据
${JSON.stringify(material, null, 2)}`;

  const PROVIDERS = {
    gemini:   { ep: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', fmt: 'gemini' },
    deepseek: { ep: 'https://api.deepseek.com/v1/chat/completions', fmt: 'openai', model: 'deepseek-chat' },
    openai:   { ep: customEndpoint || 'https://api.openai.com/v1/chat/completions', fmt: 'openai', model: 'gpt-4o-mini' },
  };

  const cfg = PROVIDERS[provider] || PROVIDERS.gemini;
  const ep = (provider === 'openai' && customEndpoint) ? customEndpoint : cfg.ep;

  try {
    let url, body, headers = { 'Content-Type': 'application/json' };

    if (cfg.fmt === 'gemini') {
      url = `${ep}?key=${apiKey}`;
      body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.85, maxOutputTokens: 2048 } };
    } else {
      url = ep;
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = { model: cfg.model || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 2048, temperature: 0.85 };
    }

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t}`); }

    const data = await res.json();
    let raw = cfg.fmt === 'gemini'
      ? data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      : data?.choices?.[0]?.message?.content || '';

    raw = raw.replace(/\`\`\`json\s*/gi, '').replace(/\`\`\`\s*/g, '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) raw = jsonMatch[0];

    function fixJson(str) {
      let result = '', inString = false, escaped = false;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (escaped) { result += ch; escaped = false; continue; }
        if (ch === '\\') { result += ch; escaped = true; continue; }
        if (ch === '"') { inString = !inString; result += ch; continue; }
        if (inString && ch === '\n') { result += '\\n'; continue; }
        if (inString && ch === '\r') { result += '\\r'; continue; }
        if (inString) {
          const code = ch.charCodeAt(0);
          if (code < 0x20) { result += '\\u' + code.toString(16).padStart(4,'0'); continue; }
        }
        result += ch;
      }
      return result;
    }

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch(e1) {
      try { parsed = JSON.parse(fixJson(raw)); }
      catch(e2) { throw new Error('Mirror JSON解析失败: ' + e1.message); }
    }

    sendResponse({ ok: true, mirror: parsed });
  } catch(e) {
    sendResponse({ ok: false, error: e.message });
  }
}
