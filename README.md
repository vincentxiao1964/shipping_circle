# Shipping Circle / 海运圈

当前版本定位：只做人脉引荐，不找个人，只找“公司 + 某业务负责人”。

[![CI](https://github.com/vincentxiao1964/shipping_circle/actions/workflows/ci.yml/badge.svg)](https://github.com/vincentxiao1964/shipping_circle/actions/workflows/ci.yml)

## 功能（MVP）

- 需求广场：发布“找某公司某业务负责人”的需求、按业务筛选
- 引荐闭环：提交引荐 → 需求方结算（成功 +5 / 未成功 +1）→ 助人分统计
- 公司库：
  - 公司搜索（公司名 / 地区 / 业务 / 标签）
  - 公司详情（业务负责人列表、相关需求、发需求快捷入口）
  - 关注公司（列表关注/取消关注、关注的公司一键按业务发需求）

## 目录结构

- `apps/miniapp`：微信小程序（miniprogram）
- `services/api`：Node.js API（本地 JSON 持久化，便于快速演示）

## 本地运行

### 1) 启动后端

```bash
npm install
npm run dev:api
```

默认地址：`http://localhost:8787`

数据文件：`services/api/data/db.json`（已加入 .gitignore）

可选环境变量（真实微信登录）：

- `WX_APPID`
- `WX_SECRET`

### 2) 运行小程序

- 用微信开发者工具打开：`apps/miniapp`
- 小程序「我的」页设置接口地址为：`http://localhost:8787`

## Git 仓库

- GitHub：`https://github.com/vincentxiao1964/shipping_circle.git`
- Gitee：`https://gitee.com/vincent_xiao99/shipping_circle.git`

## CI

- GitHub Actions：push / PR 自动跑 `lint`、`typecheck`、`test`

## 贡献

- 见 [CONTRIBUTING.md](file:///d:/shipping_network/CONTRIBUTING.md)
