#!/bin/bash
echo "=== Vercel Install Script ==="
echo "Removing workspace context..."

# Remove workspace reference from root package.json
cd /vercel/path0
if [ -f "package.json" ]; then
  echo "Removing workspaces field from root package.json..."
  node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));delete pkg.workspaces;fs.writeFileSync('package.json',JSON.stringify(pkg,null,2));"
fi

# Go back to fhir-studio directory
cd packages/fhir-studio

echo "Installing dependencies..."
npm install

echo ""
echo "=== Checking installed packages ==="
ls -la node_modules/@prismui/ || echo "@prismui not found"
ls -la node_modules/fhir-rest-client/ || echo "fhir-rest-client not found"
ls -la node_modules/fhir-runtime/ || echo "fhir-runtime not found"

echo ""
echo "=== Installation complete ==="
