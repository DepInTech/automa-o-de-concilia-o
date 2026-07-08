import { Outlet } from 'react-router-dom'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export default function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 border-b bg-white dark:bg-slate-950 shadow-sm z-10">
          <SidebarTrigger />
          <Breadcrumb className="hidden sm:block">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/" className="font-semibold text-slate-800 dark:text-white">
                  ReconciliaFacil
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Nova Conciliação</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <span className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-900 rounded shadow-sm text-slate-900 dark:text-white">
                Nova Análise
              </span>
              <span className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer transition-colors">
                Histórico
              </span>
            </div>
            <Avatar className="w-9 h-9 border border-slate-200 dark:border-slate-800">
              <AvatarImage src="https://img.usecurling.com/ppl/thumbnail?gender=female&seed=4" />
              <AvatarFallback>RF</AvatarFallback>
            </Avatar>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-50/50 dark:bg-slate-900 min-h-0">
          <Outlet />
        </main>

        <footer className="h-12 flex items-center justify-between px-6 border-t text-sm text-slate-500 bg-white dark:bg-slate-950 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            Sistema Online
          </div>
          <span>ReconciliaFacil v0.0.1</span>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  )
}
