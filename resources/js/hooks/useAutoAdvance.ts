import { useEffect, useLayoutEffect, useRef, useState } from "react";

const TICK_MS = 100;

export function useAutoAdvance({
	duration,
	paused,
	onAdvance,
}: {
	duration: number;
	paused: boolean;
	onAdvance: () => void;
}) {
	const [progress, setProgress] = useState(1);
	const elapsedRef = useRef(0);
	const onAdvanceRef = useRef(onAdvance);

	useLayoutEffect(() => {
		onAdvanceRef.current = onAdvance;
	});

	useEffect(() => {
		elapsedRef.current = 0;

		if (paused) {
			return;
		}

		const interval = setInterval(() => {
			elapsedRef.current += TICK_MS;
			const remaining = Math.max(0, 1 - elapsedRef.current / duration);
			setProgress(remaining);

			if (elapsedRef.current >= duration) {
				elapsedRef.current = 0;
				onAdvanceRef.current();
			}
		}, TICK_MS);

		return () => clearInterval(interval);
	}, [paused, duration]);

	return { progress };
}
