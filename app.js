import { REPO_URL, SITE_NAME } from './config.js';
import { search, normalize } from './lib/search.js';
import { generateComplaint, OUTCOMES, CHANNELS as COMPLAIN_CHANNELS, LAWS } from './lib/complaint.js';
import { esc, formatDate, ageLabel, RESULT, CHANNEL, hostOf, issueUrl } from './lib/util.js';

const $main = document.getElementById('main');
const $cheat = document.getElementById('cheat');
const $toast = document.getElementById('toast');

const state = {
  data: null,
  byId: new Map(),
  catById: {},
  catName: {},
  regById: {},
  query: '',
  cat: 'all',
  homeScroll: 0,
  wakeLock: null,
  lastFocus: null,
};

const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function badge(result) {
  const r = RESULT[result] || RESULT.unknown;
  return `<span class="badge ${r.tone}">${esc(r.label)}</span>`;
}

function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), 1800);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('已复制');
}

function setTitle(t) {
  document.title = t ? `${t} · ${SITE_NAME}` : `${SITE_NAME} · 别跟机器人较劲`;
}

function setNav(key) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// ---------------------------------------------------------------- 路由
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(qs) };
}

function route() {
  if (!state.data) return;
  const prev = state.route;
  const { parts, params } = parseHash();
  const page = parts[0] || 'home';
  state.route = page;
  closeCheat();

  if (prev === 'home' && page !== 'home') state.homeScroll = window.scrollY;

  if (page === 'home') {
    if (params.has('q')) state.query = params.get('q');
    if (params.has('cat')) state.cat = params.get('cat');
    renderHome();
    window.scrollTo(0, prev && prev !== 'home' ? state.homeScroll : 0);
    return;
  }
  if (page === 'c' && parts[1]) renderCompany(decodeURIComponent(parts[1]));
  else if (page === 'guide') renderGuide();
  else if (page === 'complain') renderComplain(params);
  else if (page === 'about') renderAbout();
  else renderNotFound();
  window.scrollTo(0, 0);
  $main.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- 首页
function renderHome() {
  setTitle('');
  setNav('home');
  const { stats, categories, companies } = state.data;
  const counts = {};
  for (const c of companies) counts[c.category] = (counts[c.category] || 0) + 1;

  $main.innerHTML = `
    <section class="hero">
      <h1>打客服电话被机器人绕晕？<br><em>这里查怎么转人工。</em></h1>
      <p class="sub">官方号码、媒体和网友的实测路径、转不了时去哪投诉——都在这。</p>
    </section>
    <div class="searchbox" role="search">
      ${icon('search')}
      <input id="q" type="search" inputmode="search" enterkeyhint="search" autocomplete="off"
        placeholder="企业名 / 拼音首字母 / 号码"
        aria-label="搜索企业" value="${esc(state.query)}">
    </div>
    <p class="stats">试试搜 <a href="#/?q=招行" data-try="招行">招行</a>、<a href="#/?q=zsyh" data-try="zsyh">zsyh</a>、<a href="#/?q=95555" data-try="95555">95555</a></p>
    <p class="stats">收录 ${stats.companies} 家企业 · ${stats.reports} 条实测记录 · ${stats.checkedHotlines} 个号码已核对出处 · 数据更新于 ${esc(formatDate(state.data.generatedAt))}</p>
    <a class="banner" href="#/guide">
      <span class="tag">新国标</span>
      <p><strong>9 月 1 日起，转人工有国家标准了</strong>GB/T 47746—2026：入口要清晰，转接后不用把问题再说一遍，价格、退款、赔偿要人工确认。<span class="more">看怎么用它 →</span></p>
    </a>
    <div class="chips" role="group" aria-label="按行业筛选">
      <button class="chip" type="button" data-cat="all" aria-pressed="${state.cat === 'all'}">全部<span class="n">${companies.length}</span></button>
      ${categories
        .map((c) => `<button class="chip" type="button" data-cat="${esc(c.id)}" aria-pressed="${state.cat === c.id}">${esc(c.icon)} ${esc(c.name)}<span class="n">${counts[c.id] || 0}</span></button>`)
        .join('')}
    </div>
    <ul class="list" id="results" aria-live="polite"></ul>
  `;
  renderResults();

  const $q = document.getElementById('q');
  $q.addEventListener('input', () => {
    state.query = $q.value;
    syncHomeUrl();
    renderResults();
  });
  $q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = document.querySelector('#results .card-link');
      if (first) location.hash = first.getAttribute('href');
    }
  });
  $main.querySelectorAll('[data-try]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      $q.value = state.query = a.dataset.try;
      syncHomeUrl();
      renderResults();
    }),
  );
  $main.querySelectorAll('[data-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      state.cat = b.dataset.cat;
      $main.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      syncHomeUrl();
      renderResults();
    }),
  );
}

