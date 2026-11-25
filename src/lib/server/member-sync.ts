import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db';
import { colourFor, loadConfig, slugify, SYNCED_MEMBERS_FILE, type AppConfig, type Member } from './config';
import { ensureBalances } from './game';
import { log } from './log';

/** How often the member list is fetched again. Accounts change rarely. */
export const MEMBER_SYNC_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Accounts a bar system keeps for itself rather than for a person, such as
 * `--cash--`. They never become members.
 */
function isSystemAccount(key: string): boolean {
	return /^--.*--$/.test(key);
}

/**
 * Turns a bar system's account list into members.
 *
 * The input is an object keyed by account name, each entry with a
 * `display_name`:
 *
 *     {"Koen": {"display_name": "Koen*", ...}, "--cash--": {...}}
 *
 * The id comes from the key, the name from `display_name` without a trailing
 * `*`. The key is what stays put: renaming the display name keeps the person's
 * votes, the same way it does for members in config.yaml.
 */
export function accountsToMembers(accounts: unknown): Member[] {
	if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) return [];
	const used = new Set<string>();
	const members: Member[] = [];
	for (const [key, entry] of Object.entries(accounts as Record<string, unknown>)) {
		if (!key.trim() || isSystemAccount(key)) continue;
		const display =
			entry && typeof entry === 'object' && 'display_name' in entry
				? String((entry as { display_name: unknown }).display_name ?? '')
				: '';
		const name = display.trim().replace(/\*+$/, '').trim() || key.trim();
		const base = slugify(key);
		let id = base;
		let suffix = 2;
		while (used.has(id)) id = `${base}${suffix++}`;
		used.add(id);
		members.push({ id, name: name.slice(0, 80), color: colourFor(id), emoji: '' });
	}
	return members;
}

let lastAttempt = 0;
let running = false;

/**
 * Fetches the member list when it is due: at start-up and then every hour.
 * Returns whether the list changed.
 *
 * A failed fetch or an empty answer keeps the last list. A bar system that is
 * briefly down must not wipe out the family's members and their votes.
 */
export async function runMemberSync(db: DB, now = Date.now()): Promise<boolean> {
	const config = loadConfig();
	if (!config.membersUrl || running || now - lastAttempt < MEMBER_SYNC_INTERVAL_MS) return false;
	lastAttempt = now;
	running = true;
	try {
		return await syncMembers(db, config);
	} finally {
		running = false;
	}
}

async function syncMembers(db: DB, config: AppConfig): Promise<boolean> {
	let members: Member[];
	try {
		const res = await fetch(config.membersUrl, {
			signal: AbortSignal.timeout(10_000),
			headers: { Accept: 'application/json' }
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		members = accountsToMembers(await res.json());
	} catch (err) {
		log.warn('Member list could not be fetched; keeping the last one', { err });
		return false;
	}
	if (members.length === 0) {
		log.warn('Member list came back without any accounts; keeping the last one');
		return false;
	}

	const file = path.join(config.dataDir, SYNCED_MEMBERS_FILE);
	const next = JSON.stringify(members, null, '\t') + '\n';
	const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
	if (next === previous) return false;

	// Written next to the target and renamed over it, so a crash halfway never
	// leaves a half-written list behind.
	const temporary = `${file}.tmp`;
	fs.writeFileSync(temporary, next);
	fs.renameSync(temporary, file);

	const before = new Set(config.members.map((m) => m.id));
	const after = new Set(members.map((m) => m.id));
	const fresh = loadConfig(true);
	ensureBalances(db, fresh);
	log.info('Member list updated', {
		members: members.length,
		added: [...after].filter((id) => !before.has(id)).length,
		removed: [...before].filter((id) => !after.has(id)).length
	});
	return true;
}
