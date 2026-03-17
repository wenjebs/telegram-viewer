import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'
import { useTheme } from '#/hooks/useTheme'
import appCss from '#/styles.css?url'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: true },
  },
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Telegram Media Viewer' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function RootComponent() {
  const { theme } = useTheme()
  const toasterTheme = theme === 'system' ? 'system' : theme

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster theme={toasterTheme} position="bottom-right" richColors />
    </QueryClientProvider>
  )
}

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Page not found</h1>
        <p className="mt-2 text-text-soft">
          The page you're looking for doesn't exist.
        </p>
        <Link to="/" className="mt-4 inline-block text-accent hover:underline">
          Go home
        </Link>
      </div>
    </div>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);else document.documentElement.removeAttribute("data-theme")})()',
          }}
        />
      </head>
      <body className="bg-base text-text font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