function syncHomeUrl() {
  const p = new URLSearchParams();
  if (state.query.trim()) p.set('q', state.query.trim());
  if (state.cat !== 'all') p.set('cat', state.cat);
  const qs = p.toString();
  history.replaceState(null, '', `#/${qs ? '?' + qs : ''}`);
}

function renderResults() {
  const $r = document.getElementById('results');
  if (!$r) return;
  let list = search(state.data.companies, state.query, state.catName);
  if (state.cat !== 'all') list = list.filter((c) => c.category === state.cat);

  if (!list.length) {
    const q = state.query.trim();
    $r.innerHTML = `<li class="empty">
      <p>没有找到「${esc(q)}」。</p>
      <p>先看看<a href="#/guide">通用转人工秘籍</a>，或者<a href="${esc(issueUrl('new-company.yml', { title: `[新增] ${q}`, company: q }))}" rel="noopener">申请收录这家企业</a>。</p>
    </li>`;
    return;
  }
  const grouped = !normalize(state.query) && state.cat === 'all';
  if (!grouped) {
    $r.innerHTML = list.map(cardHtml).join('');
    return;
  }
  $r.innerHTML = state.data.categories
    .map((cat) => {
      const items = list.filter((c) => c.category === cat.id);
      if (!items.length) return '';
      return `<li class="group-h"><h2>${esc(cat.icon)} ${esc(cat.name)}</h2></li>${items.map(cardHtml).join('')}`;
    })
    .join('');
}

function cardHtml(c) {
  const cat = state.catById[c.category];
  const h = c.hotlines[0];
  const more = c.hotlines.length > 1 ? ` 等 ${c.hotlines.length} 个号码` : '';
  const reportInfo = c.reports.length ? `${c.reports.length} 条实测 · ${ageLabel(c.latestReport)}` : '';
  const meta = [h ? `<span class="num">${esc(h.number)}</span>${esc(more)}` : '号码待补充', reportInfo].filter(Boolean).join(' · ');
  return `<li class="card">
    <a class="card-link" href="#/c/${esc(c.id)}">
      <span class="card-ico" aria-hidden="true">${esc(cat.icon)}</span>
      <span class="card-main">
        <span class="card-title">${esc(c.name)} ${badge(c.status)}</span>
        <span class="card-meta">${meta}</span>
      </span>
    </a>
    ${h ? `<a class="dial" href="tel:${esc(h.tel)}" aria-label="拨打 ${esc(c.name)} ${esc(h.number)}">${icon('phone')}<span>拨打</span></a>` : ''}
  </li>`;
}

// ---------------------------------------------------------------- 企业详情
function phoneSteps(c) {
  const cat = state.catById[c.category];
  if (c.steps?.phone?.length) return { steps: c.steps.phone, generic: false };
  return { steps: cat.generic_phone, generic: true };
}

function onlineSteps(c) {
  const cat = state.catById[c.category];
  if (c.steps?.online?.length) return { steps: c.steps.online, generic: false };
  if (cat.generic_online?.length) return { steps: cat.generic_online, generic: true };
  return null;
}

function hotlineHtml(c, h, i) {
  const verify = h.checked
    ? `<span class="ok">${icon('check')}已核对出处</span><span>${esc(formatDate(h.checked))} · <a class="src-link" href="${esc(h.source)}" target="_blank" rel="noopener">${esc(hostOf(h.source))}</a></span>`
    : h.source
      ? `<span>出处：<a class="src-link" href="${esc(h.source)}" target="_blank" rel="noopener">${esc(hostOf(h.source))}</a>（尚未核对）</span>`
      : `<span>来自公开资料，尚未核对官网。拨打前请以企业 App / 官网为准。</span>`;
  return `<div class="hotline">
    <div>
      <div class="label">${esc(h.label)}${h.hours ? ` · ${esc(h.hours)}` : ''}</div>
      <a class="number" href="tel:${esc(h.tel)}">${esc(h.number)}</a>
    </div>
    <div class="actions">
      <a class="btn primary" href="tel:${esc(h.tel)}">${icon('phone')}拨打</a>
      <button class="btn" type="button" data-cheat="${esc(c.id)}" data-hotline="${i}">${icon('note')}通话小抄</button>
    </div>
    <div class="verify">${verify}</div>
  </div>`;
}

function stepsHtml({ steps, generic }, kind) {
  return `<ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="basis ${generic ? 'generic' : ''}">${
      generic
        ? `这是${kind}的通用方法，还没有针对这家企业${kind}的实测记录。打过的话欢迎反馈。`
        : '依据下方实测记录整理。菜单可能随时调整，以实际语音提示为准。'
    }</p>`;
}

