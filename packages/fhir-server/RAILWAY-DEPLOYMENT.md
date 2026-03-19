# Railway Deployment Quick Guide

## 🚀 Quick Start (Dashboard Method)

### Step 1: Create PostgreSQL Database

1. Go to https://railway.app and sign in
2. Click **"New Project"**
3. Select **"Provision PostgreSQL"**
4. PostgreSQL database created ✅

### Step 2: Add fhir-server Service

1. In your project, click **"New"**
2. Select **"GitHub Repo"**
3. Choose `fhir-studio` repository
4. Service created ✅

### Step 3: Configure Service

1. Click on the fhir-server service
2. Go to **"Settings"**
3. Set **Root Directory**: `packages/fhir-server`
4. Go to **"Variables"** tab
5. Add these variables:
   ```
   PORT=8080
   HOST=0.0.0.0
   NODE_ENV=production
   ```
   (Note: `DATABASE_URL` is automatically set by PostgreSQL)

### Step 4: Deploy

1. Click **"Deploy"** or wait for auto-deploy
2. First build takes 2-3 minutes (downloads FHIR packages)
3. Go to **"Settings"** → **"Networking"**
4. Click **"Generate Domain"**
5. Copy your public URL ✅

## 📋 Configuration Files

All configuration files are already set up:

- ✅ `fhir.config.railway.json` - Uses PostgreSQL via `$DATABASE_URL`
- ✅ `railway.json` - Deployment settings (uses `npm run start:prod`)
- ✅ `nixpacks.toml` - Build configuration
- ✅ `.railwayignore` - Exclude unnecessary files

**Note:** Railway deployment uses `tsx` to run TypeScript directly (via `npm run start:prod`), so no build step is required. This avoids TypeScript compilation errors in unused legacy code paths.

## 🔧 CLI Method (Alternative)

### Windows (PowerShell)

```powershell
cd packages\fhir-server
.\railway-setup.ps1
```

### Linux/Mac (Bash)

```bash
cd packages/fhir-server
chmod +x railway-setup.sh
./railway-setup.sh
```

## 🗄️ Database Configuration

The `fhir.config.railway.json` automatically uses Railway's PostgreSQL:

```json
{
  "fhirVersion": "R4",
  "database": {
    "type": "postgres",
    "url": "$DATABASE_URL"
  },
  "packages": {
    "path": "./fhir-packages"
  },
  "igs": [
    { "name": "hl7.fhir.r4.core", "version": "4.0.1" },
    { "name": "hl7.fhir.us.core", "version": "6.1.0" }
  ]
}
```

The `$DATABASE_URL` is automatically replaced with Railway's PostgreSQL connection string.

## ✅ Verification

After deployment, test your server:

```bash
# Check server health
curl https://your-railway-url.up.railway.app/metadata

# Should return CapabilityStatement JSON
```

## 🔍 Monitoring

### View Logs

Railway Dashboard → Your Project → fhir-server → **Deployments** → Click deployment → **View Logs**

### View Metrics

Railway Dashboard → Your Project → fhir-server → **Metrics**

### Database Metrics

Railway Dashboard → Your Project → PostgreSQL → **Metrics**

## 🐛 Common Issues

### Issue: Build fails

**Solution:**

- Check Railway build logs
- Verify `fhir.config.railway.json` exists
- Ensure `nixpacks.toml` is present

### Issue: Server won't start

**Solution:**

- Check environment variables (PORT, HOST, NODE_ENV)
- Verify `DATABASE_URL` is set (should be automatic)
- Review runtime logs

### Issue: Database connection fails

**Solution:**

- Ensure PostgreSQL service is running
- Check `DATABASE_URL` in Variables tab
- Verify both services are in same project

### Issue: First deployment is slow

**Solution:**

- This is normal! First build downloads FHIR packages (~200MB)
- Takes 2-5 minutes
- Subsequent deployments are much faster

## 🔄 Redeployment

Railway auto-deploys on git push to main branch.

Manual redeploy:

1. Go to Railway Dashboard
2. Click on fhir-server service
3. Click **"Deploy"** → **"Redeploy"**

## 📊 Environment Variables Reference

| Variable       | Value        | Description                                   |
| -------------- | ------------ | --------------------------------------------- |
| `DATABASE_URL` | Auto-set     | PostgreSQL connection string (set by Railway) |
| `PORT`         | `8080`       | Server port                                   |
| `HOST`         | `0.0.0.0`    | Server host (allows external connections)     |
| `NODE_ENV`     | `production` | Node environment                              |

## 🔗 Next Steps

After Railway deployment:

1. ✅ Copy your Railway URL
2. ✅ Update `packages/fhir-studio/public/fhir.config.json`
3. ✅ Deploy fhir-studio to Vercel (see main DEPLOYMENT.md)

## 📚 Resources

- [Railway Documentation](https://docs.railway.app)
- [Railway PostgreSQL Guide](https://docs.railway.app/databases/postgresql)
- [Main Deployment Guide](../../DEPLOYMENT.md)
