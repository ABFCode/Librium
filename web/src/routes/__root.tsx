import type { ComponentProps } from 'react'
import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'

import Header from '../components/Header'
import { convexClient } from '../convexClient'
import { authClient } from '../lib/auth-client'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  // The reader owns the full viewport; its own top bar has the way back.
  const isReaderRoute = useRouterState({
    select: (state) => state.location.pathname.startsWith('/reader'),
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
        {isReaderRoute ? null : <Header />}
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
