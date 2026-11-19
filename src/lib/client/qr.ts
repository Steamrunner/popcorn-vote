import qrcode from 'qrcode-generator';

/** A QR code as one SVG path, drawn on a `size` × `size` grid of modules. */
export interface QrPath {
	size: number;
	path: string;
}

/**
 * Encodes `text` as a QR code and returns its dark modules as a single SVG
 * path, so the page renders it as markup of its own instead of injecting the
 * library's SVG string with `{@html}`.
 *
 * Level M survives a smudged or glare-struck TV screen without making the code
 * denser than a phone across the room can read.
 */
export function qrPath(text: string): QrPath {
	const qr = qrcode(0, 'M');
	qr.addData(text);
	qr.make();
	const size = qr.getModuleCount();
	let path = '';
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
		}
	}
	return { size, path };
}
