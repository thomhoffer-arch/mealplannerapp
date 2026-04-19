import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function getBuildId() {
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return `${sha}.${Date.now()}`;
  } catch {
    return `${Date.now()}`;
  }
}

// Replaces __BUILD_ID__ in the emitted service-worker.js so its bytes change
// on every deploy, forcing browsers to install the new worker and purge caches.
function injectBuildIdIntoServiceWorker(buildId) {
  return {
    name: 'inject-build-id-sw',
    apply: 'build',
    closeBundle() {
      const swPath = resolve('build/service-worker.js');
      if (!existsSync(swPath)) return;
      const content = readFileSync(swPath, 'utf-8').replace(
        /__BUILD_ID__/g,
        buildId,
      );
      writeFileSync(swPath, content);
    },
  };
}

const buildId = getBuildId();
process.env.VITE_APP_VERSION = buildId;

export default defineConfig({
  plugins: [react(), injectBuildIdIntoServiceWorker(buildId)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 3000, open: true },
  build: { outDir: 'build' },
});
