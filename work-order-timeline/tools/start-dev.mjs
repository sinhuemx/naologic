import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { resolve } from 'node:path';

const ngCliPath = resolve('node_modules/@angular/cli/bin/ng.js');
const healthUrl = new URL('http://localhost:4300/health');

let mockApi = null;
let ngServe = null;
let usingExternalMockApi = false;

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (mockApi) {
    mockApi.kill('SIGTERM');
  }
  if (ngServe) {
    ngServe.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((error) => {
  console.error('[start-dev] startup failed', error);
  shutdown(1);
});

async function main() {
  if (await isMockApiHealthy()) {
    usingExternalMockApi = true;
    console.log('[start-dev] detected running mock API on :4300');
  } else {
    mockApi = spawn(process.execPath, ['tools/mock-api/server.mjs'], {
      stdio: 'inherit'
    });

    mockApi.on('exit', (code) => {
      if (shuttingDown) {
        return;
      }
      console.error(`[start-dev] mock API exited with code ${code ?? 0}`);
      shutdown(code ?? 1);
    });

    const ready = await waitForMockApi(12000, 250);
    if (!ready) {
      throw new Error('mock API did not become healthy on :4300 within timeout');
    }
  }

  ngServe = spawn(process.execPath, [ngCliPath, 'serve'], {
    stdio: 'inherit'
  });

  ngServe.on('exit', (code) => {
    if (shuttingDown) {
      return;
    }
    shutdown(code ?? 0);
  });

  if (usingExternalMockApi) {
    console.log('[start-dev] using existing mock API process');
  } else {
    console.log('[start-dev] mock API ready; starting Angular dev server');
  }
}

async function waitForMockApi(timeoutMs, intervalMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isMockApiHealthy()) {
      return true;
    }
    await sleep(intervalMs);
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function isMockApiHealthy() {
  return new Promise((resolvePromise) => {
    const req = request(
      {
        hostname: healthUrl.hostname,
        port: Number(healthUrl.port),
        path: healthUrl.pathname,
        method: 'GET',
        timeout: 500
      },
      (res) => {
        res.resume();
        resolvePromise(res.statusCode === 200);
      }
    );

    req.on('error', () => resolvePromise(false));
    req.on('timeout', () => {
      req.destroy();
      resolvePromise(false);
    });
    req.end();
  });
}
