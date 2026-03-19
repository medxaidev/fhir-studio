#!/bin/bash
# Railway Deployment Setup Script for fhir-server with PostgreSQL

echo "🚂 Railway FHIR Server Deployment Setup"
echo "========================================"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway
echo "📝 Logging in to Railway..."
railway login

# Initialize project
echo "🔧 Initializing Railway project..."
railway init

# Link to PostgreSQL
echo "🗄️  Adding PostgreSQL database..."
echo "Please add PostgreSQL plugin in Railway dashboard:"
echo "1. Go to your project in Railway dashboard"
echo "2. Click 'New' → 'Database' → 'Add PostgreSQL'"
echo "3. Railway will automatically set DATABASE_URL environment variable"
echo ""
read -p "Press Enter after adding PostgreSQL in dashboard..."

# Set environment variables
echo "⚙️  Setting environment variables..."
railway variables set PORT=8080
railway variables set HOST=0.0.0.0
railway variables set NODE_ENV=production

# Deploy
echo "🚀 Deploying to Railway..."
railway up

# Get domain
echo "🌐 Getting deployment URL..."
railway domain

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Copy the deployment URL shown above"
echo "2. Update fhir-studio/public/fhir.config.json with this URL"
echo "3. Deploy fhir-studio to Vercel"
