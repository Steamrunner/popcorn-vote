import { describe, expect, it } from 'vitest';
import { qrPath } from './qr';

describe('qrPath', () => {
	it('draws a square code with the three finder patterns', () => {
		const { size, path } = qrPath('https://popcorn.example/');
		// Version 1 is 21 modules wide, every further version adds four.
		expect((size - 21) % 4).toBe(0);
		expect(path).toMatch(/^M0 0h1v1h-1z/);
		expect(path).toContain(`M${size - 1} 0h1v1h-1z`);
		expect(path).toContain(`M0 ${size - 1}h1v1h-1z`);
	});

	it('grows with longer addresses', () => {
		const short = qrPath('http://tv/');
		const long = qrPath(`https://${'a'.repeat(120)}.example/`);
		expect(long.size).toBeGreaterThan(short.size);
	});
});
