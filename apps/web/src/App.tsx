import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'

import { PrivateRoute } from './components/layout/AppShell'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'

// Lazy-load all protected pages
const HomePage           = lazy(() => import('./pages/HomePage'))
const RecipeListPage     = lazy(() => import('./pages/recipes/RecipeListPage'))
const RecipeDetailPage   = lazy(() => import('./pages/recipes/RecipeDetailPage'))
const RecipeEditPage     = lazy(() => import('./pages/recipes/RecipeEditPage'))
const ImportPage         = lazy(() => import('./pages/ImportPage'))
const SearchPage         = lazy(() => import('./pages/SearchPage'))
const CookbooksPage      = lazy(() => import('./pages/cookbooks/CookbooksPage'))
const CookbookDetailPage = lazy(() => import('./pages/cookbooks/CookbookDetailPage'))
const GroceryPage        = lazy(() => import('./pages/GroceryPage'))
const ProfilePage        = lazy(() => import('./pages/ProfilePage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
})

function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--color-text-muted)', fontSize: '14px',
    }}>
      Loading...
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected routes — wrapped in AppShell */}
            <Route element={<PrivateRoute />}>
              <Route path="/"          element={<Navigate to="/recipes" replace />} />
              <Route path="/recipes"        element={<RecipeListPage />} />
              <Route path="/recipes/home"   element={<HomePage />} />
              <Route path="/recipes/:id"    element={<RecipeDetailPage />} />
              <Route path="/recipes/:id/edit" element={<RecipeEditPage />} />
              <Route path="/import"         element={<ImportPage />} />
              <Route path="/search"         element={<SearchPage />} />
              <Route path="/cookbooks"      element={<CookbooksPage />} />
              <Route path="/cookbooks/:id"  element={<CookbookDetailPage />} />
              <Route path="/grocery"        element={<GroceryPage />} />
              <Route path="/profile"        element={<ProfilePage />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/recipes" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
