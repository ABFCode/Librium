// Background half of the clipper: owns the two extension-UI triggers
// (context menu + toolbar icon — the only gestures that carry the activeTab
// grant) and the screenshot-crop of the cover. There is deliberately no
// fetch path here: both were live-tested dead on 2026-07-07 (Cloudflare
// 403s out-of-partition fetches even with credentials; the CDN sends no
// CORS headers). See git history (v0.1.x) for the deleted attempts.

// Menus don't survive a browser restart on Firefox event pages (onInstalled
// won't re-fire), and re-creating an existing id throws — removeAll-then-
// create on both install and startup covers every case idempotently.
function ensureMenu() {
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({
			id: "librium-copy",
			title: "Copy to Librium",
			contexts: ["page", "image", "selection", "link"],
			documentUrlPatterns: [
				"https://www.novelupdates.com/series/*",
				"https://novelupdates.com/series/*",
			],
		});
	});
}
chrome.runtime.onInstalled.addListener(ensureMenu);
chrome.runtime.onStartup.addListener(ensureMenu);

function triggerCopy(tabId) {
	chrome.tabs.sendMessage(tabId, { type: "librium-run-copy" }, () => {
		// Swallow "no receiving end" when triggered on a non-NU page.
		void chrome.runtime.lastError;
	});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "librium-copy" && tab?.id) {
		triggerCopy(tab.id);
	}
});

chrome.action.onClicked.addListener((tab) => {
	if (tab?.id) {
		triggerCopy(tab.id);
	}
});

// Service workers have no FileReader — base64 by hand, chunked to keep
// String.fromCharCode off the argument-count limit.
function toBase64(buf) {
	let binary = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < buf.length; i += CHUNK) {
		binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

/**
 * Screenshot the visible tab and crop the cover's bounding box out of it.
 * The page has already painted the cover with its own credentials — no
 * network request happens, so neither Cloudflare nor CORS can interfere.
 * Requires the activeTab grant (why the triggers above are extension UI).
 * Lossy (screen-resolution re-encode) but the only working path.
 */
async function captureCoverFromTab(windowId, rect, dpr) {
	const dataUrl = await new Promise((resolve, reject) => {
		chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (url) => {
			const err = chrome.runtime.lastError;
			if (err || !url) {
				reject(new Error(err?.message ?? "captureVisibleTab returned nothing"));
			} else {
				resolve(url);
			}
		});
	});
	const shot = await createImageBitmap(await (await fetch(dataUrl)).blob());
	// rect is in CSS pixels relative to the viewport; the capture is in device
	// pixels. Clamp to the bitmap in case the cover pokes past the viewport.
	const sx = Math.max(0, Math.round(rect.x * dpr));
	const sy = Math.max(0, Math.round(rect.y * dpr));
	const sw = Math.min(shot.width - sx, Math.round(rect.width * dpr));
	const sh = Math.min(shot.height - sy, Math.round(rect.height * dpr));
	if (sw < 40 || sh < 40) {
		throw new Error("cover not visible enough to capture");
	}
	const canvas = new OffscreenCanvas(sw, sh);
	canvas.getContext("2d").drawImage(shot, sx, sy, sw, sh, 0, 0, sw, sh);
	const blob = await canvas.convertToBlob({
		type: "image/jpeg",
		quality: 0.92,
	});
	return `data:image/jpeg;base64,${toBase64(new Uint8Array(await blob.arrayBuffer()))}`;
}

// chrome.* exists in both browsers (Firefox aliases it); the callback +
// `return true` async-response pattern is the portable one.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === "librium-capture-cover") {
		captureCoverFromTab(sender.tab?.windowId, message.rect, message.dpr)
			.then((dataUrl) => sendResponse({ ok: true, dataUrl }))
			.catch((err) => sendResponse({ ok: false, error: String(err) }));
		return true;
	}
});
