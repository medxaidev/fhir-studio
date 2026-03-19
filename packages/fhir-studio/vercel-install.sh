#!/bin/bash
# Remove workspace context to allow standalone npm install
cd /vercel/path0
if [ -f "package.json" ]; then
  node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));delete pkg.workspaces;fs.writeFileSync('package.json',JSON.stringify(pkg,null,2));"
fi

cd packages/fhir-studio
npm install
