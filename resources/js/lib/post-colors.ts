function hashString(str: string): number {
	let hash = 0;

	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}

	return Math.abs(hash);
}

export interface PostColors {
	background: string;
	text: string;
	highlight: string;
}

export function postColors(authorHandle: string): PostColors {
	const hash = hashString(authorHandle);
	const hue = hash % 360;
	const saturation = 60 + (hash % 20); // 60–80%

	return {
		background: `hsl(${hue}, ${saturation}%, 15%)`,
		text: `hsl(${hue}, ${saturation}%, 90%)`,
		highlight: `hsl(${(hue + 30) % 360}, ${saturation + 10}%, 70%)`,
	};
}
