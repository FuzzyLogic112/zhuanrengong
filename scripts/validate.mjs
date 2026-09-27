// 数据校验：错误会让 CI 失败，警告只提示。
// 所有提示都写成中文，方便贡献者看懂哪里要改。

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_RE = /^\+?[0-9][0-9 \-]{2,20}$/;
const URL_RE = /^https?:\/\/[^\s]+$/;

const CHANNELS = ['phone', 'online', 'app'];
const RESULTS = ['success', 'slow', 'fail'];

const COMPANY_KEYS = ['id', 'name', 'aliases', 'category', 'weight', 'website', 'updated', 'hotlines', 'steps', 'notes', 'reports', 'tips', 'regulators'];
const HOTLINE_KEYS = ['number', 'label', 'hours', 'source', 'checked'];
const REPORT_KEYS = ['date', 'channel', 'result', 'by', 'url', 'summary'];
const NOTE_KEYS = ['text', 'source'];
const CATEGORY_KEYS = ['id', 'name', 'icon', 'regulators', 'generic_phone', 'generic_online'];
const REGULATOR_KEYS = ['id', 'name', 'org', 'phone', 'web', 'also', 'scope', 'prereq', 'source'];

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isStrArr = (v) => Array.isArray(v) && v.every(isStr);

function validDate(s, today) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return '日期格式应为 YYYY-MM-DD（写成字符串，如 2026-09-27）';
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return '不是有效日期';
  if (s > today) return '日期不能晚于今天';
  return null;
}

function unknownKeys(obj, allowed, where, errors) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) errors.push(`${where}: 未知字段「${k}」（允许的字段：${allowed.join(', ')}）`);
  }
}

