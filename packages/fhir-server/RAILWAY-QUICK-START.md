# Railway 部署快速指南

## ✅ 已完成配置

所有配置文件已就绪，可以直接部署：

- ✅ `fhir.config.railway.json` - PostgreSQL 配置（使用 `$DATABASE_URL`）
- ✅ `railway.json` - 部署配置
- ✅ `nixpacks.toml` - 构建配置
- ✅ `.railwayignore` - 排除测试文件
- ✅ `package.json` - tsx 已移至 dependencies

## 🚀 部署步骤（Dashboard 方式）

### 第 1 步：创建 PostgreSQL 数据库

1. 访问 https://railway.app 并登录
2. 点击 **"New Project"**
3. 选择 **"Provision PostgreSQL"**
4. PostgreSQL 数据库创建完成 ✅

### 第 2 步：添加 fhir-server 服务

1. 在项目中点击 **"New"**
2. 选择 **"GitHub Repo"**
3. 选择你的 `fhir-studio` 仓库
4. 服务创建完成 ✅

### 第 3 步：配置服务

1. 点击 fhir-server 服务
2. 进入 **"Settings"**
3. 设置 **Root Directory**: `packages/fhir-server`
4. 进入 **"Variables"** 标签页
5. 添加环境变量：
   ```
   PORT=8080
   HOST=0.0.0.0
   NODE_ENV=production
   ```
   （注意：`DATABASE_URL` 由 PostgreSQL 自动设置）

### 第 4 步：部署

1. 点击 **"Deploy"** 或等待自动部署
2. 首次部署需要 2-3 分钟（下载 FHIR 包）
3. 进入 **"Settings"** → **"Networking"**
4. 点击 **"Generate Domain"**
5. 复制你的公共 URL ✅

## 🔧 部署原理

**使用 Dev 模式部署（无需构建）：**

```bash
npm run start:prod
  ↓
tsx ./scripts/dev.ts --config fhir.config.railway.json
```

**关键点：**
- ✅ 使用 `tsx` 直接执行 TypeScript（无需编译）
- ✅ `tsx` 在 `dependencies` 中（生产环境可用）
- ✅ `npm ci --production=false` 安装所有依赖
- ✅ 避免旧代码的 TypeScript 编译错误
- ✅ 测试文件已通过 `.railwayignore` 排除

## 📋 环境变量

| 变量 | 值 | 说明 |
|------|-----|------|
| `DATABASE_URL` | 自动设置 | PostgreSQL 连接字符串（Railway 自动设置） |
| `PORT` | `8080` | 服务器端口 |
| `HOST` | `0.0.0.0` | 服务器主机（允许外部连接） |
| `NODE_ENV` | `production` | Node 环境 |

## 🔍 验证部署

部署完成后测试：

```bash
curl https://your-railway-url.up.railway.app/metadata
```

应返回 CapabilityStatement JSON。

## 🐛 常见问题

### 问题：Nixpacks build failed - UTF-8 错误
**解决方案：** 已通过 `.railwayignore` 排除测试文件

### 问题：tsx 未找到
**解决方案：** 已将 `tsx` 移至 `dependencies`

### 问题：DATABASE_URL 未设置
**解决方案：** 确保在同一项目中添加了 PostgreSQL 插件

### 问题：首次部署很慢
**解决方案：** 正常现象，首次部署需下载 FHIR 包（~200MB），需 2-5 分钟

## 🔄 重新部署

如果部署失败，在 Railway Dashboard 中：

1. 进入 fhir-server 服务
2. 点击 **"Deployments"**
3. 点击 **"Redeploy"**

## 📊 监控

- **查看日志**：Deployments → 点击部署 → View Logs
- **查看指标**：Metrics 标签页
- **数据库指标**：PostgreSQL 服务 → Metrics

## 🔗 下一步

部署成功后：

1. ✅ 复制 Railway URL
2. ✅ 更新 `packages/fhir-studio/public/fhir.config.json`
3. ✅ 部署 fhir-studio 到 Vercel

## 📚 完整文档

- [完整部署指南](../../DEPLOYMENT.md)
- [Railway 详细说明](./RAILWAY-DEPLOYMENT.md)
