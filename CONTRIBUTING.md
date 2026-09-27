# 参与贡献

转人工速查的价值全在数据：每一条实测记录，都能让下一个人少在语音菜单里绕一圈。谢谢你愿意帮忙。

## 三种参与方式

| 你想做的事 | 最简单的做法 |
| --- | --- |
| 刚打完客服电话，想告诉大家结果 | 在网站企业页点「我刚打过，反馈结果」，或提交 [实测反馈 Issue](https://github.com/FuzzyLogic112/zhuanrengong/issues/new?template=report.yml) |
| 发现号码错了、停用了，或有假冒号码 | 提交 [纠错 Issue](https://github.com/FuzzyLogic112/zhuanrengong/issues/new?template=wrong-info.yml)，会优先处理 |
| 想收录新企业 / 直接改数据 | 提交 [新增 Issue](https://github.com/FuzzyLogic112/zhuanrengong/issues/new?template=new-company.yml)，或按下文改 YAML 后发 PR |

不会用 Git 也没关系，提 Issue 就行，维护者会把它整理进数据。

## 数据规则（最重要）

1. **号码只收官方出处。** 企业官网、App、官方公告，或政府、机场等权威机构公布的页面。**不收**搜索引擎结果、号码查询站、自媒体汇总里的号码——假冒客服号码正是电信诈骗的常见手段。
2. **每个号码都要写 `source`。** 你在出处页面亲自核对过，才写 `checked`（核对日期）。
3. **实测记录必须是亲测或媒体实测**，写清日期、渠道、结果和经过，附出处链接（媒体报道或 GitHub Issue）。
4. **`steps` 必须有依据。** 写了 `steps.phone`，`reports` 里就必须有 `channel: phone` 的实测记录。校验脚本会检查。
5. **不写个人信息。** 不出现卡号、身份证号、订单号、手机号、客服工号。
6. **如实记录。** 转不过去就写 `fail`，费劲就写 `slow`；不夸大，也不替企业美化。

## 数据格式

每家企业一个文件：`data/companies/<id>.yaml`，文件名必须和 `id` 一致。

```yaml
id: cmb                      # 小写字母、数字、连字符；与文件名一致
name: 招商银行
aliases: [招行, CMB, 招商]    # 简称、英文名，用于搜索；拼音会自动生成
category: bank               # 见 data/categories.yaml
weight: 70                   # 选填，0～1000，越大在列表里越靠前
website: https://www.cmbchina.com
updated: 2026-09-27          # 最后修改这个文件的日期

hotlines:
  - number: "95555"          # 一定要加引号
    label: 客服热线
    hours: "7×24 小时"        # 选填
    source: https://...      # 号码出处
    checked: 2026-09-27      # 选填：你在出处核对号码的日期（写了就必须有 source）

steps:                       # 选填：目前最可行的转人工步骤
  phone:                     # phone / online / app
    - 接通后说「转人工」。
    - 被劝阻时坚持再说一次。

notes:                       # 选填：有出处的官方政策
  - text: 满 65 周岁的实名用户可一键进入人工。
    source: https://...

reports:                     # 实测记录，新旧顺序无所谓，构建时会排序
  - date: 2026-09-09
    channel: phone           # phone / online / app
    result: success          # success 转到了 / slow 转到但很费劲 / fail 没转到
    by: 新京报（2026 年 9 月 4—6 日实测）   # 媒体名或 GitHub 用户名
    url: https://...         # 媒体报道或 Issue 链接
    summary: 第一次要人工会被劝阻，再坚持一次即可转接。

tips:                        # 选填：补充说明
  - 95511 是平安集团统一客服号码。

regulators: [mot, samr]      # 选填：覆盖行业默认的投诉渠道，见 data/regulators.yaml
```

- `data/categories.yaml`：行业分类，以及没有实测记录时展示的「通用方法」。
- `data/regulators.yaml`：各行业的投诉 / 监管渠道。改动请同时更新 `source`。

## 把 Issue 整理成数据（维护者）

1. 确认反馈是亲测、没有个人信息。
2. 在对应企业文件的 `reports` 里加一条：`by` 写反馈者的 GitHub 用户名，`url` 写 Issue 链接。
3. 如果多条近期反馈一致，更新 `steps`；和旧步骤矛盾时，以最新的多数反馈为准，并保留旧记录。
4. 更新 `updated` 日期，提交 PR，在 PR 里关联 Issue。

## 本地开发

需要 Node.js 20 及以上。

```bash
npm install
npm run validate   # 只校验数据
npm test           # 单元测试：搜索、投诉书生成、数据校验
npm run dev        # 构建并在 http://localhost:4173 预览
```

没有前端框架，也没有打包工具：`site/` 是原生 HTML / CSS / JS，`scripts/build.mjs` 负责校验数据、生成拼音索引、输出 `dist/`。推到 `main` 后，GitHub Actions 会自动测试并部署到 GitHub Pages。

## 行为准则

就事论事，对企业的评价以实测为依据。不在 Issue 里发布任何人的个人信息，包括客服人员。
