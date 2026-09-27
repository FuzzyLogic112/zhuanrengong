import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, enrich } from '../scripts/build.mjs';
import { search, normalize, scoreCompany } from '../site/lib/search.js';

const data = enrich(loadData(), new Date('2026-09-27T00:00:00Z'));
const catName = Object.fromEntries(data.categories.map((c) => [c.id, c.name]));
const first = (q) => search(data.companies, q, catName)[0]?.id;

test('normalize 去掉空格和分隔符并转小写', () => {
  assert.equal(normalize('  400-000 0999 '), '4000000999');
  assert.equal(normalize('ZSYH'), 'zsyh');
  assert.equal(normalize('淘宝 / 天猫'), '淘宝天猫');
});

test('按中文名、简称搜索', () => {
  assert.equal(first('招商银行'), 'cmb');
  assert.equal(first('招行'), 'cmb');
  assert.equal(first('建行'), 'ccb');
  assert.equal(first('大众点评'), 'meituan');
});

test('按拼音全拼和首字母搜索', () => {
  assert.equal(first('zsyh'), 'cmb');
  assert.equal(first('zhaoshang'), 'cmb');
  assert.equal(first('meituan'), 'meituan');
  assert.equal(first('sf'), 'sf');
});

test('按电话号码搜索，忽略连字符', () => {
  assert.equal(first('95555'), 'cmb');
  assert.equal(first('10086'), 'cmcc');
  assert.equal(first('1010-0011'), 'meituan');
  assert.equal(first('10100011'), 'meituan');
});

test('同号码的多家企业都能搜到', () => {
  const ids = search(data.companies, '95511', catName).map((c) => c.id);
  assert.ok(ids.includes('pingan') && ids.includes('pingan-bank'));
});

test('按行业名搜索会返回该行业企业', () => {
  const res = search(data.companies, '快递', catName);
  assert.ok(res.length >= 5);
  assert.ok(res.every((c) => c.category === 'express' || c.keys.some((k) => k.t.includes('快递'))));
});

test('空查询返回全部，查不到返回空', () => {
  assert.equal(search(data.companies, '   ', catName).length, data.companies.length);
  assert.equal(search(data.companies, '完全不存在的公司xyz', catName).length, 0);
});

test('短数字不按号码乱匹配', () => {
  const c = data.companies.find((x) => x.id === 'cmb');
  assert.equal(scoreCompany(c, '55'), 0);
});
