import { REPO_URL } from '../config.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export function formatDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日`;
}

export function ageLabel(iso, now = new Date()) {
  if (!iso) return '';
  const days = Math.floor((now - new Date(iso + 'T00:00:00')) / 86400000);
  if (days < 1) return '今天';
  if (days < 31) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

export const RESULT = {
  success: { label: '转得通', tone: 'ok' },
  slow: { label: '很费劲', tone: 'warn' },
  fail: { label: '没转到', tone: 'bad' },
  unknown: { label: '暂无实测', tone: 'muted' },
};

export const CHANNEL = { phone: '电话', online: '在线客服', app: 'App' };

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// 预填 GitHub Issue 表单（字段 id 与 .github/ISSUE_TEMPLATE/*.yml 对应）
export function issueUrl(template, fields = {}) {
  const params = new URLSearchParams({ template });
  for (const [k, v] of Object.entries(fields)) if (v) params.set(k, v);
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
