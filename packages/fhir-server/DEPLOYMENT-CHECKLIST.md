# Railway 部署检查清单

## ✅ 配置文件检查

- [x] `fhir.config.railway.json` - PostgreSQL 配置
- [x] `railway.json` - 部署配置（使用 `npm run start:prod`）
- [x] `nixpacks.toml` - 构建配置（`npm ci --production=false`）
- [x] `.railwayignore` - 排除测试文件和 UTF-8 问题文件
- [x] `package.json` - `tsx` 在 dependencies 中

## ✅ 部署前检查

- [ ] 代码已推送到 GitHub
- [ ] Railway 账号已创建
- [ ] 已准备好设置环境变量

## 📋 部署步骤

### 1️⃣ 创建 PostgreSQL（必须先做）

```
Railway Dashboard → New Project → Provision PostgreSQL
```

### 2️⃣ 添加 fhir-server 服务

```
项目中 → New → GitHub Repo → 选择 fhir-studio
```

### 3️⃣ 配置服务

```
Settings → Root Directory: packages/fhir-server
Variables → 添加：
  - PORT=8080
  - HOST=0.0.0.0
  - NODE_ENV=production
```

### 4️⃣ 部署

```
Deploy → 等待完成 → Settings → Networking → Generate Domain
```

## 🔍 部署验证

```bash
# 测试 metadata 端点
curl https://your-url.up.railway.app/metadata

# 应返回 CapabilityStatement JSON
```

## 🎯 关键配置说明

### 为什么使用 Dev 模式？

```
❌ npm run build  → TypeScript 编译失败（旧代码有错误）
✅ npm run start:prod → tsx 直接执行（跳过编译）
```

### 依赖安装策略

```toml
# nixpacks.toml
[phases.install]
cmds = ["npm ci --production=false"]  # 安装所有依赖
```

### 启动命令

```json
// package.json
"start:prod": "tsx ./scripts/dev.ts --config fhir.config.railway.json"
```

### 文件排除

```
# .railwayignore
src/__tests__/**        # 排除测试文件
**/__tests__/**         # 排除所有测试目录
src/**/*.test.ts        # 排除测试文件（包含 UTF-8 问题）
```

## 🚨 常见错误及解决

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Nixpacks build failed - UTF-8` | 测试文件编码问题 | ✅ 已通过 `.railwayignore` 排除 |
| `tsx: command not found` | tsx 在 devDependencies | ✅ 已移至 dependencies |
| `DATABASE_URL not set` | PostgreSQL 未添加 | 在同一项目添加 PostgreSQL |
| `Build timeout` | 首次下载 FHIR 包 | 正常，等待 2-5 分钟 |

## 📊 部署后检查

- [ ] 服务状态：Running
- [ ] 日志无错误
- [ ] `/metadata` 端点可访问
- [ ] PostgreSQL 连接成功
- [ ] 已复制公共 URL

## 🔗 下一步：部署 fhir-studio

1. 复制 Railway URL
2. 更新 `packages/fhir-studio/public/fhir.config.json`
3. 部署到 Vercel

## 📝 环境变量参考

```bash
# Railway 自动设置
DATABASE_URL=postgresql://...

# 需要手动设置
PORT=8080
HOST=0.0.0.0
NODE_ENV=production
```

## 🔄 重新部署

如果部署失败：

```
Railway Dashboard → fhir-server → Deployments → Redeploy
```

## 📚 相关文档

- [快速开始](./RAILWAY-QUICK-START.md)
- [详细指南](./RAILWAY-DEPLOYMENT.md)
- [完整文档](../../DEPLOYMENT.md)
