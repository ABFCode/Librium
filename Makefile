.PHONY: convex-dev convex-codegen convex-reset

convex-dev:
	cd web && pnpm dlx convex dev

convex-codegen:
	cd web && pnpm dlx convex codegen

convex-reset:
	@if [ "$$CONFIRM" != "RESET" ]; then \
		echo "Refusing to reset. Run: make convex-reset CONFIRM=RESET"; \
		exit 1; \
	fi
	cd web && pnpm dlx convex run admin:resetAllData '{"confirm":"RESET"}'