function regulatorsHtml(ids) {
  return ids
    .map((id) => state.regById[id])
    .filter(Boolean)
    .map(
      (r) => `<div class="reg-item">
        <h3>${esc(r.name)}<span class="org">${esc(r.org)}</span></h3>
        <p>${esc(r.scope)}</p>
        ${r.prereq ? `<p class="prereq">${esc(r.prereq)}</p>` : ''}
        ${r.also ? `<p>也可以用：${esc(r.also)}</p>` : ''}
        <div class="links">
          ${r.phone ? `<a class="btn" href="tel:${esc(r.phone)}">${icon('phone')}${esc(r.phone)}</a>` : ''}
          ${r.web ? `<a class="btn" href="${esc(r.web)}" target="_blank" rel="noopener">${icon('external')}网上投诉</a>` : ''}
        </div>
      </div>`,
    )
    .join('');
}

const FRAUD_HTML = `<div class="fraud">
  <h2>${icon('shield')}官方客服不会让你做这些事</h2>
  <ul>
    <li>把钱转到「安全账户」或任何个人账户；</li>
    <li>下载会议软件、打开屏幕共享；</li>
    <li>告诉他短信验证码、银行卡密码。</li>
  </ul>
  <p style="margin-top:8px">接到自称客服的来电，先挂断，再自己拨打官方号码核实。搜索引擎里的「客服电话」可能是假冒的，以企业 App / 官网公布为准。</p>
</div>`;

function renderCompany(id) {
  const c = state.byId.get(id);
  if (!c) return renderNotFound();
  const cat = state.catById[c.category];
  setTitle(`${c.name}怎么转人工`);
  setNav('home');

  const latest = c.reports[0];
  const statusLine = latest
    ? `${badge(c.status)}<span>最近实测：${esc(latest.by.replace(/（.*?）/, ''))} · ${esc(formatDate(latest.date))}</span>`
    : `${badge('unknown')}<span>还没有实测记录，打过的话<a href="${esc(issueUrl('report.yml', { title: `[实测] ${c.name}`, company: c.name }))}" target="_blank" rel="noopener">告诉大家结果</a></span>`;

  const online = onlineSteps(c);

  $main.innerHTML = `
    <a class="back" href="#/">${icon('back')}全部企业</a>
    <header class="co-head">
      <span class="card-ico" aria-hidden="true">${esc(cat.icon)}</span>
      <div>
        <h1>${esc(c.name)}</h1>
        <div class="aka">${esc(cat.name)}${c.aliases.length ? ` · 也叫 ${esc(c.aliases.filter((a) => !/^\d+$/.test(a)).slice(0, 5).join('、'))}` : ''}</div>
        <div class="status">${statusLine}</div>
      </div>
    </header>

    <section class="section" aria-labelledby="h-hot">
      <h2 id="h-hot">官方号码</h2>
      <div class="panel">
        ${
          c.hotlines.length
            ? c.hotlines.map((h, i) => hotlineHtml(c, h, i)).join('')
            : `<p class="nohotline">这家企业的官方热线号码还没有收录。请以 App 内公布的号码为准，<strong>不要拨打搜索结果里的陌生号码</strong>。</p>
               <a class="btn" href="${esc(issueUrl('wrong-info.yml', { title: `[补充号码] ${c.name}`, company: c.name }))}" target="_blank" rel="noopener">补充官方号码</a>`
        }
      </div>
    </section>

    <section class="section" aria-labelledby="h-steps">
      <h2 id="h-steps">接通后这样做</h2>
      <div class="panel">
        ${stepsHtml(phoneSteps(c), '电话客服')}
        ${online ? `<h3 class="sub-h">在线客服 / App</h3>${stepsHtml(online, '在线客服')}` : ''}
      </div>
    </section>

    ${
      c.notes?.length
        ? `<section class="section" aria-labelledby="h-notes"><h2 id="h-notes">官方措施</h2>
          ${c.notes
            .map(
              (n) => `<div class="note">${icon('check')}<div><p>${esc(n.text)}</p>
                <a class="src src-link" href="${esc(n.source)}" target="_blank" rel="noopener">出处：${esc(hostOf(n.source))}</a></div></div>`,
            )
            .join('')}</section>`
        : ''
    }

    <section class="section" aria-labelledby="h-reports">
      <h2 id="h-reports">实测记录 <span class="hint">${c.reports.length ? `${c.reports.length} 条，新的在前` : ''}</span></h2>
      <div class="panel">
        ${
          c.reports.length
            ? `<ul class="timeline">${c.reports
                .map((r) => {
                  const tone = (RESULT[r.result] || RESULT.unknown).tone;
                  return `<li class="${tone}">
                    <div class="when">${badge(r.result)}<span>${esc(formatDate(r.date))} · ${esc(CHANNEL[r.channel] || r.channel)}</span><span class="by">${esc(r.by)}</span></div>
                    <p>${esc(r.summary)}</p>
                    <a class="src src-link" href="${esc(r.url)}" target="_blank" rel="noopener">出处：${esc(hostOf(r.url))}</a>
                  </li>`;
                })
                .join('')}</ul>${c.stale ? '<p class="stale">最近一条实测已超过一年，菜单可能已经变化。</p>' : ''}`
            : '<p class="nohotline" style="margin:0">还没有人提交实测记录。你打过之后，花一分钟告诉大家结果，下一个人就能少走弯路。</p>'
        }
      </div>
    </section>

    ${
      c.tips?.length
        ? `<section class="section" aria-labelledby="h-tips"><h2 id="h-tips">补充说明</h2><div class="panel"><ul class="tips">${c.tips
            .map((t) => `<li>${esc(t)}</li>`)
            .join('')}</ul></div></section>`
        : ''
    }

    <section class="section">${FRAUD_HTML}</section>

    <section class="section" aria-labelledby="h-reg">
      <h2 id="h-reg">转不了人工？</h2>
      <p style="color:var(--ink-2)">先向企业投诉并记下工单号；企业不处理，再找下面的渠道。记下时间、次数和等待时长，用<a href="#/complain?c=${esc(c.id)}">投诉书生成器</a>一分钟写好材料。</p>
      <div class="reg">${regulatorsHtml(c.regulators)}</div>
      <div class="row" style="margin-top:12px"><a class="btn primary" href="#/complain?c=${esc(c.id)}">生成给${esc(c.name)}的投诉书</a></div>
    </section>

    <section class="section" aria-labelledby="h-fb">
      <h2 id="h-fb">帮下一个人少走弯路</h2>
      <div class="feedback">
        <a href="${esc(issueUrl('report.yml', { title: `[实测] ${c.name}`, company: c.name }))}" target="_blank" rel="noopener"><strong>我刚打过，反馈结果</strong><span>转没转到、按了什么、说了什么</span></a>
        <a href="${esc(issueUrl('wrong-info.yml', { title: `[纠错] ${c.name}`, company: c.name }))}" target="_blank" rel="noopener"><strong>号码有误 / 发现假冒号码</strong><span>我们会优先处理</span></a>
      </div>
      <p class="basis">也可以直接<a href="${esc(REPO_URL)}/edit/main/data/companies/${esc(c.id)}.yaml" target="_blank" rel="noopener">在 GitHub 上修改这条数据</a>。</p>
    </section>
  `;
}

