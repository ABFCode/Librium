// One stroked-line icon primitive. Feather-style 24×24 glyphs on a shared
// <svg> frame (currentColor, round caps) so size/stroke/aria stay consistent
// and adding a glyph is one map entry — cheaper than a dependency for the
// dozen icons this app uses.

export type IconName =
	| "close"
	| "chevron-left"
	| "chevron-right"
	| "arrow-left"
	| "menu"
	| "search"
	| "bookmark"
	| "settings"
	| "sun"
	| "moon"
	| "check"
	| "dots-vertical"
	| "dots-horizontal"
	| "plus"
	| "folder"
	| "pencil"
	| "trash"
	| "external-link";

const GLYPHS: Record<IconName, React.ReactNode> = {
	close: (
		<>
			<path d="M18 6L6 18" />
			<path d="M6 6l12 12" />
		</>
	),
	"chevron-left": <path d="M15 18l-6-6 6-6" />,
	"chevron-right": <path d="M9 6l6 6-6 6" />,
	"arrow-left": (
		<>
			<path d="M19 12H5" />
			<path d="M12 19l-7-7 7-7" />
		</>
	),
	menu: (
		<>
			<path d="M4 6h16" />
			<path d="M4 12h16" />
			<path d="M4 18h16" />
		</>
	),
	search: (
		<>
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.3-4.3" />
		</>
	),
	bookmark: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
	settings: (
		<>
			<circle cx="12" cy="12" r="3" />
			<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08A1.65 1.65 0 0 0 9 4.09V4a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08A1.65 1.65 0 0 0 19.91 11H20a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
		</>
	),
	sun: (
		<>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2" />
			<path d="M12 20v2" />
			<path d="M4.93 4.93l1.41 1.41" />
			<path d="M17.66 17.66l1.41 1.41" />
			<path d="M2 12h2" />
			<path d="M20 12h2" />
			<path d="M4.93 19.07l1.41-1.41" />
			<path d="M17.66 6.34l1.41-1.41" />
		</>
	),
	moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
	check: <path d="M20 6L9 17l-5-5" />,
	"dots-vertical": (
		<>
			<circle cx="12" cy="5" r="1.5" />
			<circle cx="12" cy="12" r="1.5" />
			<circle cx="12" cy="19" r="1.5" />
		</>
	),
	"dots-horizontal": (
		<>
			<circle cx="5" cy="12" r="1.5" />
			<circle cx="12" cy="12" r="1.5" />
			<circle cx="19" cy="12" r="1.5" />
		</>
	),
	plus: (
		<>
			<path d="M12 5v14" />
			<path d="M5 12h14" />
		</>
	),
	folder: (
		<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
	),
	pencil: (
		<>
			<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
			<path d="m15 5 4 4" />
		</>
	),
	trash: (
		<>
			<path d="M3 6h18" />
			<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
			<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
		</>
	),
	"external-link": (
		<>
			<path d="M15 3h6v6" />
			<path d="M10 14 21 3" />
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
		</>
	),
};

type IconProps = {
	name: IconName;
	size?: number;
	strokeWidth?: number;
	className?: string;
};

export function Icon({
	name,
	size = 16,
	strokeWidth = 2,
	className,
}: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			{GLYPHS[name]}
		</svg>
	);
}
