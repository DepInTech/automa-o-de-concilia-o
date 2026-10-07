import { Outlet, Link } from 'react-router-dom'
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
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { Sun, Moon, CheckCircle2 } from 'lucide-react'

export default function Layout() {
  const { theme, toggleTheme } = useTheme()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen overflow-hidden bg-[#F4F8F7] dark:bg-[#071F1D] text-[#163A38] dark:text-[#F1F5F4]">
        {/* Header Corporativo Fixo / Sticky */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#00796F]/15 bg-white/95 dark:bg-[#0D3834]/95 backdrop-blur px-4 sm:px-6 shadow-sm transition-colors">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="text-[#00796F] dark:text-[#20BFA9] hover:bg-[#F4F8F7] dark:hover:bg-[#00796F]/20" />
            <div className="h-5 w-[1px] bg-slate-200 dark:bg-emerald-900/50 hidden sm:block" />
            <div className="flex items-center gap-3">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link
                        to="/"
                        className="font-bold text-[#004A46] hover:text-[#00796F] dark:text-[#20BFA9] dark:hover:text-white transition-colors"
                      >
                        GRUPO EPA
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="text-slate-400 dark:text-emerald-700" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-medium text-[#163A38] dark:text-[#F1F5F4]">
                      Nova Conciliação
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>

          {/* Ações da Direita: Status e Alternador de Tema */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Status do Ambiente */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F4F8F7] dark:bg-[#00796F]/20 text-[#00796F] dark:text-[#20BFA9] text-xs font-semibold border border-[#00796F]/10">
              <span className="w-2 h-2 rounded-full bg-[#00796F] dark:bg-[#20BFA9] animate-pulse" />
              Ambiente Seguro
            </div>

            {/* Alternância de Tema Claro / Escuro */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              aria-label="Alternar tema claro/escuro"
              title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              className="h-9 w-9 rounded-lg border-[#00796F]/20 hover:border-[#00796F]/50 bg-white dark:bg-[#0D3834] text-[#00796F] dark:text-[#20BFA9] hover:bg-[#F4F8F7] dark:hover:bg-[#00796F]/30 transition-all shadow-sm"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-[#20BFA9] transition-all hover:rotate-45" />
              ) : (
                <Moon className="h-4 w-4 text-[#00796F] transition-all hover:-rotate-12" />
              )}
            </Button>
          </div>
        </header>

        {/* Conteúdo Principal com scroll controlado */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F4F8F7] dark:bg-[#071F1D] min-h-0">
          <Outlet />
        </main>

        {/* Rodapé Corporativo Fixo */}
        <footer className="h-11 flex items-center justify-between px-6 border-t border-[#00796F]/15 text-xs text-[#647875] dark:text-[#A7C4C0] bg-white dark:bg-[#042B28] shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#00796F] dark:text-[#20BFA9]" />
            <span className="font-medium text-[#163A38] dark:text-[#F1F5F4]">
              Módulo de Conciliação Bancária
            </span>
            <span className="hidden sm:inline text-slate-400">• Sistema Integrado Odoo</span>
          </div>
          <span className="font-semibold text-[#00796F] dark:text-[#20BFA9]">GRUPO EPA v1.0.0</span>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  )
}