// ---------------------------------------------------------------- 通话小抄
async function openCheat(id, idx) {
  const c = state.byId.get(id);
  if (!c) return;
  const h = c.hotlines[idx] || c.hotlines[0];
  const { steps } = phoneSteps(c);
  state.lastFocus = document.activeElement;
  $cheat.innerHTML = `<div class="cheat-inner">
    <div class="cheat-top">
      <span class="who" id="cheatTitle">${esc(c.name)} · 通话小抄</span>
      <button class="cheat-close" type="button" data-close aria-label="关闭小抄">${icon('close')}</button>
    </div>
    <div class="cheat-num">${esc(h.number)}</div>
    <a class="dial" href="tel:${esc(h.tel)}">${icon('phone')}拨打 ${esc(h.label)}</a>
    <ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="fallback">还是转不了：记下现在的时间、说了几次「人工」、等了多久，回来用投诉书生成器写材料。</p>
    <p class="awake" id="awake"></p>
  </div>`;
  $cheat.hidden = false;
  document.body.style.overflow = 'hidden';
  $cheat.querySelector('[data-close]').focus();
  try {
    if ('wakeLock' in navigator) {
      state.wakeLock = await navigator.wakeLock.request('screen');
      const a = document.getElementById('awake');
      if (a) a.textContent = '已保持屏幕常亮，方便边打电话边看。';
    }
  } catch {
    /* 不支持或被拒绝时忽略 */
  }
}

function closeCheat() {
  if ($cheat.hidden) return;
  $cheat.hidden = true;
  $cheat.innerHTML = '';
  document.body.style.overflow = '';
  if (state.wakeLock) {
    state.wakeLock.release().catch(() => {});
    state.wakeLock = null;
  }
  if (state.lastFocus && document.contains(state.lastFocus)) state.lastFocus.focus();
}

