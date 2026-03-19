# Vercel 部署指南 - fhir-studio

## ✅ 已完成配置

所有配置文件已就绪：

- ✅ `vercel.json` - Vercel 配置
- ✅ `.vercelignore` - 排除文件
- ✅ `public/fhir.config.json` - 服务器配置
- ✅ `package.json` - 构建脚本

## 🚀 部署步骤（Dashboard 方式 - 推荐）

### 第 1 步：登录 Vercel

1. 访问 https://vercel.com
2. 使用 GitHub 账号登录

### 第 2 步：导入项目

1. 点击 **"Add New"** → **"Project"**
2. 选择 **"Import Git Repository"**
3. 找到并选择你的 `fhir-studio` 仓库
4. 点击 **"Import"**

### 第 3 步：配置项目

在项目配置页面设置：

**Framework Preset:** Vite

**Root Directory:** `packages/fhir-studio`
- 点击 **"Edit"** 
- 选择 `packages/fhir-studio`

**Build and Output Settings:**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

**Environment Variables:**（暂时不需要，配置在 `fhir.config.json` 中）

### 第 4 步：部署

1. 点击 **"Deploy"**
2. 等待构建完成（约 1-2 分钟）
3. 部署成功后会显示预览 URL

### 第 5 步：更新 Railway URL

部署成功后，你需要更新 `public/fhir.config.json` 中的 Railway URL：

1. 从 Railway Dashboard 获取你的服务器 URL
2. 编辑 `packages/fhir-studio/public/fhir.config.json`
3. 将 `https://your-railway-app.up.railway.app` 替换为实际 URL
4. 提交并推送更改
5. Vercel 会自动重新部署

## 🔧 CLI 部署方式（备选）

### 安装 Vercel CLI

```bash
npm install -g vercel
```

### 登录

```bash
vercel login
```

### 部署

```bash
cd packages/fhir-studio
vercel
```

按照提示操作：
- Set up and deploy? **Y**
- Which scope? 选择你的账号
- Link to existing project? **N**
- What's your project's name? `fhir-studio`
- In which directory is your code located? `./`
- Want to override the settings? **N**

### 部署到生产环境

```bash
vercel --prod
```

## 📋 配置文件说明

### vercel.json

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "installCommand": "npm install",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**关键配置：**
- `rewrites`: 所有路由重定向到 `index.html`（SPA 路由支持）
- `headers`: 静态资源缓存优化

### fhir.config.json

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
      "url": "https://your-railway-url.up.railway.app",
      "description": "Production FHIR server on Railway"
    }
  ],
  "defaultServer": "production"
}
```

**重要：** 部署后需要更新 `production` 服务器的 URL！

## 🔍 验证部署

部署成功后：

1. 打开 Vercel 提供的 URL（例如：`https://fhir-studio.vercel.app`）
2. 应该看到 fhir-studio 界面
3. 进入 **Connections** 页面
4. 选择 **"Production Server"**
5. 点击 **"Connect"**
6. 验证能否连接到 Railway 上的 fhir-server

## 🐛 常见问题

### 问题：Build 失败

**解决方案：**
- 检查 `package.json` 中的依赖是否正确
- 查看 Vercel 构建日志
- 确保 TypeScript 编译无错误

### 问题：页面空白

**解决方案：**
- 检查浏览器控制台错误
- 确认 `dist` 目录正确生成
- 检查 `vercel.json` 的 `rewrites` 配置

### 问题：无法连接到 FHIR 服务器

**解决方案：**
- 确认 Railway 服务器正在运行
- 检查 `fhir.config.json` 中的 URL 是否正确
- 确认 Railway 服务器的 CORS 配置允许 Vercel 域名

### 问题：路由不工作（404）

**解决方案：**
- 确认 `vercel.json` 中有 `rewrites` 配置
- 检查 PrismUI 路由配置

## 🔄 自动部署

Vercel 默认启用自动部署：

- **Push to main** → 自动部署到生产环境
- **Pull Request** → 自动创建预览部署

## 📊 监控和日志

### 查看部署

1. Vercel Dashboard → 选择项目
2. **Deployments** 标签查看所有部署

### 查看日志

1. 点击具体的部署
2. **Build Logs** - 查看构建日志
3. **Function Logs** - 查看运行时日志（如果有）

### 分析

1. **Analytics** 标签查看访问统计
2. **Speed Insights** 查看性能指标

## 🔗 自定义域名（可选）

### 添加域名

1. 进入项目 → **Settings** → **Domains**
2. 输入你的域名
3. 按照提示配置 DNS 记录
4. 等待 DNS 生效和 SSL 证书颁发

### 更新 CORS

添加自定义域名后，需要在 Railway fhir-server 中更新 CORS 配置以允许新域名。

## 📝 部署后检查清单

- [ ] Vercel 部署成功
- [ ] 网站可以访问
- [ ] 已更新 `fhir.config.json` 中的 Railway URL
- [ ] 可以连接到 Production Server
- [ ] IG Explorer 可以加载数据
- [ ] Resources 页面可以创建/编辑资源
- [ ] 路由导航正常工作

## 🔐 安全建议

1. **环境变量**：敏感配置使用 Vercel 环境变量
2. **HTTPS**：Vercel 自动提供 HTTPS
3. **CORS**：确保 Railway 服务器正确配置 CORS
4. **认证**：如果需要，在 fhir-server 启用认证

## 📚 相关文档

- [Vercel 文档](https://vercel.com/docs)
- [Vite 部署指南](https://vitejs.dev/guide/static-deploy.html)
- [主部署文档](../../DEPLOYMENT.md)
- [Railway 部署指南](../fhir-server/RAILWAY-DEPLOYMENT.md)

## 🎯 下一步

部署成功后：

1. ✅ 测试所有功能
2. ✅ 配置自定义域名（可选）
3. ✅ 设置监控和告警
4. ✅ 优化性能（如果需要）
