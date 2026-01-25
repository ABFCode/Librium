.PHONY: convex-dev convex-codegen convex-reset convex-seed convex-seed-book
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
	@EMAIL=$${EMAIL:-"dev@test.com"}; \
	PASSWORD=$${PASSWORD:-"devpass123"}; \
	NAME=$${NAME:-"Dev User"}; \
	TITLE=$${TITLE:-"Demo Book"}; \
	AUTHOR=$${AUTHOR:-"Librium"}; \
	SECTION_COUNT=$${SECTION_COUNT:-6}; \
	CHUNKS_PER_SECTION=$${CHUNKS_PER_SECTION:-24}; \
	echo "Seeding user $$EMAIL + book $$TITLE ($$SECTION_COUNT sections)"; \
	cd web && pnpm convex run seed:createDemoUserAndBook "{\"email\":\"$$EMAIL\",\"password\":\"$$PASSWORD\",\"name\":\"$$NAME\",\"title\":\"$$TITLE\",\"author\":\"$$AUTHOR\",\"sectionCount\":$$SECTION_COUNT,\"chunksPerSection\":$$CHUNKS_PER_SECTION}"

convex-seed-book:
	@TITLE=$${TITLE:-"Demo Book"}; \
	AUTHOR=$${AUTHOR:-"Librium"}; \
	SECTION_COUNT=$${SECTION_COUNT:-6}; \
	CHUNKS_PER_SECTION=$${CHUNKS_PER_SECTION:-24}; \
	if [ -z "$$USER_ID" ]; then \
		echo "Missing USER_ID. Example: make convex-seed-book USER_ID=<users table _id>"; \
		exit 1; \
	fi; \
	echo "Seeding book $$TITLE ($$SECTION_COUNT sections) for $$USER_ID"; \
	cd web && pnpm convex run seed:createDemoBook "{\"userId\":\"$$USER_ID\",\"title\":\"$$TITLE\",\"author\":\"$$AUTHOR\",\"sectionCount\":$$SECTION_COUNT,\"chunksPerSection\":$$CHUNKS_PER_SECTION}"
