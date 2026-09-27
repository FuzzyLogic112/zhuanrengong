import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateComplaint, formatDateTime, OUTCOMES } from '../site/lib/complaint.js';

const base = {
  company: '招商银行',
  category: 'bank',
  channel: 'phone',
  contact: '95555',
  when: '2026-09-27T10:05',
  attempts: '4',
  minutes: '12',
  outcome: 'redirected',
  issue: '信用卡被重复扣款 299 元。',
  demand: '退回重复扣款 299 元',
};

test('formatDateTime 转成中文日期', () => {
  assert.equal(formatDateTime('2026-09-27T10:05'), '2026 年 9 月 27 日 10:05');
  assert.equal(formatDateTime('2026-01-03'), '2026 年 1 月 3 日');
  assert.equal(formatDateTime(''), '');
});

test('全文包含事实、诉求、依据和证据清单', () => {
  const { body, title } = generateComplaint(base);
  assert.equal(title, '招商银行客服无法转接人工，问题得不到处理');
  assert.match(body, /2026 年 9 月 27 日 10:05，我通过客服热线 95555 联系招商银行/);
  assert.match(body, /先后 4 次明确要求转接人工客服，累计等待约 12 分钟/);
  assert.ok(body.includes(OUTCOMES.redirected));
  assert.match(body, /退回重复扣款 299 元。/);
  assert.match(body, /消费者权益保护法实施条例》第四十四条/);
  assert.match(body, /GB\/T 47746—2026/);
  assert.match(body, /四、证据材料/);
  // 句末标点不重复
  assert.ok(!body.includes('299 元。。'));
});

test('银行不引用电子商务法，电商/外卖/出行才引用', () => {
  assert.ok(!generateComplaint(base).body.includes('电子商务法'));
  for (const category of ['ecommerce', 'local', 'travel']) {
    assert.ok(generateComplaint({ ...base, category }).body.includes('《中华人民共和国电子商务法》第五十九条'));
  }
});

test('填了智能客服承诺时，增加兑现诉求', () => {
  const { body } = generateComplaint({ ...base, aiPromise: '48 小时内退款' });
  assert.match(body, /此前智能客服曾答复「48 小时内退款」/);
  assert.match(body, /3\. 请兑现智能客服作出的答复。/);
});

test('空表单也能生成带占位符的模板', () => {
  const { body, short } = generateComplaint({});
  assert.match(body, /【企业名称】/);
  assert.match(body, /【需要处理的问题】/);
  assert.match(body, /投诉人：【姓名】/);
  assert.ok(!body.includes('undefined') && !body.includes('NaN'));
  assert.ok(!short.includes('undefined') && !short.includes('NaN'));
});

test('在线渠道的写法', () => {
  const { body } = generateComplaint({ ...base, channel: 'online', contact: 'App 订单页' });
  assert.match(body, /通过在线客服（App 订单页）联系/);
});

test('简短版足够短', () => {
  const { short } = generateComplaint(base);
  assert.ok(short.length < 200, `简短版 ${short.length} 字`);
  assert.match(short, /^【招商银行无法转人工】/);
});