// ---------------------------------------------------------------- 秘籍
function renderGuide() {
  setTitle('通用转人工秘籍');
  setNav('guide');
  $main.innerHTML = `<article class="prose">
    <h1>通用转人工秘籍</h1>
    <p class="lead">所有方法都来自公开报道和实测，文末列出处。菜单随时会变，没有万能按键；下面是目前最管用的思路。</p>

    <h2>打电话：五个办法</h2>
    <div class="panel"><ol class="steps">
      <li>直接说 <span class="say">「人工服务」</span>。被劝「智能客服也能办」时，<strong>再说一次</strong>。两家媒体 2026 年实测：多数银行说 2～3 次就能转接。</li>
      <li>先把 <strong>订单号、卡号后四位、身份证</strong> 准备好。验证身份的环节往往绕不过去，卡在这一步最耽误时间。</li>
      <li>被转进按键菜单时，<strong>把菜单听完</strong>。实测中，滴滴的人工入口藏在「返回请按 *」之后，拼多多的藏在「结束请挂机」之后，都要按 <span class="kbd">0</span>。</li>
      <li>试试 <strong>不说话、不按键</strong>：北京银行等少数企业会主动报出人工选项。但招商银行实测中，连续几次不操作会被挂断，要看情况。</li>
      <li>涉及 <strong>盗刷、资金冻结、人身安全</strong>，第一句话就说清楚。新国标要求这类场景优先转人工。</li>
    </ol></div>

    <h2>在线客服 / App</h2>
    <div class="panel"><ol class="steps">
      <li>从 <strong>订单详情页</strong> 进客服，而不是首页。系统会带上订单信息，更容易被当成具体问题处理。</li>
      <li>直接发 <span class="say">「转人工」</span> 或 <span class="say">「人工客服」</span>，同时写明诉求关键词，比如「退款」「投诉」。</li>
      <li>智能客服答应的价格、退款、赔偿，<strong>要求人工确认并截图</strong>。新国标要求这类事项由人工确认，企业也要对智能客服的答复负责。</li>
    </ol></div>

    <h2>家里的老人</h2>
    <div class="panel"><ul>
      <li>三大运营商：<strong>实名登记、满 65 周岁</strong>的用户用本人号码拨打 10086 / 10010 / 10000，可以一键进入人工，不用听语音菜单。</li>
      <li>部分银行有老年客户通道，比如兴业银行实测中，老年客户说「帮助」或「人工」即可。新国标也要求老年、残障等特殊群体优先接入人工。</li>
      <li>用本站的 <strong>「通话小抄」</strong>：大字显示号码和步骤，打电话时放在手边看，还能保持屏幕常亮。右上角 <span class="kbd">AA</span> 可以切换大字模式。</li>
    </ul></div>

    <h2>新国标说了什么</h2>
    <div class="panel">
      <p><strong>GB/T 47746—2026《顾客联络服务 人工与智能客户服务协同要求》</strong>，市场监管总局（国家标准委）2026 年 8 月发布，9 月 1 日起实施。要点：</p>
      <ul>
        <li>转人工入口要清晰、醒目，不能层层隐藏；支持关键词、菜单、按键、语音等多种切换方式。</li>
        <li>复杂问题、涉及人身财产安全的问题、用户明确要求时，应转人工；智能客服多次交互失败、识别到用户负面情绪时，应自动转人工。</li>
        <li>转接时要同步客户信息和历史记录，<strong>不能让你把问题再说一遍</strong>。</li>
        <li>涉及价格、折扣、退款、赔偿等事项，最终确认应由人工完成；企业要对智能客服的答复内容负责。</li>
        <li>老年、残障等特殊群体优先接入人工。</li>
      </ul>
      <p style="margin-top:10px"><small>它是推荐性国家标准，本身不是处罚依据，但给行业划了服务底线。投诉时可以引用它，配合下面的法律条文。</small></p>
    </div>

    <h2>转不了怎么办</h2>
    <div class="panel"><ol class="steps">
      <li><strong>留证据</strong>：通话记录截图（能看到时间和时长）、聊天记录截图、工单号。</li>
      <li><strong>先找企业</strong>：通过企业官方投诉渠道提出，记下投诉编号。</li>
      <li><strong>再找监管</strong>：银行保险找 12378，支付机构找 12363，运营商找工信部电信用户申诉受理中心，快递找 12305，航空找 12326，网约车找 12328，其他消费纠纷找 12315，不知道找谁就打 12345。</li>
      <li>用 <a href="#/complain">投诉书生成器</a> 把经过、诉求和依据一次写清楚，复制粘贴即可。</li>
    </ol>
    <p class="basis">可引用的依据：${esc(LAWS.consumer.title)}（${esc(LAWS.consumer.text)}）；电商、外卖、出行平台还可以引用${esc(LAWS.ecommerce.title)}。</p>
    </div>

    <h2>防骗：假客服比机器人更危险</h2>
    ${FRAUD_HTML}

    <h2>出处</h2>
    <ol class="sources">
      <li>新京报《「转人工客服」闯关记》，2026-09-09（2026 年 9 月 4—6 日实测近 30 家平台和机构）：<a href="https://news.qq.com/rain/a/20260909A04K8J00" target="_blank" rel="noopener">news.qq.com</a></li>
      <li>凤凰WEEKLY财经，实测 10 家银行电话客服转人工，2026-03：<a href="https://finance.sina.com.cn/wm/2026-03-07/doc-inhqcipv5499286.shtml" target="_blank" rel="noopener">finance.sina.com.cn</a></li>
      <li>我国首个 AI 客服协同国标 9 月 1 日实施（标准号、发布与实施日期、特殊群体优先、企业对智能客服回复负责）：<a href="https://www.sohu.com/a/1065411209_114838" target="_blank" rel="noopener">sohu.com</a></li>
      <li>新华网《顾客联络服务 人工与智能客户服务协同要求》实施，2026-09-02（自动转人工条件、不得要求重复陈述）：<a href="https://www.news.cn/20260902/328e49d1d06649a0acdf27f90ce13232/c.html" target="_blank" rel="noopener">news.cn</a></li>
      <li>中新网《AI 客服「转人工」难？「新国标」来了》，2026-08-31（价格退款赔偿由人工确认、维权途径）：<a href="https://www.chinanews.com.cn/sh/2026/08-31/10686980.shtml" target="_blank" rel="noopener">chinanews.com.cn</a></li>
      <li>工信部：65 岁以上老人拨打三大运营商客服可一键进入人工服务，2020-12：<a href="https://www.thepaper.cn/newsDetail_forward_10551727" target="_blank" rel="noopener">thepaper.cn</a></li>
      <li>《消费者权益保护法实施条例》全文：<a href="${esc(LAWS.consumer.url)}" target="_blank" rel="noopener">mee.gov.cn</a>；《电子商务法》第五十九条：<a href="${esc(LAWS.ecommerce.url)}" target="_blank" rel="noopener">cac.gov.cn</a></li>
    </ol>
  </article>`;
}

