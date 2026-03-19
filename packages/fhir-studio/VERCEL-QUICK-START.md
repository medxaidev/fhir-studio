# Vercel 快速部署指南

## 🚀 5 分钟部署 fhir-studio

### 前提条件

- ✅ GitHub 账号
- ✅ Vercel 账号（使用 GitHub 登录）
- ✅ Railway fhir-server 已部署并获取 URL

## 📋 部署步骤

### 1️⃣ 登录 Vercel

访问 https://vercel.com → 使用 GitHub 登录

### 2️⃣ 导入项目

```
Add New → Project → Import Git Repository
选择 fhir-studio 仓库 → Import
```

### 3️⃣ 配置项目

**Root Directory:** 
- 点击 Edit → 选择 `packages/fhir-studio`

**Framework Preset:** Vite（自动检测）

**Build Settings:**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

### 4️⃣ 部署

点击 **Deploy** → 等待 1-2 分钟 → 完成！

### 5️⃣ 更新 Railway URL

**重要：** 部署后需要更新服务器配置

1. 获取 Railway fhir-server URL（例如：`https://fhir-server-production-abc123.up.railway.app`）

2. 编辑 `packages/fhir-studio/public/fhir.config.json`：

```json
{
  "servers": [
    {
      "id": "local",
      "name": "Local Development",
      "url": "http://localhost:8080",
      "description": "Local FHIR server for development"
    },
    {
      "id": "production",
      "name": "Production Server",
      "url": "https://你的-railway-url.up.railway.app",  // ← 更新这里
      "description": "Production FHIR server on Railway"
    }
  ],
  "defaultServer": "production"
}
```

3. 提交并推送：

```bash
git add packages/fhir-studio/public/fhir.config.json
git commit -m "chore: update production server URL"
git push
```

4. Vercel 自动重新部署（约 1 分钟）

## ✅ 验证部署

1. 打开 Vercel URL（例如：`https://fhir-studio-xxx.vercel.app`）
2. 点击侧边栏 **Connections**
3. 选择 **Production Server**
4. 点击 **Connect**
5. 进入 **IG Explorer** 或 **Resources** 页面
6. 验证数据加载正常

## 🐛 快速故障排查

| 问题 | 解决方案 |
|------|----------|
| Build 失败 | 查看 Vercel 构建日志，检查 TypeScript 错误 |
| 页面空白 | 检查浏览器控制台，确认 `dist` 目录生成 |
| 无法连接服务器 | 确认 Railway URL 正确，服务器正在运行 |
| 路由 404 | 确认 `vercel.json` 中有 `rewrites` 配置 |

## 📊 部署信息

**构建时间：** 约 1-2 分钟  
**自动部署：** Push to main 自动触发  
**预览部署：** Pull Request 自动创建预览  
**HTTPS：** 自动启用  
**CDN：** 全球边缘网络  

## 🔗 有用链接

- [完整部署指南](./VERCEL-DEPLOYMENT.md)
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Railway 部署指南](../fhir-server/RAILWAY-DEPLOYMENT.md)

## 📝 部署检查清单

- [ ] Vercel 项目已创建
- [ ] Root Directory 设置为 `packages/fhir-studio`
- [ ] 首次部署成功
- [ ] 已获取 Railway fhir-server URL
- [ ] 已更新 `fhir.config.json`
- [ ] 已提交并推送配置更改
- [ ] Vercel 自动重新部署完成
- [ ] 网站可以访问
- [ ] 可以连接到 Production Server
- [ ] 所有功能正常工作

## 🎯 完成！

部署完成后，你的 fhir-studio 将在：
- **Production:** `https://your-project.vercel.app`
- **Preview:** 每个 PR 都有独立的预览 URL

享受你的 FHIR 开发平台！🎉
