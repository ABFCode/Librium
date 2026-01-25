.PHONY: convex-dev convex-codegen convex-reset
.PHONY: convex-seed

convex-dev:
	cd web && pnpm convex dev

convex-codegen:
	cd web && pnpm convex codegen

convex-reset:
	@if [ "$$CONFIRM" != "RESET" ]; then \
		echo "Refusing to reset. Run: make convex-reset CONFIRM=RESET"; \
		exit 1; \
	fi
	cd web && pnpm convex run admin:resetAllData '{"confirm":"RESET"}'

convex-seed:
	@TITLE=$${TITLE:-"Demo Book"}; \
	AUTHOR=$${AUTHOR:-"Librium"}; \
	SECTION_COUNT=$${SECTION_COUNT:-6}; \
	CHUNKS_PER_SECTION=$${CHUNKS_PER_SECTION:-24}; \
	if [ -z "$$USER_ID" ]; then \
		echo "Missing USER_ID. Example: make convex-seed USER_ID=<users table _id>"; \
		exit 1; \
	fi; \
	echo "Seeding: $$TITLE by $$AUTHOR ($$SECTION_COUNT sections) for $$USER_ID"; \
	cd web && pnpm convex run seed:createDemoBook "{\"userId\":\"$$USER_ID\",\"title\":\"$$TITLE\",\"author\":\"$$AUTHOR\",\"sectionCount\":$$SECTION_COUNT,\"chunksPerSection\":$$CHUNKS_PER_SECTION}"
