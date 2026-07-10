#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo ""
echo "🇪🇸  EspañolFlow – Spanish Grammar Learning App"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if ! command -v node &>/dev/null; then
  echo "❌ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_VER" -lt 18 ]; then
  echo "⚠️  Node.js 18+ required (found v$(node --version))"
  exit 1
fi
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi
echo "🚀 Starting dev server at http://localhost:3000"
echo "   Press Ctrl+C to stop"
echo ""
npm run dev
