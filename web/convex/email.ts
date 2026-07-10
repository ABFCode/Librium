import { Resend } from "@convex-dev/resend";
import { components } from "./_generated/api";

// Outbound transactional email (Resend, via the official Convex component:
// durable queue, exactly-once idempotency). Auth mail only — password
// resets and email verification. Nothing promotional ever sends from this
// domain: that's the deliverability contract that keeps reset links out of
// spam folders.
//
// Env-gated like billing: RESEND_API_KEY unset means sends are skipped with
// a logged warning (local/e2e backends work without an account). EMAIL_FROM
// overrides the sender, which must be on a Resend-verified domain.

export const isEmailConfigured = (): boolean =>
	Boolean(process.env.RESEND_API_KEY);

const from = (): string =>
	process.env.EMAIL_FROM || "Librium <hello@librium.dev>";

export const resend: Resend = new Resend(components.resend, {
	// The component defaults to test mode (delivers only to Resend's test
	// addresses). A configured key means we mean it.
	testMode: false,
});

/**
 * Queue one auth email. Callable from mutation or action ctx (Better Auth
 * handlers run in HTTP actions). Never throws on missing config — an auth
 * flow must not 500 because email isn't set up; the warn is the tripwire.
 */
export const sendAuthEmail = async (
	ctx: Parameters<Resend["sendEmail"]>[0],
	options: { to: string; subject: string; html: string; text: string },
): Promise<void> => {
	if (!isEmailConfigured()) {
		console.warn(
			`[librium] RESEND_API_KEY unset; skipped "${options.subject}" to ${options.to}`,
		);
		return;
	}
	await resend.sendEmail(ctx, {
		from: from(),
		to: options.to,
		subject: options.subject,
		html: options.html,
		text: options.text,
	});
};

// Minimal, functional templates. One message, one link, plain sentences.
export const resetPasswordEmail = (url: string) => ({
	subject: "Reset your Librium password",
	text: `Someone asked to reset the password for this Librium account. If that was you, open this link to choose a new password:\n\n${url}\n\nIf it wasn't you, ignore this email. The link expires in an hour and nothing changes until it's used.`,
	html: `<p>Someone asked to reset the password for this Librium account. If that was you, choose a new password here:</p><p><a href="${url}">Reset password</a></p><p>If it wasn't you, ignore this email. The link expires in an hour and nothing changes until it's used.</p>`,
});

export const verifyEmailEmail = (url: string) => ({
	subject: "Confirm your Librium email",
	text: `Confirm this email address for your Librium account by opening this link:\n\n${url}\n\nIf you didn't create a Librium account, ignore this email.`,
	html: `<p>Confirm this email address for your Librium account:</p><p><a href="${url}">Confirm email</a></p><p>If you didn't create a Librium account, ignore this email.</p>`,
});
