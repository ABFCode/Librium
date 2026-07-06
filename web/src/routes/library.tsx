import { createFileRoute } from "@tanstack/react-router";
import { Library } from "../components/LibraryView";

export const Route = createFileRoute("/library")({
	component: Library,
});
