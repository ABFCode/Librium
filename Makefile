.PHONY: convex-dev convex-codegen convex-reset convex-seed

dev:
	cd web && npx concurrently -k -n convex,web \
	"pnpm convex dev" \
	"pnpm dev"

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

# Demo books are no longer seeded server-side (content is parsed from real
# EPUBs on the client) — this creates the dev auth user only.
convex-seed:
	@EMAIL=$${EMAIL:-"dev@test.com"}; \
	PASSWORD=$${PASSWORD:-"devpass123"}; \
	NAME=$${NAME:-"Dev User"}; \
	echo "Seeding user $$EMAIL"; \
	cd web && pnpm convex run seed:createDemoUser "{\"email\":\"$$EMAIL\",\"password\":\"$$PASSWORD\",\"name\":\"$$NAME\"}"
