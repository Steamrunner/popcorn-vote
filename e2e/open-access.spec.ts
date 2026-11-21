import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test.skip(({ browserName }) => browserName !== 'chromium', 'one server-level check is enough');

const PORT = 43175;
const BASE_URL = `http://localhost:${PORT}`;

// With the PIN switched off, a device that never signed in uses the whole app.
test('PV_PIN=none opens every page without signing in', async ({ request }) => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'popcorn-vote-open-'));
	let server: ChildProcess | undefined;
	try {
		server = spawn(process.execPath, ['build/index.js'], {
			cwd: process.cwd(),
			env: {
				...process.env,
				DATA_DIR: dataDir,
				PORT: String(PORT),
				PV_PIN: 'none',
				PV_CONFIG: '',
				PV_MEMBERS: 'Anna,Ben'
			},
			stdio: 'ignore'
		});
		await expect
			.poll(async () => {
				try {
					return (await request.get(`${BASE_URL}/healthz`)).status();
				} catch {
					return 0;
				}
			})
			.toBe(200);

		const home = await request.get(`${BASE_URL}/`, { maxRedirects: 0 });
		expect(home.status()).toBe(200);
		expect(await home.text()).toContain('Anna');
		expect((await request.get(`${BASE_URL}/api/movies`)).status()).toBe(200);
		expect((await request.get(`${BASE_URL}/settings`, { maxRedirects: 0 })).status()).toBe(200);
		const pin = await request.get(`${BASE_URL}/pin`, { maxRedirects: 0 });
		expect(pin.status()).toBe(307);
		expect(pin.headers().location).toBe('/');
		const setup = await request.get(`${BASE_URL}/setup`, { maxRedirects: 0 });
		expect(setup.status()).toBe(307);
	} finally {
		server?.kill('SIGTERM');
		fs.rmSync(dataDir, { recursive: true, force: true });
	}
});
