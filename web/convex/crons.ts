import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily tombstone sweep — see maintenance.ts for the horizon rationale.
crons.daily(
	"compact tombstones",
	{ hourUTC: 8, minuteUTC: 30 },
	internal.maintenance.compactTombstones,
);

export default crons;
