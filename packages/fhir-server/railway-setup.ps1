# Railway Deployment Setup Script for fhir-server with PostgreSQL (PowerShell)

Write-Host "🚂 Railway FHIR Server Deployment Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Railway CLI is installed
$railwayExists = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railwayExists) {
    Write-Host "❌ Railway CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g @railway/cli
}

# Login to Railway
Write-Host "📝 Logging in to Railway..." -ForegroundColor Green
railway login

# Initialize project
Write-Host "🔧 Initializing Railway project..." -ForegroundColor Green
railway init

# Link to PostgreSQL
Write-Host "🗄️  Adding PostgreSQL database..." -ForegroundColor Green
Write-Host "Please add PostgreSQL plugin in Railway dashboard:" -ForegroundColor Yellow
Write-Host "1. Go to your project in Railway dashboard" -ForegroundColor Yellow
Write-Host "2. Click 'New' → 'Database' → 'Add PostgreSQL'" -ForegroundColor Yellow
Write-Host "3. Railway will automatically set DATABASE_URL environment variable" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter after adding PostgreSQL in dashboard"

# Set environment variables
Write-Host "⚙️  Setting environment variables..." -ForegroundColor Green
railway variables set PORT=8080
railway variables set HOST=0.0.0.0
railway variables set NODE_ENV=production

# Deploy
Write-Host "🚀 Deploying to Railway..." -ForegroundColor Green
railway up

# Get domain
Write-Host "🌐 Getting deployment URL..." -ForegroundColor Green
railway domain

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Copy the deployment URL shown above" -ForegroundColor White
Write-Host "2. Update fhir-studio/public/fhir.config.json with this URL" -ForegroundColor White
Write-Host "3. Deploy fhir-studio to Vercel" -ForegroundColor White
