import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily orphaned-R2-object sweep — reclaims uploaded-but-never-attached
// objects so the storage quota's accounting matches the bucket over time.
crons.daily(
	"sweep orphaned objects",
	{ hourUTC: 9, minuteUTC: 0 },
	internal.maintenance.sweepOrphanedObjects,
);

export default crons;
