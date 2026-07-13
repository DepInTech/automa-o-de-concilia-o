import { Outlet, Link } from 'react-router-dom' // 1. Adicionado o Link e separado corretamente
import { AppSidebar } from './app-sidebar'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'

export default function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 border-b bg-white dark:bg-slate-950 shadow-sm z-10">
          <SidebarTrigger />
          <Breadcrumb className="hidden sm:block">
            <BreadcrumbList>
              <BreadcrumbItem>
                {/* 2. Corrigido com asChild e Link para evitar recarregamento de página */}
                <BreadcrumbLink asChild>
                  <Link to="/" className="font-semibold text-slate-800 dark:text-white">
                    GRUPO EPA
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Nova Conciliacao</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        {/* Conteúdo Principal */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-50/50 dark:bg-slate-900 min-h-0">
          <Outlet />
        </main>

        {/* Rodapé */}
        <footer className="h-12 flex items-center justify-between px-6 border-t text-sm text-slate-500 bg-white dark:bg-slate-950 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            Sistema Online
          </div>
          <span>GRUPO EPA v1.0.0</span>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  )
}
