function hashString(str: string): number {
	let hash = 5381;

	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
		hash |= 0;
	}

	return Math.abs(hash);
}

export interface PostColors {
	background: string;
	text: string;
	highlight: string;
}

const GOLDEN_RATIO = 0.618033988749895;

export function postColors(authorHandle: string): PostColors {
	const hash = hashString(authorHandle);
	// Golden ratio distributes hues evenly regardless of hash magnitude
	const hue = Math.floor(((hash * GOLDEN_RATIO) % 1) * 360);
	// Use independent bits for saturation so it varies separately from hue
	const saturation = 55 + ((hash >> 8) % 30); // 55–85%

	return {
		background: `hsl(${hue}, ${saturation}%, 15%)`,
		text: `hsl(${hue}, ${saturation}%, 90%)`,
		highlight: `hsl(${(hue + 30) % 360}, ${saturation + 10}%, 70%)`,
	};
}
