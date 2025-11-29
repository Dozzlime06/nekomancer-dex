import { execSync } from 'child_process';
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

console.log('🔨 Building application for production...');

// Step 1: Build the frontend with Vite
console.log('\n📦 Building frontend...');
execSync('npx vite build', { stdio: 'inherit' });

// Step 2: Build the server with esbuild
console.log('\n🖥️ Building server...');
await esbuild.build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/index.cjs',
  external: [
    'express',
    'express-session',
    'memorystore',
    'ws',
    'pg',
    '@neondatabase/serverless',
    'drizzle-orm',
    'passport',
    'passport-local',
    'connect-pg-simple',
    'googleapis',
    'viem',
  ],
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  minify: true,
  sourcemap: false,
});

// Step 3: Copy necessary files
console.log('\n📋 Copying static files...');

// Ensure dist/public exists and copy frontend build
if (!fs.existsSync('dist/public')) {
  fs.mkdirSync('dist/public', { recursive: true });
}

// Copy Vite build output to dist/public
const viteBuildDir = 'dist/public';
if (fs.existsSync('dist/assets')) {
  // Vite outputs to dist by default, we need to organize
  console.log('Frontend build complete!');
}

console.log('\n✅ Build complete! Run with: npm start');
