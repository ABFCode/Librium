import type { ComponentProps } from 'react'
import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'

import Header from '../components/Header'
import { convexClient } from '../convexClient'
import { authClient } from '../lib/auth-client'

// Route-config-driven chrome: any route can opt out of the app header via
// staticData.chrome, which travels with the route regardless of its path.
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    chrome?: boolean
  }
}

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const hideChrome = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.staticData.chrome === false),
  })
  return (
    <>
      <ConvexBetterAuthProvider
        client={convexClient}
        // The crossDomain client plugin's inferred session type doesn't
        // satisfy the provider's AuthClient shape (library typing mismatch,
        // no runtime impact) — cast to the prop's own expected type.
        authClient={
          authClient as unknown as ComponentProps<
            typeof ConvexBetterAuthProvider
          >['authClient']
        }
      >
        {hideChrome ? null : <Header />}
        <Outlet />
      </ConvexBetterAuthProvider>
      <TanStackDevtools
        config={{
          position: 'bottom-right',
        }}
        plugins={[
          {
            name: 'Tanstack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
    </>
  )
}
