# Deployment Guide

This guide covers deploying fhir-server to Railway and fhir-studio to Vercel.

## Prerequisites

- GitHub account
- Railway account (https://railway.app)
- Vercel account (https://vercel.com)
- Repository pushed to GitHub

## 🚂 Deploy fhir-server to Railway (with PostgreSQL)

### Method 1: Railway Dashboard (Recommended)

#### Step 1: Create PostgreSQL Database

1. **Login to Railway**
   - Go to https://railway.app
   - Sign in with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Provision PostgreSQL"
   - A PostgreSQL database will be created
   - Note: Railway automatically sets the `DATABASE_URL` environment variable

#### Step 2: Deploy fhir-server

1. **Add Service to Project**
   - In your Railway project, click "New"
   - Select "GitHub Repo"
   - Choose your `fhir-studio` repository
   - Railway will create a new service

2. **Configure Service**
   - Click on the service
   - Go to "Settings"
   - Set **Root Directory**: `packages/fhir-server`
   - Railway will auto-detect `nixpacks.toml` and `railway.json`

3. **Connect Database**
   - The `DATABASE_URL` variable is automatically available
   - The `fhir.config.railway.json` file uses `$DATABASE_URL`
   - No manual connection needed!

4. **Set Environment Variables**
   Go to Variables tab and add:

   ```
   PORT=8080
   HOST=0.0.0.0
   NODE_ENV=production
   ```

   Note: `DATABASE_URL` is already set by Railway PostgreSQL plugin

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete (first build downloads FHIR packages, ~2-3 minutes)
   - Copy your Railway URL (e.g., `https://fhir-server-production.up.railway.app`)

6. **Generate Public Domain** (Optional)
   - Go to "Settings" → "Networking"
   - Click "Generate Domain"
   - Copy the public URL

### Method 2: Railway CLI with Automated Setup

**Using PowerShell (Windows):**

```powershell
cd packages/fhir-server
.\railway-setup.ps1
```

**Using Bash (Linux/Mac):**

```bash
cd packages/fhir-server
chmod +x railway-setup.sh
./railway-setup.sh
```

**Manual CLI Steps:**

```bash
# Navigate to fhir-server
cd packages/fhir-server

# Login to Railway
railway login

# Initialize project
railway init

# Add PostgreSQL (in Railway dashboard)
# Go to dashboard → New → Database → Add PostgreSQL

# Set environment variables
railway variables set PORT=8080
railway variables set HOST=0.0.0.0
railway variables set NODE_ENV=production

# Deploy
railway up

# Generate public domain
railway domain

# Get deployment URL
railway status
```

### Configuration Files

The following files are configured for Railway with PostgreSQL:

- **`fhir.config.railway.json`** - Uses `$DATABASE_URL` environment variable
- **`railway.json`** - Deployment configuration (uses `npm run start:prod`)
- **`nixpacks.toml`** - Build configuration
- **`.railwayignore`** - Files to exclude from deployment

**Note:** Railway runs the server using `tsx` (TypeScript execution) via `npm run start:prod`, which executes TypeScript directly without compilation. This avoids build errors in legacy code paths that aren't part of the server runtime.

## ☁️ Deploy fhir-studio to Vercel

### Method 1: Vercel Dashboard (Recommended)

1. **Login to Vercel**
   - Go to https://vercel.com
   - Sign in with GitHub

2. **Import Project**
   - Click "Add New" → "Project"
   - Import your GitHub repository
   - Select the `fhir-studio` repository

3. **Configure Project**
   - **Framework Preset**: Vite
   - **Root Directory**: `packages/fhir-studio`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. **Environment Variables**
   Add in Vercel dashboard → Settings → Environment Variables:

   ```
   VITE_FHIR_SERVER_URL=<your-railway-url>
   ```

   Replace `<your-railway-url>` with your Railway deployment URL

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your app will be live at `https://your-project.vercel.app`

### Method 2: Vercel CLI

```bash
# Install Vercel CLI (already installed globally)
npm install -g vercel

# Navigate to fhir-studio
cd packages/fhir-studio

# Login to Vercel
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

## 🔗 Post-Deployment Configuration

### Update fhir-studio Configuration

After Railway deployment, update the production server URL:

1. Edit `packages/fhir-studio/public/fhir.config.json`
2. Replace `https://your-railway-app.up.railway.app` with your actual Railway URL
3. Commit and push changes
4. Vercel will auto-redeploy

Example configuration:

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
      "url": "https://fhir-server-production-abc123.up.railway.app",
      "description": "Production FHIR server on Railway"
    }
  ],
  "defaultServer": "production"
}
```

### Enable CORS on Railway

Make sure your Railway fhir-server allows requests from your Vercel domain:

The server is already configured with CORS in `scripts/dev.ts`, but you may need to update it for production. The current config allows all origins (`*`), which works for development but should be restricted in production.

## 🔍 Verification

### Test fhir-server

```bash
# Check server health
curl https://your-railway-url.up.railway.app/metadata

