import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import {
	activeLocalUserId,
	db,
	type LocalReaderSettings,
	type ReaderSettingField,
} from "../lib/db";
import { useSyncWakeSignal } from "./useSyncWakeSignal";

const STORAGE_KEY = "librium_theme";
const SETTINGS_KEY = "reader" as const;

type UserSettingsState = {
	fontScale: number;
	lineHeight: number;
	contentWidth: number;
	theme: string;
	fontFamily: string;
};

const fields: ReaderSettingField[] = [
	"fontScale",
	"lineHeight",
	"contentWidth",
	"theme",
	"fontFamily",
];

const defaults: UserSettingsState = {
	fontScale: 0,
	lineHeight: 1.7,
	contentWidth: 720,
	theme: "night",
	fontFamily: "sans",
};

const zeroVersions = (): LocalReaderSettings["syncedServerTimes"] => ({
	fontScale: 0,
	lineHeight: 0,
	contentWidth: 0,
	theme: 0,
	fontFamily: 0,
});

const valuesOf = (row: LocalReaderSettings): UserSettingsState => ({
	fontScale: row.fontScale,
	lineHeight: row.lineHeight,
	contentWidth: row.contentWidth,
	theme: row.theme,
	fontFamily: row.fontFamily,
});

export const useUserSettings = (options?: { pauseSync?: boolean }) => {
	const syncDb = db;
	const { isAuthenticated } = useConvexAuth();
	const canQuery = isAuthenticated;
	const hasActiveAccount = activeLocalUserId() !== null;
	const settings = useQuery(api.userSettings.getByUser, canQuery ? {} : "skip");
	const saveSettings = useMutation(api.userSettings.upsert);
	const {
		signal: syncWakeSignal,
		retry: retrySync,
		settled: settleSync,
	} = useSyncWakeSignal();
	// `undefined` is reserved for liveQuery's loading state; `null` means this
	// device genuinely has no durable settings row yet and must be seeded.
	const local = useLiveQuery(
		async () => (await syncDb.settings.get(SETTINGS_KEY)) ?? null,
		[],
	);
	const initial = useMemo(() => {
		const storedTheme =
			typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
		return { ...defaults, theme: storedTheme ?? defaults.theme };
	}, []);
	const [state, setState] = useState<UserSettingsState>(initial);
	const stateRef = useRef(state);
	const pushQueueRef = useRef<Promise<void>>(Promise.resolve());

	const remoteVersions = useMemo(() => {
		if (!settings) {
			return zeroVersions();
		}
		return {
			fontScale: settings.fontScaleUpdatedAt ?? settings.updatedAt,
			lineHeight: settings.lineHeightUpdatedAt ?? settings.updatedAt,
			contentWidth: settings.contentWidthUpdatedAt ?? settings.updatedAt,
			theme: settings.themeUpdatedAt ?? settings.updatedAt,
			fontFamily: settings.fontFamilyUpdatedAt ?? settings.updatedAt,
		};
	}, [settings]);

	// Seed or field-wise merge the server snapshot into the durable local row.
	useEffect(() => {
		if (
			!canQuery ||
			options?.pauseSync ||
			settings === undefined ||
			local === undefined
		) {
			return;
		}
		void syncDb.transaction("rw", syncDb.settings, async () => {
			const live = await syncDb.settings.get(SETTINGS_KEY);
			if (!live) {
				const values: UserSettingsState = settings
					? {
							fontScale: settings.fontScale,
							lineHeight: settings.lineHeight,
							contentWidth: settings.contentWidth,
							theme: settings.theme,
							fontFamily: settings.fontFamily ?? "sans",
						}
					: stateRef.current;
				await syncDb.settings.put({
					key: SETTINGS_KEY,
					...values,
					dirtyFields: [],
					syncedServerTimes: settings ? remoteVersions : zeroVersions(),
				});
				return;
			}
			if (!settings) {
				return;
			}
			const dirty = new Set(live.dirtyFields);
			const remoteValues: UserSettingsState = {
				fontScale: settings.fontScale,
				lineHeight: settings.lineHeight,
				contentWidth: settings.contentWidth,
				theme: settings.theme,
				fontFamily: settings.fontFamily ?? "sans",
			};
			let changed = false;
			for (const field of fields) {
				if (
					!dirty.has(field) &&
					remoteVersions[field] > live.syncedServerTimes[field]
				) {
					live[field] = remoteValues[field] as never;
					live.syncedServerTimes[field] = remoteVersions[field];
					changed = true;
				}
			}
			if (changed) {
				await syncDb.settings.put(live);
			}
		});
	}, [canQuery, settings, local, remoteVersions, options?.pauseSync]);

	useEffect(() => {
		if (!local) {
			return;
		}
		const next = valuesOf(local);
		stateRef.current = next;
		setState(next);
	}, [local]);

	useEffect(() => {
		if (typeof document !== "undefined") {
			document.body.dataset.theme = state.theme;
		}
		if (typeof window !== "undefined") {
			localStorage.setItem(STORAGE_KEY, state.theme);
		}
	}, [state.theme]);

	// Push only dirty fields. Accepted fields rebase a newer in-flight local
	// edit; rejected unchanged fields adopt the server response immediately.
	useEffect(() => {
		void syncWakeSignal; // reconnect/backoff trigger; durable row is re-read below
		if (
			!canQuery ||
			options?.pauseSync ||
			!local ||
			local.dirtyFields.length === 0
		) {
			return;
		}
		const timeout = window.setTimeout(() => {
			const pushPass = async () => {
				const row = await syncDb.settings.get(SETTINGS_KEY);
				if (!row || row.dirtyFields.length === 0) {
					return;
				}
				const sentFields = [...row.dirtyFields];
				const sentValues = Object.fromEntries(
					sentFields.map((field) => [field, row[field]]),
				) as Partial<UserSettingsState>;
				const args: Record<string, unknown> = {
					baseVersions: Object.fromEntries(
						sentFields.map((field) => [field, row.syncedServerTimes[field]]),
					),
					...sentValues,
				};
				try {
					const result = await saveSettings(args as never);
					await syncDb.settings
						.where("key")
						.equals(SETTINGS_KEY)
						.modify((live) => {
							const dirty = new Set(live.dirtyFields);
							for (const field of sentFields) {
								const unchanged = live[field] === sentValues[field];
								live.syncedServerTimes[field] = Math.max(
									live.syncedServerTimes[field],
									result.serverVersions[field],
								);
								if (unchanged) {
									live[field] = result.settings[field] as never;
									live.syncedServerTimes[field] = result.serverVersions[field];
									dirty.delete(field);
								}
							}
							live.dirtyFields = [...dirty];
						});
					settleSync();
				} catch {
					retrySync();
				}
			};
			pushQueueRef.current = pushQueueRef.current
				.then(pushPass)
				.catch(() => {});
		}, 250);
		return () => window.clearTimeout(timeout);
	}, [
		canQuery,
		local,
		saveSettings,
		options?.pauseSync,
		syncWakeSignal,
		retrySync,
		settleSync,
	]);

	const setField = useCallback(
		<K extends ReaderSettingField>(
			field: K,
			value:
				| UserSettingsState[K]
				| ((previous: UserSettingsState[K]) => UserSettingsState[K]),
		) => {
			const previous = stateRef.current;
			const nextValue =
				typeof value === "function"
					? (value as (current: UserSettingsState[K]) => UserSettingsState[K])(
							previous[field],
						)
					: value;
			const next = { ...previous, [field]: nextValue };
			stateRef.current = next;
			setState(next);
			if (!canQuery && !hasActiveAccount) {
				return;
			}
			void syncDb.transaction("rw", syncDb.settings, async () => {
				const existing = await syncDb.settings.get(SETTINGS_KEY);
				const base: LocalReaderSettings = existing ?? {
					key: SETTINGS_KEY,
					...previous,
					dirtyFields: [],
					syncedServerTimes: settings ? remoteVersions : zeroVersions(),
				};
				base[field] = nextValue as never;
				base.dirtyFields = Array.from(new Set([...base.dirtyFields, field]));
				await syncDb.settings.put(base);
			});
		},
		[canQuery, hasActiveAccount, settings, remoteVersions],
	);

	return {
		...state,
		setFontScale: (value: number | ((prev: number) => number)) =>
			setField("fontScale", value),
		setLineHeight: (value: number) => setField("lineHeight", value),
		setContentWidth: (value: number) => setField("contentWidth", value),
		setTheme: (value: string) => setField("theme", value),
		setFontFamily: (value: string) => setField("fontFamily", value),
	};
};