// ---------------------------------------------------------------- 投诉书
function pad(n) {
  return String(n).padStart(2, '0');
}
function nowLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function findCompany(name) {
  const n = normalize(name);
  if (!n) return null;
  return state.data.companies.find((c) => c.keys.some((k) => normalize(k.t) === n)) || null;
}

function renderComplain(params) {
  setTitle('投诉书生成器');
  setNav('complain');
  const pre = params.get('c') ? state.byId.get(params.get('c')) : null;
  const { categories, companies } = state.data;

  $main.innerHTML = `<article class="prose">
    <h1>投诉书生成器</h1>
    <p class="lead">填几项，自动写好「事实经过 + 诉求 + 依据 + 证据清单」，复制去企业投诉渠道或 12315 等平台粘贴。</p>
    <p class="privacy">${icon('shield')}所有内容只在你的浏览器里生成，不会上传到任何地方。</p>

    <form class="form" id="cform" autocomplete="off" onsubmit="return false">
      <div class="grid-2">
        <div class="field">
          <label for="f-company">投诉哪家企业</label>
          <input id="f-company" list="co-list" value="${esc(pre ? pre.name : '')}" placeholder="如 招商银行">
          <datalist id="co-list">${companies.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
        </div>
        <div class="field">
          <label for="f-cat">行业 <span class="help">决定引用哪些条文、去哪投诉</span></label>
          <select id="f-cat">${categories.map((c) => `<option value="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>
        </div>
      </div>

      <div class="field">
        <span class="lbl">通过什么渠道联系的</span>
        <div class="seg" role="radiogroup">
          ${Object.entries(COMPLAIN_CHANNELS)
            .map(([k, v], i) => `<label><input type="radio" name="channel" value="${k}" ${i === 0 ? 'checked' : ''}>${esc(v)}</label>`)
            .join('')}
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-contact">号码或入口 <span class="help">如 95555、App 订单页</span></label>
          <input id="f-contact" value="${esc(pre?.hotlines[0]?.number || '')}">
        </div>
        <div class="field">
          <label for="f-when">什么时候</label>
          <input id="f-when" type="datetime-local" value="${nowLocal()}">
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-attempts">要求转人工几次</label>
          <input id="f-attempts" type="number" min="0" max="99" inputmode="numeric" value="3">
        </div>
        <div class="field">
          <label for="f-minutes">一共等了多少分钟</label>
          <input id="f-minutes" type="number" min="0" max="999" inputmode="numeric" value="10">
        </div>
      </div>

      <div class="field">
        <label for="f-outcome">结果</label>
        <select id="f-outcome">${Object.entries(OUTCOMES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      </div>

      <div class="field">
        <label for="f-issue">要办的事</label>
        <textarea id="f-issue" placeholder="如：信用卡被重复扣款 299 元，需要退回"></textarea>
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="f-order">订单号 / 业务编号 <span class="help">选填</span></label>
          <input id="f-order">
        </div>
        <div class="field">
          <label for="f-demand">你的诉求</label>
          <input id="f-demand" placeholder="如：退回重复扣款 299 元">
        </div>
      </div>
      <div class="field">
        <label for="f-promise">智能客服答应过什么？ <span class="help">选填，如「48 小时内退款」</span></label>
        <input id="f-promise">
      </div>
      <div class="grid-2">
        <div class="field"><label for="f-name">你的姓名 <span class="help">选填</span></label><input id="f-name"></div>
        <div class="field"><label for="f-phone">联系电话 <span class="help">选填</span></label><input id="f-phone" inputmode="tel"></div>
      </div>
    </form>

    <h2>生成结果</h2>
    <textarea class="output" id="out" readonly aria-label="生成的投诉书"></textarea>
    <div class="row" style="margin-top:10px">
      <button class="btn primary" type="button" id="copyFull">${icon('copy')}复制全文</button>
      <button class="btn" type="button" id="copyShort">${icon('copy')}复制简短版</button>
    </div>
    <p class="basis">简短版适合字数有限的表单。提交前请核对事实，不要夸大。</p>

    <h2>提交到哪里</h2>
    <p>先向企业官方投诉渠道提交并记下编号；企业不处理，再找：</p>
    <div class="reg" id="regs"></div>
  </article>`;

  const $f = (id) => document.getElementById(id);
  const $cat = $f('f-cat');
  if (pre) $cat.value = pre.category;

  let result = null;
  const update = () => {
    const matched = findCompany($f('f-company').value);
    const input = {
      company: $f('f-company').value,
      category: $cat.value,
      channel: document.querySelector('input[name="channel"]:checked').value,
      contact: $f('f-contact').value,
      when: $f('f-when').value,
      attempts: $f('f-attempts').value,
      minutes: $f('f-minutes').value,
      outcome: $f('f-outcome').value,
      issue: $f('f-issue').value,
      orderId: $f('f-order').value,
      demand: $f('f-demand').value,
      aiPromise: $f('f-promise').value,
      name: $f('f-name').value,
      phone: $f('f-phone').value,
    };
    result = generateComplaint(input);
    $f('out').value = result.body;
    const regIds = matched ? matched.regulators : state.catById[$cat.value].regulators;
    $f('regs').innerHTML = regulatorsHtml(regIds);
  };

  $f('f-company').addEventListener('change', () => {
    const m = findCompany($f('f-company').value);
    if (m) {
      $cat.value = m.category;
      if (!$f('f-contact').value && m.hotlines[0]) $f('f-contact').value = m.hotlines[0].number;
    }
    update();
  });
  $f('cform').addEventListener('input', update);
  $f('cform').addEventListener('change', update);
  $f('copyFull').addEventListener('click', () => copy(result.body));
  $f('copyShort').addEventListener('click', () => copy(result.short));
  update();
}

// ---------------------------------------------------------------- 关于
function renderAbout() {
  setTitle('关于');
  setNav('about');
  const s = state.data.stats;
  $main.innerHTML = `<article class="prose">
    <h1>关于转人工速查</h1>
    <p class="lead">一个开源、社区共同维护的「客服转人工」数据库。不卖广告，不收集数据，也不提供客服服务。</p>

    <div class="stat-grid">
      <div class="stat"><b>${s.companies}</b><span>收录企业</span></div>
      <div class="stat"><b>${s.withReports}</b><span>有实测记录的企业</span></div>
      <div class="stat"><b>${s.reports}</b><span>实测记录</span></div>
      <div class="stat"><b>${s.checkedHotlines}</b><span>已核对出处的号码</span></div>
    </div>

    <h2>为什么做这个</h2>
    <p>中国消费者协会发布的 2026 年上半年投诉热点中，AI 客服是其中之一：服务承诺和人工接入问题突出<a class="cite" href="https://www.chinanews.com.cn/cj/2026/08-05/10672180.shtml" target="_blank" rel="noopener">[1]</a>。新黄河 2026 年 8 月实测 20 家平台，转人工平均耗时 171 秒，最长 660 秒，6 家始终没接通<a class="cite" href="https://news.qq.com/rain/a/20260804A0DBEQ00" target="_blank" rel="noopener">[2]</a>。9 月 1 日，国家标准 GB/T 47746—2026 开始实施，要求转人工入口清晰、衔接顺畅<a class="cite" href="https://www.sohu.com/a/1065411209_114838" target="_blank" rel="noopener">[3]</a>。</p>
    <p>标准有了，但每家企业的菜单都不一样，还经常变。与其每个人都在语音菜单里绕一遍，不如把大家试出来的路径记下来，共享给下一个人。</p>

    <h2>数据怎么来的</h2>
    <ul>
      <li><strong>官方号码</strong>：来自企业官网或公开资料。标有「已核对出处」的，是维护者在出处页面核对过的，附日期和链接；没标的来自公开资料，尚未逐一核对。</li>
      <li><strong>实测记录</strong>：来自媒体实测报道和网友提交的亲测反馈，每条都有日期和出处链接。「接通后这样做」必须能在实测记录里找到依据；没有实测的企业，只展示行业通用方法，并明确标注。</li>
      <li><strong>投诉渠道和法条</strong>：来自监管部门官网和法律原文，附出处。</li>
    </ul>
    <p>所有数据都在 GitHub 仓库的 <code>data/</code> 目录里，是人能直接读懂的 YAML 文件，任何改动都公开可查。</p>

    <h2>怎么参与</h2>
    <ul>
      <li>打完电话，花一分钟<a href="${esc(issueUrl('report.yml', { title: '[实测] ' }))}" target="_blank" rel="noopener">提交实测反馈</a>：转没转到、说了什么、按了什么。</li>
      <li>发现号码有误或假冒号码，<a href="${esc(issueUrl('wrong-info.yml', { title: '[纠错] ' }))}" target="_blank" rel="noopener">马上告诉我们</a>。</li>
      <li>想收录新企业，<a href="${esc(issueUrl('new-company.yml', { title: '[新增] ' }))}" target="_blank" rel="noopener">提交新增申请</a>，或直接在仓库里加一个 YAML 文件发 PR。</li>
    </ul>
    <p><a class="btn" href="${esc(REPO_URL)}" target="_blank" rel="noopener">${icon('external')}GitHub 仓库</a></p>

    <h2>免责声明</h2>
    <p>本站信息仅供参考。客服号码与菜单可能随时调整，<strong>拨打前请以企业 App / 官网公布为准</strong>。本站与所列企业、监管部门均无关联，不代表任何机构提供服务。投诉书生成器只帮你整理文字，不构成法律意见。</p>

    <h2>开源协议</h2>
    <p>代码采用 MIT 协议，数据采用 CC BY-SA 4.0 协议。欢迎转载、改进和用在其他项目里，请注明出处并以相同协议共享数据。</p>
  </article>`;
}

function renderNotFound() {
  setTitle('没找到');
  setNav('');
  $main.innerHTML = `<div class="empty" style="margin-top:20px"><p>这个页面不存在。</p><p><a href="#/">回到首页</a></p></div>`;
}

// ---------------------------------------------------------------- 全局事件
document.addEventListener('click', (e) => {
  const cheatBtn = e.target.closest('[data-cheat]');
  if (cheatBtn) {
    openCheat(cheatBtn.dataset.cheat, Number(cheatBtn.dataset.hotline) || 0);
    return;
  }
  if (e.target.closest('[data-close]')) closeCheat();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCheat();
});
document.addEventListener('visibilitychange', async () => {
  // 切回页面时重新申请屏幕常亮（系统会在切走时自动释放）
  if (document.visibilityState === 'visible' && !$cheat.hidden && 'wakeLock' in navigator && (!state.wakeLock || state.wakeLock.released)) {
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      /* 忽略 */
    }
  }
});

const $big = document.getElementById('bigToggle');
$big.setAttribute('aria-pressed', String(document.documentElement.classList.contains('big')));
$big.addEventListener('click', () => {
  const on = document.documentElement.classList.toggle('big');
  $big.setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem('zrg-big', on ? '1' : '0');
  } catch {
    /* 隐私模式下忽略 */
  }
  toast(on ? '已切换到大字模式' : '已恢复标准字号');
});

window.addEventListener('hashchange', route);

async function boot() {
  try {
    const res = await fetch('data.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    state.data = await res.json();
  } catch (err) {
    $main.innerHTML = `<div class="empty" style="margin-top:20px"><p>数据加载失败，请检查网络后刷新。</p></div>`;
    console.error(err);
    return;
  }
  for (const c of state.data.companies) state.byId.set(c.id, c);
  for (const c of state.data.categories) {
    state.catById[c.id] = c;
    state.catName[c.id] = c.name;
  }
  for (const r of state.data.regulators) state.regById[r.id] = r;
  route();
}

boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
