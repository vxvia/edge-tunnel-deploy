/**
 * EdgeTunnel 一键部署工具 v3 - Cloudflare Pages 版
 * 路由：
 *   GET  /          → HTML 页面
 *   POST /proxy/cf  → 代理 CF API（解决浏览器跨域）
 *   GET  /proxy/src → 代理拉取 GitHub 源码（锁定 commit）
 */
const COMMIT_HASH = "1ab67e7da5d3d7eb35cd1e5359b7330ae55d4a8b";
const GITHUB_SRC = `https://raw.githubusercontent.com/sskkvw/edgetunnel/${COMMIT_HASH}/_worker.js`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-CF-Token,X-CF-Path,X-CF-Method,X-CF-Ctype",
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 代理 GitHub 源码
  if (url.pathname === "/proxy/src") {
    const res = await fetch(GITHUB_SRC);
    let text = await res.text();
    let echPatched = false;

    // 多项正则替换确保 ECH = true
    if (/\bECH\s*:\s*false/.test(text)) {
      text = text.replace(/(\bECH\s*:\s*)false/g, "$1true");
      echPatched = true;
    }
    if (/if\s*\(\s*!\s*config_JSON\.ECH\s*\)\s*config_JSON\.ECH\s*=\s*false/.test(text)) {
      text = text.replace(
        /(if\s*\(\s*!\s*config_JSON\.ECH\s*\)\s*config_JSON\.ECH\s*=\s*)false/g,
        "$1true"
      );
      echPatched = true;
    }
    if (/\bECH\s*:.*\?\s*.+?\s*:\s*false/.test(text)) {
      text = text.replace(/(\bECH\s*:.*\?\s*.+?\s*:\s*)false/g, "$1true");
      echPatched = true;
    }
    if (/\bECH\s*=\s*false/.test(text)) {
      text = text.replace(/(\bECH\s*=\s*)false/g, "$1true");
      echPatched = true;
    }
    if (/["']ECH["']\s*:\s*false/.test(text)) {
      text = text.replace(/(["']ECH["']\s*:\s*)false/g, "$1true");
      echPatched = true;
    }
    if (!echPatched) {
      text += [
        "",
        "// [auto-patch] ECH force-enable fallback",
        "const __patchECH = (cfg) => { if (cfg && typeof cfg === 'object') cfg.ECH = true; };",
        "if (typeof 默认配置JSON !== 'undefined') __patchECH(默认配置JSON);",
        "if (typeof config_JSON !== 'undefined') __patchECH(config_JSON);",
      ].join("\n");
    }

    const verified =
      /\bECH\s*:\s*true/.test(text) ||
      /\bECH\s*=\s*true/.test(text) ||
      /["']ECH["']\s*:\s*true/.test(text) ||
      text.includes("__patchECH");

    return new Response(text, {
      status: res.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/plain; charset=utf-8",
        "X-ECH-Patched": echPatched ? "pattern" : "fallback",
        "X-ECH-Verified": String(verified),
      },
    });
  }

  // 代理 Cloudflare API
  if (url.pathname === "/proxy/cf" && request.method === "POST") {
    return await proxyCF(request);
  }

  // 主页面
  const tutorialUrl = env?.AAA || "A";
  return new Response(buildHTML(tutorialUrl), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function proxyCF(request) {
  try {
    const token = request.headers.get("X-CF-Token");
    const cfPath = request.headers.get("X-CF-Path");
    const method = request.headers.get("X-CF-Method") || "GET";
    const ctype = request.headers.get("X-CF-Ctype");

    if (!token || !cfPath) {
      return jsonResp({ success: false, errors: [{ message: "Missing X-CF-Token or X-CF-Path" }] }, 400);
    }

    const cfUrl = "https://api.cloudflare.com/client/v4" + cfPath;
    const headers = { Authorization: "Bearer " + token };
    const originalCtype = request.headers.get("Content-Type");
    const finalCtype = ctype || originalCtype;
    if (finalCtype) headers["Content-Type"] = finalCtype;

    const res = await fetch(cfUrl, {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? request.body : undefined,
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { ...CORS_HEADERS, "Content-Type": res.headers.get("Content-Type") || "application/json" },
    });
  } catch (e) {
    return jsonResp({ success: false, errors: [{ message: e.message }] }, 500);
  }
}

function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── HTML 页面（与原 Worker 完全相同）─────────────────────────────────────────
function buildHTML(tutorialUrl) {
  const hasTutorial = tutorialUrl && tutorialUrl !== "A";
  const tutorialBtn = hasTutorial
    ? `<a class="tutorial-btn" href="${tutorialUrl}" target="_blank" rel="noopener">📖 订阅获取教程</a>`
    : `<a class="tutorial-btn tutorial-disabled" href="#" onclick="return false;" title="请在环境变量 AAA 中配置教程链接">📖 订阅获取教程</a>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>EdgeTunnel 一键部署</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0d1117; --surface: #161b22; --border: #30363d;
      --text: #e6edf3; --muted: #8b949e;
      --accent: #58a6ff; --accent-dim: #1f3a5f;
      --warn: #f85149; --warn-dim: #3d1a1a;
      --success: #3fb950; --success-dim: #1a3325;
      --input-bg: #0d1117; --radius: 8px;
      --mono: 'SF Mono','Fira Code','Cascadia Code',Consolas,monospace;
    }
    body {
      background: var(--bg); color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh; display: flex;
      align-items: flex-start; justify-content: center;
      padding: 40px 16px 60px;
      gap: 24px;
    }
    .container { width: 100%; max-width: 560px; flex-shrink: 0; }

    .sidebar {
      width: 215px;
      flex-shrink: 0;
      padding-top: 4px;
      position: sticky;
      top: 40px;
    }
    .disclaimer-toggle {
      background: none;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 14px;
      font-weight: 500;
      color: var(--muted);
      padding: 0;
      transition: color .15s;
      white-space: nowrap;
    }
    .disclaimer-toggle:hover { color: var(--text); }
    .disclaimer-toggle .arrow {
      display: inline-block;
      transition: transform .2s;
      font-style: normal;
      font-size: 10px;
      flex-shrink: 0;
    }
    .disclaimer-toggle.open .arrow { transform: rotate(90deg); }
    .disclaimer-body {
      display: none;
      margin-top: 12px;
      font-size: 14px;
      color: var(--muted);
      line-height: 1.85;
      width: 215px;
      word-break: break-all;
      overflow-wrap: break-word;
    }
    .disclaimer-body.open { display: block; }
    .disclaimer-intro { margin-bottom: 8px; }
    .disclaimer-list {
      padding-left: 0;
      list-style: none;
      margin-top: 4px;
    }
    .disclaimer-list li {
      margin-bottom: 10px;
    }
    .disclaimer-list li strong {
      display: block;
      color: var(--text);
      margin-bottom: 3px;
    }
    .disclaimer-body a {
      color: var(--muted);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .disclaimer-body a:hover { color: var(--accent); }

    @media (max-width: 860px) {
      body { flex-direction: column; align-items: center; }
      .sidebar { width: 100%; max-width: 560px; position: static; }
      .disclaimer-body { width: 100%; word-break: normal; }
    }

    .header { margin-bottom: 28px; }
    .header-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .header h1 { font-size: 21px; font-weight: 600; letter-spacing: -.3px; }
    .header p { margin-top: 8px; font-size: 13px; color: var(--muted); line-height: 1.6; }

    .tutorial-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 6px 14px; border-radius: 6px;
      border: 1px solid var(--accent); color: var(--accent);
      font-size: 12px; font-weight: 500; text-decoration: none;
      white-space: nowrap; transition: background .15s, color .15s;
      flex-shrink: 0;
    }
    .tutorial-btn:hover { background: var(--accent-dim); }
    .tutorial-disabled {
      border-color: var(--border); color: var(--muted); cursor: not-allowed;
    }
    .tutorial-disabled:hover { background: none; }

    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 22px; margin-bottom: 14px;
    }
    .card-title {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: .8px; color: var(--muted); margin-bottom: 16px;
    }
    .field { margin-bottom: 14px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: 13px; font-weight: 500; color: var(--muted); margin-bottom: 5px; }
    label .req { color: var(--accent); }
    input[type=text], input[type=password] {
      width: 100%; background: var(--input-bg); border: 1px solid var(--border);
      border-radius: 6px; padding: 9px 12px; font-size: 13px;
      color: var(--text); font-family: var(--mono); outline: none;
      transition: border-color .15s;
    }
    input:focus { border-color: var(--accent); }
    .hint { margin-top: 5px; font-size: 12px; color: var(--muted); }

    .btn-deploy {
      width: 100%; padding: 11px; background: var(--accent); color: #0d1117;
      font-size: 14px; font-weight: 600; border: none;
      border-radius: var(--radius); cursor: pointer;
      transition: opacity .15s, transform .1s; letter-spacing: .2px;
    }
    .btn-deploy:hover { opacity: .88; }
    .btn-deploy:active { transform: scale(.99); }
    .btn-deploy:disabled { opacity: .4; cursor: not-allowed; transform: none; }

    .log-card { display: none; margin-top: 14px; }
    .log-card.on { display: block; }
    .log-body {
      background: var(--bg); border: 1px solid var(--border);
      border-radius: 6px; padding: 12px;
      font-family: var(--mono); font-size: 12px; line-height: 1.9;
      max-height: 240px; overflow-y: auto;
    }
    .ll { display: flex; gap: 10px; }
    .ll .ts { color: #444d56; flex-shrink: 0; }
    .ll.ok .m { color: var(--success); }
    .ll.err .m { color: var(--warn); }
    .ll.info .m { color: var(--accent); }
    .ll.dim .m { color: var(--muted); }

    .result-card { display: none; margin-top: 14px; }
    .result-card.on { display: block; }
    .result-inner {
      background: var(--success-dim); border: 1px solid #2d5c3a;
      border-radius: 6px; padding: 16px;
    }
    .result-title { font-size: 14px; font-weight: 600; color: var(--success); margin-bottom: 12px; }
    .rrow { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
    .rrow:last-child { margin-bottom: 0; }
    .rlabel { font-size: 12px; color: #3fb950aa; width: 90px; flex-shrink: 0; }
    .rval {
      flex: 1; font-family: var(--mono); font-size: 12px; color: var(--text);
      background: #0d1117; border: 1px solid var(--border);
      border-radius: 4px; padding: 5px 10px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      text-decoration: none; display: block;
    }
    .rval-link { color: var(--accent); }
    .rval-link:hover { text-decoration: underline; }
    .cbtn {
      background: none; border: 1px solid var(--border); border-radius: 4px;
      padding: 4px 10px; font-size: 11px; color: var(--muted);
      cursor: pointer; white-space: nowrap; transition: all .15s;
    }
    .cbtn:hover { border-color: var(--accent); color: var(--accent); }
    .cbtn.done { color: var(--success); border-color: var(--success); }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin {
      display: inline-block; width: 12px; height: 12px;
      border: 2px solid transparent; border-top-color: currentColor;
      border-radius: 50%; animation: spin .6s linear infinite;
      vertical-align: middle; margin-right: 6px;
    }
  </style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="header-top">
      <h1>EdgeTunnel 一键部署</h1>
      ${tutorialBtn}
    </div>
    <p>填写 Cloudflare 信息后点击「生成」，自动完成 Worker 部署、密钥写入与 KV 绑定。</p>
  </div>

  <div class="card">
    <div class="card-title">Cloudflare 凭据</div>
    <div class="field">
      <label>API 令牌 <span class="req">*</span></label>
      <input type="password" id="token" placeholder="Edit Cloudflare Workers 令牌" autocomplete="off"/>
      <div class="hint">使用「编辑 Cloudflare Workers」预设令牌即可</div>
    </div>
    <div class="field">
      <label>Account ID <span class="req">*</span></label>
      <input type="text" id="account" placeholder="32位十六进制字符串" autocomplete="off"/>
      <div class="hint">Workers &amp; Pages → 概述 → 右侧「账户 ID」</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Worker 配置</div>
    <div class="field">
      <label>Worker 名称</label>
      <input type="text" id="wname" placeholder="自动生成"/>
    </div>
    <div class="field">
      <label>KV 命名空间名称</label>
      <input type="text" id="kvname" placeholder="自动生成"/>
    </div>
  </div>

  <div class="card">
    <div class="card-title">环境变量 / 密钥</div>
    <div class="field">
      <label>ADMIN 密码 <span class="req">*</span></label>
      <input type="password" id="admin" placeholder="自动生成" autocomplete="new-password"/>
    </div>
    <div class="field">
      <label>KEY 密码 <span class="req">*</span></label>
      <input type="password" id="key" placeholder="自动生成" autocomplete="new-password"/>
    </div>
  </div>

  <button class="btn-deploy" id="gbtn" onclick="deploy()">🚀 生成</button>

  <div class="card log-card" id="logcard">
    <div class="card-title">部署日志</div>
    <div class="log-body" id="logbody"></div>
  </div>

  <div class="result-card" id="rescard">
    <div class="result-inner">
      <div class="result-title">✅ 订阅生成成功</div>
      <div id="resrows"></div>
    </div>
  </div>

</div>
<script>
const BASE = location.origin;

function ts() { return new Date().toLocaleTimeString('zh-CN',{hour12:false}); }

function log(msg, type) {
  type = type || 'dim';
  const b = document.getElementById('logbody');
  const d = document.createElement('div');
  d.className = 'll ' + type;
  d.innerHTML = '<span class="ts">'+ts()+'</span><span class="m">'+msg+'</span>';
  b.appendChild(d);
  b.scrollTop = b.scrollHeight;
}

function copyVal(btn, val) {
  navigator.clipboard.writeText(val).then(function() {
    btn.textContent = '✓ 已复制';
    btn.classList.add('done');
    setTimeout(function(){ btn.textContent='复制'; btn.classList.remove('done'); }, 1500);
  });
}

function showResult(rows) {
  var c = document.getElementById('rescard');
  var r = document.getElementById('resrows');
  r.innerHTML = '';
  rows.forEach(function(item) {
    var d = document.createElement('div');
    d.className = 'rrow';
    var safe = item.value.replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'");
    var isUrl = /^https?:\/\//.test(item.value);
    var valHtml = isUrl
      ? '<a class="rval rval-link" href="'+item.value+'" target="_blank" rel="noopener" title="'+item.value+'">'+item.value+'</a>'
      : '<span class="rval" title="'+item.value+'">'+item.value+'</span>';
    d.innerHTML =
      '<span class="rlabel">'+item.label+'</span>'+
      valHtml+
      '<button class="cbtn" onclick="copyVal(this,\\''+safe+'\\')">复制</button>';
    r.appendChild(d);
  });
  c.classList.add('on');
}

async function cfFetch(token, path, method, body, ctype) {
  method = method || 'GET';
  var headers = {
    'X-CF-Token':  token,
    'X-CF-Path':   path,
    'X-CF-Method': method,
  };
  if (ctype) headers['X-CF-Ctype'] = ctype;

  var res = await fetch(BASE + '/proxy/cf', {
    method: 'POST',
    headers: headers,
    body: body,
  });
  var data = await res.json();
  if (!data.success) {
    var errs = (data.errors || []).map(function(e){ return e.message; }).join('; ');
    throw new Error(errs || 'CF API 错误 (HTTP ' + res.status + ')');
  }
  return data.result;
}

function randName() {
  var chars = 'abcdefghjkmnpqrstuvwxyz';
  var s = '';
  for (var i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

(function() {
  var wn = document.getElementById('wname');
  var kn = document.getElementById('kvname');
  var ad = document.getElementById('admin');
  var ky = document.getElementById('key');
  if (wn && !wn.value) wn.value = randName();
  if (kn && !kn.value) kn.value = randName();
  if (ad && !ad.value) ad.value = randName() + randName();
  if (ky && !ky.value) ky.value = randName() + randName();
})();

async function deploy() {
  var token  = document.getElementById('token').value.trim();
  var acct   = document.getElementById('account').value.trim();
  var wname  = document.getElementById('wname').value.trim() || randName();
  var kvname = document.getElementById('kvname').value.trim() || randName();
  var admin  = document.getElementById('admin').value;
  var key    = document.getElementById('key').value;

  if (!token || !acct) { alert('请填写 API 令牌与 Account ID'); return; }

  var btn = document.getElementById('gbtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>部署中…';
  document.getElementById('logcard').classList.add('on');
  document.getElementById('rescard').classList.remove('on');
  document.getElementById('logbody').innerHTML = '';

  try {
    log('正在拉取 Worker 源码…', 'info');
    var srcRes = await fetch(BASE + '/proxy/src');
    if (!srcRes.ok) throw new Error('源码拉取失败: HTTP ' + srcRes.status);
    var script = await srcRes.text();
    var echPatched  = srcRes.headers.get('X-ECH-Patched')  || 'unknown';
    var echVerified = srcRes.headers.get('X-ECH-Verified') || 'false';
    log('源码拉取成功（' + Math.round(script.length / 1024) + ' KB）', 'ok');
    if (echVerified === 'true') {
      log('ECH 源码修改成功（方式: ' + echPatched + '）✓', 'ok');
    } else {
      log('⚠️ ECH 源码修改未能验证，请部署后在后台手动启用', 'err');
    }

    log('正在创建 KV 命名空间 "' + kvname + '"…', 'info');
    var kv = await cfFetch(
      token,
      '/accounts/' + acct + '/storage/kv/namespaces',
      'POST',
      JSON.stringify({ title: kvname }),
      'application/json'
    );
    var kvId = kv.id;
    log('KV 创建成功 → ID: ' + kvId, 'ok');

    log('正在部署 Worker "' + wname + '"…', 'info');
    var metadata = {
      main_module: 'worker.js',
      bindings: [
        { type: 'kv_namespace', name: 'KV',    namespace_id: kvId },
        { type: 'secret_text',  name: 'ADMIN', text: admin },
        { type: 'secret_text',  name: 'KEY',   text: key  }
      ],
      compatibility_date: '2024-01-01'
    };
    var form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('worker.js', new Blob([script], { type: 'application/javascript+module' }), 'worker.js');

    var formReq = new Request('https://dummy', { method: 'POST', body: form });
    var formCtype = formReq.headers.get('Content-Type');
    var formBytes = await formReq.arrayBuffer();

    await cfFetch(
      token,
      '/accounts/' + acct + '/workers/scripts/' + wname,
      'PUT',
      formBytes,
      formCtype
    );
    log('Worker 部署成功', 'ok');

    log('正在查询账户子域…', 'info');
    var sub = '';
    try {
      var sd = await cfFetch(token, '/accounts/' + acct + '/workers/subdomain');
      sub = sd.subdomain || '';
    } catch(e) {}

    var workerUrl = sub
      ? 'https://' + wname + '.' + sub + '.workers.dev'
      : 'https://' + wname + '.<subdomain>.workers.dev';
    var subUrl = workerUrl + '/' + key;

    log('全部完成 🎉', 'ok');
    showResult([
      { label: 'Worker 地址', value: workerUrl },
      { label: '订阅链接',    value: subUrl    },
      { label: 'Worker 名称', value: wname     },
      { label: 'KV 空间 ID', value: kvId      },
      { label: 'ADMIN 密码',  value: admin     },
      { label: 'KEY 密码',    value: key       },
      { label: 'ECH',         value: '已默认启用（源码级修改）' },
      { label: '⚠️ 最后一步', value: 'https://dash.cloudflare.com/?to=/:account/workers/services/view/' + wname + '/production/settings' },
    ]);

  } catch(e) {
    log('❌ ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🚀 生成';
  }
}
function toggleDisclaimer() {
  var btn = document.getElementById('disclaimerBtn');
  var body = document.getElementById('disclaimerBody');
  var open = body.classList.toggle('open');
  btn.classList.toggle('open', open);
}
</script>

<aside class="sidebar">
    <button class="disclaimer-toggle" id="disclaimerBtn" onclick="toggleDisclaimer()">
      <i class="arrow">▶</i> 使用声明
    </button>
    <div class="disclaimer-body" id="disclaimerBody">
      <p class="disclaimer-intro">本工具仅供学习、研究及个人合法使用，旨在帮助用户便捷地完成 Cloudflare Workers 的基础配置与部署操作。</p>
      <p class="disclaimer-intro">使用本工具，即表示您已阅读并同意以下条款：</p>
      <ol class="disclaimer-list">
        <li>
          <strong>一、合法合规</strong>
          您应确保使用行为符合所在地区的法律法规，以及 <a href="https://www.cloudflare.com/terms/" target="_blank" rel="noopener">Cloudflare 服务条款</a>的相关规定。
        </li>
        <li>
          <strong>二、禁止滥用</strong>
          严禁用于违法活动，包括但不限于网络攻击、数据窃取、传播违法内容或绕过合法访问控制等行为。
        </li>
        <li>
          <strong>三、资源责任</strong>
          所创建的 Cloudflare 资源由您本人负责管理，相关费用与法律责任均由使用者自行承担，与本工具无关。
        </li>
        <li>
          <strong>四、凭据安全</strong>
          敏感信息仅在您的浏览器与 Cloudflare 官方接口间传输，本工具不存储、不记录任何凭据。
        </li>
        <li>
          <strong>五、免责声明</strong>
          本工具按"现状"提供，开发者不对任何损失承担责任，亦无义务对用户的使用行为进行监控或审查。
        </li>
      </ol>
    </div>
  </aside>

</body>
</html>`;
}
