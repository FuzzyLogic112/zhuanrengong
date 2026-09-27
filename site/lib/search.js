// 搜索：支持中文名、别名、全拼、拼音首字母、电话号码。
// 纯函数，浏览器和 Node 测试共用。

export function normalize(q) {
  return String(q ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-·•/／、，,。.()（）]/g, '');
}

const isAlnum = (s) => /^[a-z0-9]+$/.test(s);

export function scoreCompany(company, query, categoryName = '') {
  const q = normalize(query);
  if (!q) return 0;
  let best = 0;
  const bump = (s) => {
    if (s > best) best = s;
  };

  company.keys.forEach((key, i) => {
    const primary = i === 0 ? 5 : 0;
    const t = normalize(key.t);
    if (t === q) bump(100 + primary);
    else if (t.startsWith(q)) bump(80 + primary);
    else if (t.includes(q)) bump(60 + primary);

    if (isAlnum(q)) {
      if (key.py) {
        if (key.py === q) bump(90 + primary);
        else if (key.py.startsWith(q)) bump(70 + primary);
        else if (q.length >= 3 && key.py.includes(q)) bump(40 + primary);
      }
      if (key.pyi && q.length >= 2) {
        if (key.pyi === q) bump(85 + primary);
        else if (key.pyi.startsWith(q)) bump(65 + primary);
      }
    }
  });

  const qDigits = q.replace(/^\+/, '');
  if (/^\d{3,}$/.test(qDigits)) {
    for (const h of company.hotlines || []) {
      const tel = String(h.tel).replace(/^\+/, '');
      if (tel === qDigits) bump(100);
      else if (tel.startsWith(qDigits)) bump(75);
      else if (tel.includes(qDigits)) bump(50);
    }
  }

  if (categoryName && normalize(categoryName).includes(q)) bump(20);
  return best;
}

export function search(companies, query, categoryNameById = {}) {
  const q = normalize(query);
  if (!q) return companies.slice();
  return companies
    .map((c, idx) => ({ c, idx, s: scoreCompany(c, q, categoryNameById[c.category]) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.idx - b.idx)
    .map((x) => x.c);
}
