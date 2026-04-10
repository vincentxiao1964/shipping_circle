# 贡献指南

## 本地开发

```bash
npm install
npm run dev:api
```

小程序用微信开发者工具打开 `apps/miniapp`，并在「我的」页将接口地址设置为 `http://localhost:8787`。

## 提交前自测

```bash
npm run lint
npm run typecheck
npm run test
```

## 提交与推送

```bash
git status
git add -A
git commit -m "feat: ..."
git push
```

当前仓库已配置 `origin` 同时推送 GitHub + Gitee，执行一次 `git push` 会同时入库两端。

