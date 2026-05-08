export function splitIntoLines(text: string): string[] {
	const words = text.split(/\s+/).filter(Boolean);

	if (words.length === 0) {
		return [];
	}

	const numLines = Math.min(8, Math.max(2, Math.ceil(words.length / 4)));
	const targetChars = Math.ceil(text.length / numLines);

	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		if (!current) {
			current = word;
		} else if (current.length + 1 + word.length <= targetChars) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}

	if (current) {
		lines.push(current);
	}

	return lines;
}
