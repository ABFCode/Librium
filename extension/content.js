// Librium NovelUpdates clipper: right-click → "Copy to Librium" (or the
// toolbar icon) on a NU series page copies a JSON payload (page HTML + cover
// as a data URL) to the clipboard. Librium's Edit-details dialog recognizes
// the payload on paste and fills every field plus the cover in one go.
// Contract: `librium: 1` — consumed by web/src/lib/novelUpdates.ts
// (parseLibriumPayload).
//
// Both triggers are extension UI on purpose: the cover comes from
// captureVisibleTab (see below), which browsers permit only under the
// activeTab grant, and that grant is handed out exclusively for clicks on
// extension UI. An in-page button can never qualify — one existed through
// v0.1.x and its cover grab always failed.
//
// The cover is a screenshot-crop of the rendered page, not a download.
// Both network paths were live-tested dead on 2026-07-07: the background
// fetch is 403'd by Cloudflare even with credentials (cf_clearance is
// partition-bound to the tab), and page-context fetches are CORS-sealed
// (the CDN sends no Access-Control-Allow-Origin). The rendered page has
// already painted the pixels with its own credentials — capturing them
// involves no request for Cloudflare or CORS to judge. See git history
// (v0.1.x) for the deleted fetch-based attempts.

const TOAST_ID = "librium-nu-clipper-toast";

function coverImgFromPage() {
	return document.querySelector(
		'.seriesimg img, img[src*="cdn.novelupdates.com"]',
	);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One round-trip to the background with a timeout — never let a hung
// service worker strand the copy; the payload is useful without the cover.
function sendMessageWithTimeout(message, timeoutMs) {
	return new Promise((resolve) => {
		const timer = setTimeout(
			() => resolve({ ok: false, error: "timeout" }),
			timeoutMs,
		);
		try {
			chrome.runtime.sendMessage(message, (response) => {
				clearTimeout(timer);
				const lastError = chrome.runtime.lastError;
				if (response?.ok) {
					resolve({ ok: true, dataUrl: response.dataUrl });
				} else {
					resolve({
						ok: false,
						error:
							response?.error ??
							lastError?.message ??
							"no response from background",
					});
				}
			});
		} catch (err) {
			clearTimeout(timer);
			resolve({ ok: false, error: String(err) });
		}
	});
}

async function grabCover() {
	const img = coverImgFromPage();
	if (!img || !img.complete || img.naturalWidth === 0) {
		return { dataUrl: null, reason: "no rendered cover img found" };
	}
	img.scrollIntoView({ block: "center", behavior: "instant" });
	// Let the scroll settle and the frame paint before the screenshot.
	await sleep(400);
	const rect = img.getBoundingClientRect();
	const captured = await sendMessageWithTimeout(
		{
			type: "librium-capture-cover",
			rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
			dpr: window.devicePixelRatio || 1,
		},
		10000,
	);
	if (captured.ok) {
		return { dataUrl: captured.dataUrl };
	}
	return { dataUrl: null, reason: `capture: ${captured.error}` };
}

// A toolbar-icon click steals focus from the page, and the async clipboard
// API rejects writes from an unfocused document — fall back to the legacy
// textarea + execCommand path, which doesn't care.
async function writeClipboard(text) {
	try {
		await navigator.clipboard.writeText(text);
		return;
	} catch {
		const scratch = document.createElement("textarea");
		scratch.value = text;
		scratch.style.cssText = "position:fixed;top:0;left:0;opacity:0";
		document.body.appendChild(scratch);
		scratch.focus();
		scratch.select();
		const copied = document.execCommand("copy");
		scratch.remove();
		if (!copied) {
			throw new Error("clipboard write failed (both paths)");
		}
	}
}

// Transient status toast — the only UI the clipper injects.
function showToast(text) {
	let toast = document.getElementById(TOAST_ID);
	if (!toast) {
		toast = document.createElement("div");
		toast.id = TOAST_ID;
		toast.style.cssText = [
			"position:fixed",
			"right:16px",
			"bottom:16px",
			"z-index:2147483647",
			"padding:8px 14px",
			"border-radius:6px",
			"background:#b8860b",
			"color:#fff",
			"font:600 13px/1.2 system-ui,sans-serif",
			"box-shadow:0 2px 8px rgba(0,0,0,.35)",
			"pointer-events:none",
		].join(";");
		document.body.appendChild(toast);
	}
	toast.textContent = text;
	return toast;
}

let isCopying = false;

async function copyToLibrium() {
	if (isCopying) {
		return;
	}
	isCopying = true;
	const toast = showToast("Copying…");
	try {
		const cover = await grabCover();
		const payload = {
			librium: 1,
			sourceUrl: location.href,
			html: document.documentElement.outerHTML,
			// On failure, carry the reason in the payload — console visibility on
			// content scripts has proven unreliable for debugging; the clipboard is
			// the one channel we know works end to end.
			...(cover.dataUrl
				? { coverDataUrl: cover.dataUrl }
				: { coverError: cover.reason }),
		};
		await writeClipboard(JSON.stringify(payload));
		toast.textContent = cover.dataUrl
			? "Copied — paste in Librium"
			: "Copied without cover — paste in Librium anyway";
	} catch (err) {
		console.error("[librium-clipper]", err);
		toast.textContent = "Copy failed — see console";
	} finally {
		isCopying = false;
		setTimeout(() => toast.remove(), 6000);
	}
}

// Both extension-UI triggers (context menu, toolbar icon) route here from
// background.js — they're what carries the activeTab grant capture needs.
chrome.runtime.onMessage.addListener((message) => {
	if (message?.type === "librium-run-copy") {
		void copyToLibrium();
	}
});
