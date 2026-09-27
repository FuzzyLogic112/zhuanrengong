import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, enrich } from '../scripts/build.mjs';
import { validateAll } from '../scripts/validate.mjs';

const TODAY = '2026-09-27';
const raw = loadData();

test('仓库里的真实数据全部通过校验', () => {
  const { errors } = validateAll(raw, TODAY);
  assert.deepEqual(errors, []);
});

test('每家企业的行业和投诉渠道都能对上', () => {
  const data = enrich(raw);
  const regIds = new Set(data.regulators.map((r) => r.id));
  for (const c of data.companies) {
    assert.ok(c.regulators.length > 0, c.id);
    for (const r of c.regulators) assert.ok(regIds.has(r), `${c.id} → ${r}`);
  }
});

test('写了 steps 的企业都有同渠道的实测依据', () => {
  for (const { data: c } of raw.companies) {
    for (const ch of Object.keys(c.steps || {})) {
      assert.ok((c.reports || []).some((r) => r.channel === ch), `${c.id} 的 steps.${ch} 缺少依据`);
    }
  }
});

// 用最小数据集构造各种错误
function mini(company) {
  return {
    regulators: [{ id: 'samr', name: '12315', org: '市场监管总局', scope: '消费纠纷', source: 'https://www.12315.cn' }],
    categories: [{ id: 'ecommerce', name: '电商', icon: '🛒', regulators: ['samr'], generic_phone: ['说人工服务'] }],
    companies: [{ file: `data/companies/${company.id}.yaml`, stem: company.id, data: company }],
  };
}
const ok = { id: 'demo', name: '示例', category: 'ecommerce', updated: '2026-09-01', hotlines: [{ number: '95000', label: '客服热线' }] };
const errorsOf = (c) => validateAll(mini(c), TODAY).errors;

test('合法的最小数据通过', () => {
  assert.deepEqual(errorsOf(ok), []);
});

test('能发现常见错误', () => {
  const cases = [
    [{ ...ok, id: 'Demo' }, /id 只能用/],
    [{ ...ok, category: 'nope' }, /category「nope」不存在/],
    [{ ...ok, hotlines: [{ number: 95000, label: '客服' }] }, /带引号的字符串/],
    [{ ...ok, hotlines: [{ number: '95abc', label: '客服' }] }, /格式不对/],
    [{ ...ok, hotlines: [{ number: '95000', label: '客服', checked: '2026-09-01' }] }, /必须写 source/],
    [{ ...ok, updated: '2027-01-01' }, /不能晚于今天/],
    [{ ...ok, updated: '2026-02-30' }, /不是有效日期/],
    [{ ...ok, phone: '123' }, /未知字段「phone」/],
    [{ ...ok, steps: { phone: ['按 0'] } }, /没有 channel: phone 的实测记录/],
    [{ ...ok, reports: [{ date: '2026-09-01', channel: 'phone', result: 'maybe', by: '我', url: 'https://x.cn', summary: '…' }] }, /result 只能是/],
    [{ ...ok, reports: [{ date: '2026-09-01', channel: 'phone', result: 'fail', by: '我', summary: '没转到' }] }, /缺少出处链接/],
    [{ ...ok, regulators: ['nope'] }, /「nope」不存在/],
    [{ ...ok, weight: -1 }, /weight/],
  ];
  for (const [c, re] of cases) {
    const errs = errorsOf(c);
    assert.ok(errs.some((e) => re.test(e)), `期望 ${re}，实际：${errs.join(' | ') || '无错误'}`);
  }
  const mismatch = mini(ok);
  mismatch.companies[0].stem = 'other';
  assert.ok(validateAll(mismatch, TODAY).errors.some((e) => /必须与文件名一致/.test(e)));
});

test('enrich 生成拨号用的纯数字号码、状态和过期标记', () => {
  const c = {
    ...ok,
    hotlines: [{ number: '400-000 0999', label: '客服' }],
    reports: [
      { date: '2024-01-01', channel: 'phone', result: 'fail', by: 'a', url: 'https://a.cn', summary: '旧' },
      { date: '2025-06-01', channel: 'phone', result: 'slow', by: 'b', url: 'https://b.cn', summary: '新' },
    ],
  };
  const d = enrich(mini(c), new Date('2026-09-27'));
  const out = d.companies[0];
  assert.equal(out.hotlines[0].tel, '4000000999');
  assert.equal(out.status, 'slow');
  assert.equal(out.reports[0].summary, '新');
  assert.equal(out.stale, true);
  assert.deepEqual(out.regulators, ['samr']);
});
