import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

test.skip(({ browserName }) => browserName !== 'chromium', 'one server-level check is enough');

const PORT = 43176;
const BAR_PORT = 43177;
const BASE_URL = `http://localhost:${PORT}`;

// The members come from a bar system's account list instead of the configuration.
test('members come from PV_MEMBERS_URL', async ({ request }) => {
	const bar = http.createServer((_req, res) => {
		res.setHeader('Content-Type', 'application/json');
		res.end(
			JSON.stringify({
				Rob: { display_name: 'Rob*', balance: '9.40', items: 297 },
				'--cash--': { display_name: '--CASH--', balance: '-25303.76', items: 193 },
				Ivo: { display_name: 'ivom', balance: '3.00', items: 25 },
				Dirk: { display_name: 'Tinkerer', balance: '0.00', items: 12 }
			})
		);
	});
	await new Promise<void>((resolve) => bar.listen(BAR_PORT, resolve));
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'popcorn-vote-members-'));
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
				PV_MEMBERS: '',
				PV_MEMBERS_URL: `http://localhost:${BAR_PORT}/api/v1/accounts`
			},
			stdio: 'ignore'
		});
		await expect
			.poll(async () => {
				try {
					const home = await request.get(`${BASE_URL}/`);
					return home.ok() ? await home.text() : '';
				} catch {
					return '';
				}
			})
			.toContain('Tinkerer');
		const home = await (await request.get(`${BASE_URL}/`)).text();
		expect(home).toContain('ivom');
		expect(home).toContain('"Rob"');
		expect(home).not.toContain('CASH');
		expect(fs.existsSync(path.join(dataDir, 'members-from-url.json'))).toBe(true);
	} finally {
		server?.kill('SIGTERM');
		bar.close();
		fs.rmSync(dataDir, { recursive: true, force: true });
	}
});
