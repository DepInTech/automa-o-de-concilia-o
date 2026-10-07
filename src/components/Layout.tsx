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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useTheme } from '@/hooks/use-theme'
import { Sun, Moon, User, CheckCircle2, Shield } from 'lucide-react'

export default function Layout() {
  const { theme, toggleTheme } = useTheme()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen overflow-hidden bg-[#F5F8F8] dark:bg-[#071F1D] text-[#12343B] dark:text-[#F1F5F4]">
        {/* Header Corporativo Fixo / Sticky */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#008F83]/15 bg-white/95 dark:bg-[#0D3834]/95 backdrop-blur px-4 sm:px-6 shadow-sm transition-colors">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="text-[#006B67] dark:text-[#20C9A6] hover:bg-[#DDF5F0] dark:hover:bg-[#008F83]/20" />
            <div className="h-5 w-[1px] bg-slate-200 dark:bg-emerald-900/50 hidden sm:block" />
            <Breadcrumb className="hidden sm:block">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to="/"
                      className="font-bold text-[#006B67] hover:text-[#008F83] dark:text-[#20C9A6] dark:hover:text-[#DDF5F0] transition-colors"
                    >
                      GRUPO EPA
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="text-slate-400 dark:text-emerald-700" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-medium text-[#12343B] dark:text-[#F1F5F4]">
                    Nova Conciliação
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Ações da Direita: Status, Tema, Perfil do Usuário */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Status do Ambiente */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#DDF5F0] dark:bg-[#008F83]/20 text-[#006B67] dark:text-[#20C9A6] text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#008F83] dark:bg-[#20C9A6] animate-pulse" />
              Ambiente Seguro
            </div>

            {/* Alternância de Tema Claro / Escuro */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              aria-label="Alternar tema claro/escuro"
              title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              className="h-9 w-9 rounded-lg border-[#008F83]/20 hover:border-[#008F83]/50 bg-white dark:bg-[#0D3834] text-[#006B67] dark:text-[#20C9A6] hover:bg-[#DDF5F0] dark:hover:bg-[#008F83]/30 transition-all shadow-sm"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-[#20C9A6] transition-all hover:rotate-45" />
              ) : (
                <Moon className="h-4 w-4 text-[#006B67] transition-all hover:-rotate-12" />
              )}
            </Button>

            {/* Menu do Usuário */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2.5 pl-2 pr-3 py-1 rounded-lg border border-transparent hover:border-[#008F83]/20 hover:bg-[#DDF5F0]/60 dark:hover:bg-[#008F83]/20 transition-all text-left outline-none"
                >
                  <Avatar className="h-8 w-8 ring-2 ring-[#008F83]/30">
                    <AvatarFallback className="bg-[#006B67] text-white font-bold text-xs">
                      GE
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col leading-tight">
                    <span className="text-xs font-bold text-[#12343B] dark:text-[#F1F5F4]">
                      Controladoria EPA
                    </span>
                    <span className="text-[10px] text-[#64748B] dark:text-[#A7C4C0]">
                      Financeiro & Auditoria
                    </span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-white dark:bg-[#0D3834] border-[#008F83]/20 text-[#12343B] dark:text-[#F1F5F4] shadow-lg rounded-xl p-1"
              >
                <DropdownMenuLabel className="font-semibold text-xs text-[#64748B] dark:text-[#A7C4C0] px-2 py-1.5">
                  Sessão Ativa • Grupo EPA
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[#008F83]/15" />
                <DropdownMenuItem className="text-xs py-2 px-2.5 rounded-lg focus:bg-[#DDF5F0] dark:focus:bg-[#008F83]/30 cursor-pointer">
                  <User className="w-4 h-4 mr-2 text-[#008F83] dark:text-[#20C9A6]" />
                  Perfil do Analista
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs py-2 px-2.5 rounded-lg focus:bg-[#DDF5F0] dark:focus:bg-[#008F83]/30 cursor-pointer">
                  <Shield className="w-4 h-4 mr-2 text-[#008F83] dark:text-[#20C9A6]" />
                  Parâmetros de Auditoria
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#008F83]/15" />
                <div className="px-2.5 py-1.5 text-[11px] text-[#64748B] dark:text-[#A7C4C0]">
                  Versão 1.0.0 Corporativa
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Conteúdo Principal com scroll controlado */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F5F8F8] dark:bg-[#071F1D] min-h-0">
          <Outlet />
        </main>

        {/* Rodapé Corporativo Fixo */}
        <footer className="h-11 flex items-center justify-between px-6 border-t border-[#008F83]/15 text-xs text-[#64748B] dark:text-[#A7C4C0] bg-white dark:bg-[#043330] shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#008F83] dark:text-[#20C9A6]" />
            <span className="font-medium text-[#12343B] dark:text-[#F1F5F4]">
              Módulo de Conciliação Bancária
            </span>
            <span className="hidden sm:inline text-slate-400">• Sistema Integrado Odoo</span>
          </div>
          <span className="font-semibold text-[#006B67] dark:text-[#20C9A6]">GRUPO EPA v1.0.0</span>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  )
}
