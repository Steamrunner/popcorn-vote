import { test, expect } from '@playwright/test';

// The TV stage is open without the family PIN (isPublicStage in
// hooks.server.ts); everything around it is not. A fresh request context
// carries no sign-in cookie, so it stands in for the television in the corner.
test('the TV stage opens without the PIN, the rest of the app does not', async ({ playwright, baseURL }) => {
	const guest = await playwright.request.newContext({ baseURL });
	try {
		const stage = await guest.get('/tv', { maxRedirects: 0 });
		expect(stage.status()).toBe(200);
		expect(await stage.text()).toContain('Current standings');

		const data = await guest.get('/api/tv');
		expect(data.status()).toBe(200);
		expect(await data.json()).toHaveProperty('standings');

		const list = await guest.get('/', { maxRedirects: 0 });
		expect(list.status()).toBe(307);
		expect(list.headers().location).toBe('/pin');

		expect((await guest.get('/api/movies')).status()).toBe(401);
		expect((await guest.post('/api/stake', { data: { movieId: 1, delta: 1 } })).status()).toBe(401);
	} finally {
		await guest.dispose();
	}
});
