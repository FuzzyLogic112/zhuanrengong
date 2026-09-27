// 投诉书生成：纯函数，所有内容只在浏览器本地生成，不上传。

export const OUTCOMES = {
  never: '始终没有接通人工客服',
  redirected: '系统反复把我引导回智能客服或自助服务，始终没有接通人工',
  hungup: '在等待或操作过程中被系统挂断，没有接通人工',
  unresolved: '最终接通了人工客服，但问题至今没有得到处理',
};

export const CHANNELS = {
  phone: '客服热线',
  online: '在线客服',
  app: 'App 内客服',
};

// 适用《电子商务法》的行业
const ECOMMERCE_CATEGORIES = new Set(['ecommerce', 'local', 'travel']);

export const LAWS = {
  consumer: {
    title: '《中华人民共和国消费者权益保护法实施条例》第四十四条',
    text: '经营者应当建立便捷、高效的投诉处理机制，及时解决消费争议。',
    url: 'https://www.mee.gov.cn/zcwj/gwywj/202403/t20240320_1068830.shtml',
  },
  ecommerce: {
    title: '《中华人民共和国电子商务法》第五十九条',
    text: '电子商务经营者应当建立便捷、有效的投诉、举报机制，公开投诉、举报方式等信息，及时受理并处理投诉、举报。',
    url: 'https://www.cac.gov.cn/2018-09/01/c_1123362506_2.htm',
  },
  standard: {
    title: 'GB/T 47746—2026《顾客联络服务 人工与智能客户服务协同要求》',
    text: '推荐性国家标准，2026 年 9 月 1 日起实施。要求转人工入口清晰便捷、人机切换衔接顺畅、转接后不让客户重复陈述；涉及价格、折扣、退款、赔偿等事项应由人工确认；企业需对智能客服的回复内容负责。',
    url: 'https://www.sohu.com/a/1065411209_114838',
  },
};

export function formatDateTime(value) {
  if (!value) return '';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return String(value);
  const [, y, mo, d, h, mi] = m;
  const date = `${y} 年 ${Number(mo)} 月 ${Number(d)} 日`;
  return h ? `${date} ${h}:${mi}` : date;
}

const clean = (s) => String(s ?? '').trim();
const strip = (s) => clean(s).replace(/[。；;，,\s]+$/, '');

function channelPhrase({ channel, contact }) {
  const base = CHANNELS[channel] || CHANNELS.phone;
  const c = clean(contact);
  if (!c) return base;
  return channel === 'phone' ? `${base} ${c}` : `${base}（${c}）`;
}

export function generateComplaint(input) {
  const company = clean(input.company) || '【企业名称】';
  const issue = strip(input.issue) || '【需要处理的问题】';
  const demand = strip(input.demand) || '【你的具体诉求，如退款 X 元】';
  const attempts = Number.parseInt(input.attempts, 10);
  const minutes = Number.parseInt(input.minutes, 10);
  const outcome = OUTCOMES[input.outcome] || OUTCOMES.never;
  const when = formatDateTime(input.when) || '【日期 时间】';
  const via = channelPhrase(input);
  const orderId = clean(input.orderId);
  const aiPromise = strip(input.aiPromise);
  const useEcommerce = ECOMMERCE_CATEGORIES.has(input.category);

  const tries = [];
  if (attempts > 0) tries.push(`先后 ${attempts} 次明确要求转接人工客服`);
  else tries.push('明确要求转接人工客服');
  if (minutes > 0) tries.push(`累计等待约 ${minutes} 分钟`);

  const fact = [
    `${when}，我通过${via}${/[0-9a-z]$/i.test(via) ? ' ' : ''}联系${company}，需要处理：${issue}${orderId ? `（订单号/业务编号：${orderId}）` : ''}。`,
    `智能客服无法解决该问题，我${tries.join('，')}，${outcome}。`,
  ];
  if (aiPromise) fact.push(`此前智能客服曾答复「${aiPromise}」，但该答复至今没有兑现。`);

  const asks = [
    `请尽快安排人工客服处理上述问题：${demand}。`,
    '请对客服系统转接人工困难的问题进行整改，提供清晰、便捷的人工服务入口。',
  ];
  if (aiPromise) asks.push('请兑现智能客服作出的答复。');

  const laws = [LAWS.consumer];
  if (useEcommerce) laws.push(LAWS.ecommerce);
  laws.push(LAWS.standard);

  const title = `${company}客服无法转接人工，问题得不到处理`;
  const lines = [
    `投诉对象：${company}`,
    `投诉事项：${title}`,
    '',
    '一、事实经过',
    ...fact,
    '',
    '二、投诉请求',
    ...asks.map((a, i) => `${i + 1}. ${a}`),
    '',
    '三、依据',
    ...laws.map((l, i) => `${i + 1}. ${l.title}：${l.text}`),
    '',
    '四、证据材料',
    '□ 通话记录截图（能看到拨打时间和通话时长）',
    '□ 在线客服聊天记录截图',
    '□ 工单号 / 投诉编号',
    '□ 订单或业务凭证',
    '',
    `投诉人：${clean(input.name) || '【姓名】'}    联系电话：${clean(input.phone) || '【电话】'}`,
  ];

  const short =
    `【${company}无法转人工】${when}通过${via}${/[0-9a-z]$/i.test(via) ? ' ' : ''}联系${company}处理${issue}，` +
    `${attempts > 0 ? `${attempts} 次要求转人工` : '要求转人工'}${minutes > 0 ? `、等待约 ${minutes} 分钟` : ''}，${outcome}。诉求：${demand}。`;

  return { title, body: lines.join('\n'), short, laws };
}