export function validateAll({ categories, regulators, companies }, today = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  const warnings = [];

  // ---- regulators ----
  const regIds = new Set();
  if (!Array.isArray(regulators)) errors.push('data/regulators.yaml: 顶层应是列表');
  else {
    regulators.forEach((r, i) => {
      const w = `data/regulators.yaml 第 ${i + 1} 项`;
      if (!r || typeof r !== 'object') return errors.push(`${w}: 应是对象`);
      unknownKeys(r, REGULATOR_KEYS, w, errors);
      if (!isStr(r.id) || !ID_RE.test(r.id)) errors.push(`${w}: id 只能用小写字母、数字和连字符`);
      else if (regIds.has(r.id)) errors.push(`${w}: id「${r.id}」重复`);
      else regIds.add(r.id);
      for (const k of ['name', 'org', 'scope', 'source']) if (!isStr(r[k])) errors.push(`${w}: 缺少 ${k}`);
      if (r.phone !== undefined && !(isStr(r.phone) && PHONE_RE.test(r.phone))) errors.push(`${w}: phone 格式不对（写成带引号的字符串）`);
      for (const k of ['web', 'source']) if (r[k] !== undefined && !URL_RE.test(r[k])) errors.push(`${w}: ${k} 应是 http(s) 链接`);
    });
  }

  // ---- categories ----
  const catIds = new Set();
  if (!Array.isArray(categories)) errors.push('data/categories.yaml: 顶层应是列表');
  else {
    categories.forEach((c, i) => {
      const w = `data/categories.yaml 第 ${i + 1} 项`;
      if (!c || typeof c !== 'object') return errors.push(`${w}: 应是对象`);
      unknownKeys(c, CATEGORY_KEYS, w, errors);
      if (!isStr(c.id) || !ID_RE.test(c.id)) errors.push(`${w}: id 格式不对`);
      else if (catIds.has(c.id)) errors.push(`${w}: id「${c.id}」重复`);
      else catIds.add(c.id);
      if (!isStr(c.name)) errors.push(`${w}: 缺少 name`);
      if (!isStr(c.icon)) errors.push(`${w}: 缺少 icon`);
      if (!Array.isArray(c.regulators) || !c.regulators.length) errors.push(`${w}: regulators 至少要有一个`);
      else for (const r of c.regulators) if (!regIds.has(r)) errors.push(`${w}: regulators 里的「${r}」在 regulators.yaml 中不存在`);
      if (!isStrArr(c.generic_phone) || !c.generic_phone.length) errors.push(`${w}: generic_phone 应是非空文字列表`);
      if (c.generic_online !== undefined && !isStrArr(c.generic_online)) errors.push(`${w}: generic_online 应是文字列表`);
    });
  }

  // ---- companies ----
  const ids = new Set();
  const aliasOwner = new Map();
  for (const { file, stem, data: c } of companies) {
    const w = file;
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      errors.push(`${w}: 文件内容应是一个对象`);
      continue;
    }
    unknownKeys(c, COMPANY_KEYS, w, errors);

    if (!isStr(c.id) || !ID_RE.test(c.id)) errors.push(`${w}: id 只能用小写字母、数字和连字符`);
    else {
      if (c.id !== stem) errors.push(`${w}: id「${c.id}」必须与文件名一致（应为 ${stem}）`);
      if (ids.has(c.id)) errors.push(`${w}: id「${c.id}」重复`);
      ids.add(c.id);
    }
    if (!isStr(c.name)) errors.push(`${w}: 缺少 name`);
    if (c.aliases !== undefined && !isStrArr(c.aliases)) errors.push(`${w}: aliases 应是文字列表`);
    if (!catIds.has(c.category)) errors.push(`${w}: category「${c.category}」不存在，可选：${[...catIds].join(', ')}`);
    if (c.weight !== undefined && !(Number.isInteger(c.weight) && c.weight >= 0 && c.weight <= 1000)) errors.push(`${w}: weight 应是 0～1000 的整数（越大越靠前）`);
    if (c.website !== undefined && !URL_RE.test(c.website)) errors.push(`${w}: website 应是 http(s) 链接`);
    const du = validDate(c.updated, today);
    if (du) errors.push(`${w}: updated ${du}`);

    for (const a of [c.name, ...(Array.isArray(c.aliases) ? c.aliases : [])]) {
      if (!isStr(a)) continue;
      const key = a.toLowerCase();
      const owner = aliasOwner.get(key);
      if (owner && owner !== c.id) warnings.push(`${w}: 名称/别名「${a}」与 ${owner} 重复，搜索时两家都会出现`);
      else aliasOwner.set(key, c.id);
    }

    // hotlines
    if (!Array.isArray(c.hotlines)) errors.push(`${w}: hotlines 应是列表（没有号码就写 hotlines: []）`);
    else {
      if (!c.hotlines.length) warnings.push(`${w}: 还没有热线号码，欢迎补充官方号码`);
      c.hotlines.forEach((h, i) => {
        const hw = `${w} hotlines 第 ${i + 1} 个`;
        if (!h || typeof h !== 'object') return errors.push(`${hw}: 应是对象`);
        unknownKeys(h, HOTLINE_KEYS, hw, errors);
        if (typeof h.number !== 'string') errors.push(`${hw}: number 要写成带引号的字符串，如 "95588"`);
        else if (!PHONE_RE.test(h.number)) errors.push(`${hw}: number「${h.number}」格式不对，只能包含数字、空格、连字符和开头的 +`);
        if (!isStr(h.label)) errors.push(`${hw}: 缺少 label（如「客服热线」）`);
        if (h.hours !== undefined && !isStr(h.hours)) errors.push(`${hw}: hours 应是文字`);
        if (h.source !== undefined && !URL_RE.test(h.source)) errors.push(`${hw}: source 应是 http(s) 链接`);
        if (h.checked !== undefined) {
          const dc = validDate(h.checked, today);
          if (dc) errors.push(`${hw}: checked ${dc}`);
          if (!h.source) errors.push(`${hw}: 写了 checked 就必须写 source（在哪里核对的）`);
        }
      });
    }

    // reports
    const reports = c.reports ?? [];
    if (!Array.isArray(reports)) errors.push(`${w}: reports 应是列表`);
    else
      reports.forEach((r, i) => {
        const rw = `${w} reports 第 ${i + 1} 条`;
        if (!r || typeof r !== 'object') return errors.push(`${rw}: 应是对象`);
        unknownKeys(r, REPORT_KEYS, rw, errors);
        const dr = validDate(r.date, today);
        if (dr) errors.push(`${rw}: date ${dr}`);
        if (!CHANNELS.includes(r.channel)) errors.push(`${rw}: channel 只能是 ${CHANNELS.join(' / ')}`);
        if (!RESULTS.includes(r.result)) errors.push(`${rw}: result 只能是 ${RESULTS.join(' / ')}`);
        if (!isStr(r.by)) errors.push(`${rw}: 缺少 by（谁测的，如「新京报」或 GitHub 用户名）`);
        if (!isStr(r.url) || !URL_RE.test(r.url)) errors.push(`${rw}: 缺少出处链接 url（媒体报道或 GitHub Issue）`);
        if (!isStr(r.summary)) errors.push(`${rw}: 缺少 summary`);
        else if (r.summary.length > 200) warnings.push(`${rw}: summary 超过 200 字，建议精简`);
      });

    // notes
    if (c.notes !== undefined) {
      if (!Array.isArray(c.notes)) errors.push(`${w}: notes 应是列表`);
      else
        c.notes.forEach((n, i) => {
          const nw = `${w} notes 第 ${i + 1} 条`;
          if (!n || typeof n !== 'object') return errors.push(`${nw}: 应是对象`);
          unknownKeys(n, NOTE_KEYS, nw, errors);
          if (!isStr(n.text)) errors.push(`${nw}: 缺少 text`);
          if (!isStr(n.source) || !URL_RE.test(n.source)) errors.push(`${nw}: 缺少出处链接 source`);
        });
    }

    // steps：必须有依据
    if (c.steps !== undefined) {
      if (!c.steps || typeof c.steps !== 'object' || Array.isArray(c.steps)) errors.push(`${w}: steps 应是对象，如 steps: { phone: [...] }`);
      else {
        for (const [ch, arr] of Object.entries(c.steps)) {
          if (!CHANNELS.includes(ch)) errors.push(`${w}: steps 下只能有 ${CHANNELS.join(' / ')}，不能有「${ch}」`);
          if (!isStrArr(arr) || !arr.length) errors.push(`${w}: steps.${ch} 应是非空文字列表`);
          if (Array.isArray(reports) && !reports.some((r) => r && r.channel === ch))
            errors.push(`${w}: 写了 steps.${ch}，但 reports 里没有 channel: ${ch} 的实测记录作依据`);
        }
      }
    }

    if (c.tips !== undefined && !isStrArr(c.tips)) errors.push(`${w}: tips 应是文字列表`);
    if (c.regulators !== undefined) {
      if (!Array.isArray(c.regulators) || !c.regulators.length) errors.push(`${w}: regulators 应是非空列表`);
      else for (const r of c.regulators) if (!regIds.has(r)) errors.push(`${w}: regulators 里的「${r}」不存在`);
    }
  }

  return { errors, warnings };
}
