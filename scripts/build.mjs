#!/usr/bin/env node
// 读取 data/ 下的 YAML，校验后生成 dist/（静态站点 + data.json）。
// 用法：node scripts/build.mjs          构建到 dist/
//       node scripts/build.mjs --check  只校验数据，不输出

import { readFileSync, readdirSync, mkdirSync, rmSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { pinyin } from 'pinyin-pro';
import { validateAll } from './validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const SITE = join(ROOT, 'site');
const DIST = join(ROOT, 'dist');

function loadYaml(path) {
  try {
    return parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path.replace(ROOT + '/', '')}: YAML 解析失败 —— ${err.message}`);
  }
}

export function loadData() {
  const categories = loadYaml(join(DATA, 'categories.yaml'));
  const regulators = loadYaml(join(DATA, 'regulators.yaml'));
  const dir = join(DATA, 'companies');
  const companies = readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .map((f) => ({ file: `data/companies/${f}`, stem: basename(f).replace(/\.ya?ml$/, ''), data: loadYaml(join(dir, f)) }));
  return { categories, regulators, companies };
}

function toPinyin(text) {
  const syl = pinyin(text, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
  const full = syl.join('').toLowerCase().replace(/[^a-z0-9]/g, '');
  const initials = pinyin(text, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' })
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return { py: full, pyi: initials };
}

export function searchKeys(company) {
  const texts = [company.name, ...(company.aliases || [])];
  const keys = [];
  for (const t of texts) {
    const hasZh = /[一-鿿]/.test(t);
    const { py, pyi } = hasZh ? toPinyin(t) : { py: '', pyi: '' };
    keys.push({ t: t.toLowerCase(), py, pyi });
  }
  return keys;
}

export const digits = (s) => String(s).replace(/[^0-9+]/g, '');

export function enrich({ categories, regulators, companies }, now = new Date()) {
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const out = companies.map(({ data: c }) => {
    const reports = [...(c.reports || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    const latest = reports[0];
    const ageDays = latest ? Math.round((now - new Date(latest.date)) / 86400000) : null;
    return {
      ...c,
      aliases: c.aliases || [],
      hotlines: (c.hotlines || []).map((h) => ({ ...h, tel: digits(h.number) })),
      reports,
      regulators: c.regulators || catById[c.category].regulators,
      status: latest ? latest.result : 'unknown',
      latestReport: latest ? latest.date : null,
      stale: ageDays !== null && ageDays > 365,
      keys: searchKeys(c),
    };
  });
  // 排序：常用程度（weight）高的在前，其次有实测的在前，最后按名称拼音
  out.sort((a, b) => {
    if ((b.weight || 0) !== (a.weight || 0)) return (b.weight || 0) - (a.weight || 0);
    if (!!a.latestReport !== !!b.latestReport) return a.latestReport ? -1 : 1;
    return a.keys[0].py.localeCompare(b.keys[0].py);
  });
  return {
    generatedAt: now.toISOString().slice(0, 10),
    stats: {
      companies: out.length,
      withReports: out.filter((c) => c.reports.length).length,
      reports: out.reduce((n, c) => n + c.reports.length, 0),
      checkedHotlines: out.reduce((n, c) => n + c.hotlines.filter((h) => h.checked).length, 0),
    },
    categories,
    regulators,
    companies: out,
  };
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const raw = loadData();
  const { errors, warnings } = validateAll(raw);
  for (const w of warnings) console.warn(`⚠️  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`❌ ${e}`);
    console.error(`\n数据校验失败：${errors.length} 个错误。`);
    process.exit(1);
  }
  const data = enrich(raw);
  console.log(`✅ 数据校验通过：${data.stats.companies} 家企业，${data.stats.reports} 条实测记录，${data.stats.checkedHotlines} 个号码已核对出处。`);
  if (checkOnly) return;

  if (existsSync(DIST)) rmSync(DIST, { recursive: true });
  mkdirSync(DIST, { recursive: true });
  cpSync(SITE, DIST, { recursive: true });
  const json = JSON.stringify(data);
  writeFileSync(join(DIST, 'data.json'), json);

  // Service Worker 的缓存版本随内容变化，保证更新后离线缓存也会刷新
  const hash = createHash('sha256');
  hash.update(json);
  for (const f of readdirSync(SITE, { recursive: true }).sort()) {
    const p = join(SITE, String(f));
    try { hash.update(readFileSync(p)); } catch { /* 目录 */ }
  }
  const version = hash.digest('hex').slice(0, 12);
  const swPath = join(DIST, 'sw.js');
  writeFileSync(swPath, readFileSync(swPath, 'utf8').replace('__CACHE_VERSION__', version));
  console.log(`📦 已输出到 dist/（缓存版本 ${version}）`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
