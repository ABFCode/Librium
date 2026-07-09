// Internal-link resolution for the reader: map an EPUB href (possibly with a
// #fragment, possibly relative to the current file) to a Librium section id,
// using the reader's link index (href / href#anchor / #anchor → section id).
// Shared by the reader shell (which builds the index) and ReaderBlocks (which
// resolves link clicks).

export function normalizeHref(href?: string | null) {
	if (!href) {
		return "";
	}
	let value = href.trim();
	if (!value) {
		return "";
	}
	if (value.includes("#")) {
		value = value.split("#")[0];
	}
	if (value.includes("?")) {
		value = value.split("?")[0];
	}
	value = value.replace(/^\.\//, "").replace(/^\//, "");
	return value;
}

export function normalizeAnchor(anchor?: string | null) {
	if (!anchor) {
		return "";
	}
	return anchor.replace(/^#/, "").trim();
}

function resolveRelativePath(baseHref: string, relative: string) {
	if (!relative) {
		return normalizeHref(baseHref);
	}
	if (relative.startsWith("/")) {
		return normalizeHref(relative);
	}
	if (!baseHref) {
		return normalizeHref(relative);
	}
	const base = normalizeHref(baseHref);
	const baseParts = base.split("/").filter(Boolean);
	baseParts.pop();
	const relParts = relative.split("/").filter((part) => part !== "");
	for (const part of relParts) {
		if (part === "." || part === "") {
			continue;
		}
		if (part === "..") {
			baseParts.pop();
			continue;
		}
		baseParts.push(part);
	}
	return baseParts.join("/");
}

export function resolveInternalSectionId(
	href: string,
	baseHref: string | undefined,
	index: Map<string, string>,
) {
	const trimmed = href.trim();
	if (!trimmed) {
		return null;
	}
	if (trimmed.startsWith("#")) {
		const anchorKey = `#${normalizeAnchor(trimmed)}`;
		return index.get(anchorKey) ?? null;
	}
	let link = trimmed;
	let anchor = "";
	if (link.includes("#")) {
		const parts = link.split("#");
		link = parts[0] ?? "";
		anchor = parts[1] ?? "";
	}
	if (!link && baseHref) {
		link = baseHref;
	}
	// spine ≥0.6 pre-resolves inline hrefs to archive-relative paths — try the
	// direct match first, and only fall back to treating the path as relative
	// to the current section (how pre-0.6 stored blocks encode links).
	const directBase = normalizeHref(link);
	const directAnchor = normalizeAnchor(anchor);
	if (directBase) {
		const direct =
			(directAnchor ? index.get(`${directBase}#${directAnchor}`) : undefined) ??
			index.get(directBase);
		if (direct) {
			return direct;
		}
	}
	link = resolveRelativePath(baseHref ?? "", link);
	const baseKey = normalizeHref(link);
	const anchorKey = normalizeAnchor(anchor);
	if (baseKey && anchorKey) {
		return index.get(`${baseKey}#${anchorKey}`) ?? index.get(baseKey) ?? null;
	}
	if (baseKey) {
		return index.get(baseKey) ?? null;
	}
	if (anchorKey) {
		return index.get(`#${anchorKey}`) ?? null;
	}
	return null;
}
