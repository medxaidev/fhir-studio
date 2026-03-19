#!/bin/bash
echo "=== Checking fhir-rest-client installation ==="
ls -la node_modules/fhir-rest-client/ || echo "NOT FOUND"
echo ""
echo "=== package.json ==="
cat node_modules/fhir-rest-client/package.json || echo "NOT FOUND"
echo ""
echo "=== dist directory ==="
ls -la node_modules/fhir-rest-client/dist/ || echo "NOT FOUND"
echo ""
echo "=== Building ==="
npm run build
