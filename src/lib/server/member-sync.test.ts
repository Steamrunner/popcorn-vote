import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { accountsToMembers, runMemberSync } from './member-sync';
import { loadConfig, type AppConfig } from './config';
import { createDb } from './db';
import { log } from './log';

vi.mock('./config', async (importOriginal) => ({
	...(await importOriginal<typeof import('./config')>()),
	loadConfig: vi.fn()
}));

describe('accountsToMembers', () => {
	it('turns bar accounts into members and skips system accounts', () => {
		const members = accountsToMembers({
			Rob: { display_name: 'Rob*', balance: '9.40', items: 297 },
			'--cash--': { display_name: '--CASH--', balance: '-25303.76', items: 193 },
			Ivo: { display_name: 'ivom', balance: '3.00', items: 25 },
			Dirk: { display_name: 'Tinkerer', balance: '0.00', items: 12 }
		});
		expect(members.map(({ id, name }) => ({ id, name }))).toEqual([
			{ id: 'rob', name: 'Rob' },
			{ id: 'ivo', name: 'ivom' },
			{ id: 'dirk', name: 'Tinkerer' }
		]);
	});

	it('keeps the colour with the person, whatever the order', () => {
		const one = accountsToMembers({ A: {}, Koen: {} });
		const two = accountsToMembers({ Koen: {}, Z: {}, Y: {} });
		expect(one.find((m) => m.id === 'koen')?.color).toBe(two.find((m) => m.id === 'koen')?.color);
	});

	it('falls back to the key without a display name', () => {
		expect(accountsToMembers({ Q: { display_name: '  ' }, N8: null })).toMatchObject([
			{ id: 'q', name: 'Q' },
			{ id: 'n8', name: 'N8' }
		]);
	});

	it('gives two keys with the same slug distinct ids', () => {
		expect(accountsToMembers({ 'Erik!': {}, Erik: {} }).map((m) => m.id)).toEqual(['erik', 'erik2']);
	});

	it.each([null, 'text', 42, [{ display_name: 'x' }]])('reads %j as no accounts', (input) => {
		expect(accountsToMembers(input)).toEqual([]);
	});
});

describe('runMemberSync', () => {
	const config = {
		membersUrl: 'http://bar.example/api/v1/accounts',
		members: [],
		dataDir: '/nowhere'
	} as unknown as AppConfig;
	let hour = 0;

	beforeEach(() => {
		vi.mocked(loadConfig).mockReturnValue(config);
		vi.spyOn(log, 'warn').mockImplementation(() => {});
		vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
		vi.spyOn(fs, 'renameSync').mockImplementation(() => {});
		// Every case runs a fresh hour later, so the hourly gate never holds one back.
		hour += 2;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	const at = () => Date.UTC(2026, 10, 25) + hour * 3_600_000;

	it('saves a new list, reloads the configuration and opens balances', async () => {
		vi.spyOn(log, 'info').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ Koen: { display_name: 'Koen*' }, '--cash--': {} }))
		);
		expect(await runMemberSync(createDb(':memory:'), at())).toBe(true);
		const [file, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
		expect(String(file)).toBe('/nowhere/members-from-url.json.tmp');
		expect(JSON.parse(String(content))).toMatchObject([{ id: 'koen', name: 'Koen' }]);
		expect(fs.renameSync).toHaveBeenCalledWith(
			'/nowhere/members-from-url.json.tmp',
			'/nowhere/members-from-url.json'
		);
		expect(loadConfig).toHaveBeenCalledWith(true);
	});

	it('keeps the last list when the bar system is down', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
		expect(await runMemberSync(createDb(':memory:'), at())).toBe(false);
		expect(fs.writeFileSync).not.toHaveBeenCalled();
	});

	it('keeps the last list on an error status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
		expect(await runMemberSync(createDb(':memory:'), at())).toBe(false);
		expect(fs.writeFileSync).not.toHaveBeenCalled();
	});

	it('keeps the last list when the answer holds no accounts', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ '--cash--': {} })));
		expect(await runMemberSync(createDb(':memory:'), at())).toBe(false);
		expect(fs.writeFileSync).not.toHaveBeenCalled();
	});

	it('fetches at most once an hour', async () => {
		const fetch = vi.fn().mockRejectedValue(new Error('down'));
		vi.stubGlobal('fetch', fetch);
		const db = createDb(':memory:');
		await runMemberSync(db, at());
		await runMemberSync(db, at() + 60_000);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('does nothing without an address', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		vi.mocked(loadConfig).mockReturnValue({ ...config, membersUrl: '' });
		expect(await runMemberSync(createDb(':memory:'), at())).toBe(false);
		expect(fetch).not.toHaveBeenCalled();
	});
});
