import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useUserSettings } from "../hooks/useUserSettings";
import { activateUserDatabase, db, forgetActiveUserDatabase } from "../lib/db";

let authState = { isAuthenticated: false };
let settingsState:
	| {
			fontScale?: number;
			lineHeight?: number;
			contentWidth?: number;
			theme?: string;
			fontFamily?: string;
			updatedAt?: number;
	  }
	| undefined;
const saveSettings = vi.fn();

vi.mock("convex/react", () => ({
	useConvexAuth: () => authState,
	useQuery: () => settingsState,
	useMutation: () => saveSettings,
}));

describe("useUserSettings", () => {
	beforeEach(async () => {
		authState = { isAuthenticated: false };
		settingsState = undefined;
		saveSettings.mockReset();
		saveSettings.mockResolvedValue({
			accepted: {
				fontScale: false,
				lineHeight: false,
				contentWidth: false,
				theme: true,
				fontFamily: false,
			},
			serverVersions: {
				fontScale: 1,
				lineHeight: 1,
				contentWidth: 1,
				theme: 2,
				fontFamily: 1,
			},
			settings: {
				fontScale: 0,
				lineHeight: 1.7,
				contentWidth: 720,
				theme: "sepia",
				fontFamily: "sans",
			},
		});
		await db.settings.clear();
		localStorage.clear();
		document.body.dataset.theme = "";
		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			value: true,
		});
	});

	it("persists theme locally when signed out", async () => {
		const { result, act } = await renderHook(() => useUserSettings());

		await act(() => {
			result.current.setTheme("paper");
		});

		expect(document.body.dataset.theme).toBe("paper");
		expect(localStorage.getItem("librium_theme")).toBe("paper");
	});

	it("queues settings durably during an offline authenticated cold start", async () => {
		activateUserDatabase("offline-settings-user");
		const { result, act, unmount } = await renderHook(() => useUserSettings());

		await act(() => result.current.setLineHeight(2.1));
		await expect
			.poll(async () => (await db.settings.get("reader"))?.dirtyFields)
			.toContain("lineHeight");
		expect((await db.settings.get("reader"))?.lineHeight).toBe(2.1);

		unmount();
		forgetActiveUserDatabase();
	});

	it("seeds a fresh device from its remote field values and versions", async () => {
		authState = { isAuthenticated: true };
		settingsState = {
			fontScale: 2,
			lineHeight: 2,
			contentWidth: 880,
			theme: "sepia",
			fontFamily: "serif",
			updatedAt: 42,
		};

		const { result } = await renderHook(() => useUserSettings());

		await expect.poll(() => result.current.theme).toBe("sepia");
		expect(result.current.fontScale).toBe(2);
		expect(result.current.fontFamily).toBe("serif");
		expect(await db.settings.get("reader")).toEqual(
			expect.objectContaining({
				theme: "sepia",
				fontScale: 2,
				dirtyFields: [],
				syncedServerTimes: expect.objectContaining({
					theme: 42,
					fontScale: 42,
				}),
			}),
		);
	});

	it("saves settings when signed in after debounce", async () => {
		authState = { isAuthenticated: true };
		settingsState = {
			fontScale: 0,
			lineHeight: 1.7,
			contentWidth: 720,
			theme: "night",
			fontFamily: "sans",
			updatedAt: 1,
		};

		const { result, act } = await renderHook(() => useUserSettings());

		await act(() => {});

		await act(() => {
			result.current.setTheme("sepia");
		});

		expect(saveSettings).not.toHaveBeenCalled();
		await expect
			.poll(async () => (await db.settings.get("reader"))?.dirtyFields)
			.toContain("theme");
		await expect
			.poll(() => saveSettings.mock.calls.length, { timeout: 5_000 })
			.toBe(1);
		expect(saveSettings).toHaveBeenCalledWith(
			expect.objectContaining({
				theme: "sepia",
				baseVersions: expect.objectContaining({ theme: 1 }),
			}),
		);
	});

	it("keeps failed settings durable and retries them on reconnect", async () => {
		authState = { isAuthenticated: true };
		settingsState = {
			fontScale: 0,
			lineHeight: 1.7,
			contentWidth: 720,
			theme: "night",
			fontFamily: "sans",
			updatedAt: 1,
		};
		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			value: false,
		});
		saveSettings
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce({
				accepted: {
					fontScale: false,
					lineHeight: false,
					contentWidth: false,
					theme: true,
					fontFamily: false,
				},
				serverVersions: {
					fontScale: 1,
					lineHeight: 1,
					contentWidth: 1,
					theme: 2,
					fontFamily: 1,
				},
				settings: {
					fontScale: 0,
					lineHeight: 1.7,
					contentWidth: 720,
					theme: "paper",
					fontFamily: "sans",
				},
			});

		const { result, act } = await renderHook(() => useUserSettings());
		await act(() => {});
		await act(() => result.current.setTheme("paper"));

		await expect.poll(() => saveSettings.mock.calls.length).toBe(1);
		expect((await db.settings.get("reader"))?.dirtyFields).toContain("theme");

		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			value: true,
		});
		window.dispatchEvent(new Event("online"));

		await expect.poll(() => saveSettings.mock.calls.length).toBe(2);
		await expect
			.poll(async () => (await db.settings.get("reader"))?.dirtyFields)
			.not.toContain("theme");
	});

	it("rebases a newer setting after an in-flight stale edit is rejected", async () => {
		authState = { isAuthenticated: true };
		settingsState = {
			fontScale: 0,
			lineHeight: 1.7,
			contentWidth: 720,
			theme: "night",
			fontFamily: "sans",
			updatedAt: 1,
		};
		let resolveFirst: (value: unknown) => void = () => {};
		saveSettings
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirst = resolve;
					}),
			)
			.mockResolvedValueOnce({
				accepted: {
					fontScale: false,
					lineHeight: false,
					contentWidth: false,
					theme: true,
					fontFamily: false,
				},
				serverVersions: {
					fontScale: 1,
					lineHeight: 1,
					contentWidth: 1,
					theme: 6,
					fontFamily: 1,
				},
				settings: {
					fontScale: 0,
					lineHeight: 1.7,
					contentWidth: 720,
					theme: "paper",
					fontFamily: "sans",
				},
			});

		const { result, act } = await renderHook(() => useUserSettings());
		await expect.poll(() => result.current.theme).toBe("night");
		await act(() => result.current.setTheme("sepia"));
		await expect.poll(() => saveSettings.mock.calls.length).toBe(1);
		await act(() => result.current.setTheme("paper"));
		resolveFirst({
			accepted: {
				fontScale: false,
				lineHeight: false,
				contentWidth: false,
				theme: false,
				fontFamily: false,
			},
			serverVersions: {
				fontScale: 1,
				lineHeight: 1,
				contentWidth: 1,
				theme: 5,
				fontFamily: 1,
			},
			settings: {
				fontScale: 0,
				lineHeight: 1.7,
				contentWidth: 720,
				theme: "night",
				fontFamily: "sans",
			},
		});

		await expect.poll(() => saveSettings.mock.calls.length).toBe(2);
		expect(saveSettings.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				theme: "paper",
				baseVersions: expect.objectContaining({ theme: 5 }),
			}),
		);
	});
});