# Should return CapabilityStatement JSON
```

### Test fhir-studio

1. Open your Vercel URL in browser
2. Go to Connections page
3. Select "Production Server"
4. Click "Connect"
5. Navigate to IG Explorer or Resources page
6. Verify data loads correctly

## 📊 Monitoring

### Railway

- View logs: Railway Dashboard → Your Project → Deployments → Logs
- View metrics: Railway Dashboard → Your Project → Metrics
- Set up alerts: Railway Dashboard → Your Project → Settings → Notifications

### Vercel

- View deployments: Vercel Dashboard → Your Project → Deployments
- View logs: Click on deployment → View Function Logs
- Analytics: Vercel Dashboard → Your Project → Analytics

## 🔄 Continuous Deployment

Both Railway and Vercel support automatic deployments:

- **Railway**: Auto-deploys on push to main branch (configure in Settings)
- **Vercel**: Auto-deploys on push to main branch (enabled by default)

## 🐛 Troubleshooting

### Railway Issues

**Build fails:**

- Check `nixpacks.toml` is present
- Verify `package.json` scripts are correct
- Check Railway build logs
- Ensure `fhir.config.railway.json` exists

**Server won't start:**

- Verify environment variables are set (PORT, HOST, NODE_ENV)
- Check that `DATABASE_URL` is available (set by PostgreSQL plugin)
- Review Railway runtime logs
- Verify PostgreSQL service is running

**Database connection fails:**

- Ensure PostgreSQL plugin is added to project
- Check `DATABASE_URL` variable is set in Railway dashboard
- Verify `fhir.config.railway.json` uses `$DATABASE_URL`
- Check PostgreSQL service health in Railway dashboard

**First deployment is slow:**

- Initial deployment downloads FHIR packages (~200MB)
- This can take 2-5 minutes
- Subsequent deployments are faster (packages are cached)

### Vercel Issues

**Build fails:**

- Check `vercel.json` configuration
- Verify all dependencies are in `package.json`
- Check Vercel build logs

**Can't connect to server:**

- Verify `VITE_FHIR_SERVER_URL` is set correctly
- Check CORS configuration on Railway
- Verify Railway server is running

## 📝 Notes

- Railway provides a free tier with 500 hours/month
- Vercel provides unlimited deployments for personal projects
- Both platforms support custom domains
- Database persistence: Railway uses SQLite by default (ephemeral). For production, consider PostgreSQL.

## 🔐 Security Recommendations

For production deployments:

1. **Enable authentication** on fhir-server
2. **Restrict CORS** to specific Vercel domain
3. **Use environment variables** for sensitive data
4. **Enable HTTPS** (automatic on both platforms)
5. **Set up monitoring** and alerts
6. **PostgreSQL security**:
   - Railway PostgreSQL uses strong passwords by default
   - Database is only accessible within Railway private network
   - Use connection pooling for better performance
   - Regular backups (Railway Pro plan)
7. **Implement rate limiting** (already configured in fhir-server)
8. **Database backups**: Enable automatic backups in Railway (Pro plan)
9. **Monitor database metrics**: CPU, memory, connections in Railway dashboard

## 📚 Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Vercel Documentation](https://vercel.com/docs)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
