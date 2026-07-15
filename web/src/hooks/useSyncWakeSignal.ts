import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wakes a durable sync queue after reconnect/focus and provides bounded
 * exponential retry for transient failures that do not toggle browser online
 * state. The durable row remains the source of truth; this is only a trigger.
 */
export function useSyncWakeSignal() {
	const [signal, setSignal] = useState(0);
	const timerRef = useRef<number | null>(null);
	const delayRef = useRef(1_000);
	const mountedRef = useRef(true);

	const wake = useCallback(() => {
		if (!mountedRef.current) {
			return;
		}
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		delayRef.current = 1_000;
		setSignal((value) => value + 1);
	}, []);

	const retry = useCallback(() => {
		if (!mountedRef.current || timerRef.current !== null || !navigator.onLine) {
			return;
		}
		const delay = delayRef.current;
		delayRef.current = Math.min(delay * 2, 30_000);
		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			if (mountedRef.current) {
				setSignal((value) => value + 1);
			}
		}, delay);
	}, []);

	const settled = useCallback(() => {
		if (mountedRef.current) {
			delayRef.current = 1_000;
		}
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		const handleVisible = () => {
			if (document.visibilityState === "visible") {
				wake();
			}
		};
		window.addEventListener("online", wake);
		window.addEventListener("focus", wake);
		window.addEventListener("pageshow", wake);
		document.addEventListener("visibilitychange", handleVisible);
		return () => {
			mountedRef.current = false;
			window.removeEventListener("online", wake);
			window.removeEventListener("focus", wake);
			window.removeEventListener("pageshow", wake);
			document.removeEventListener("visibilitychange", handleVisible);
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
			}
		};
	}, [wake]);

	return { signal, retry, settled };
}
