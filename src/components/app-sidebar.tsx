import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from '@/components/ui/sidebar'
import { FileUp } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { EpaLogo } from './epa-logo'

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar className="border-r border-[#004A46]/40 bg-[#004A46] dark:bg-[#042B28] text-[#F1F5F4]">
      {/* Cabeçalho da Sidebar com o mesmo fundo verde-petróleo contínuo da sidebar */}
      <SidebarHeader className="p-0 border-b border-white/10 bg-transparent text-[#F1F5F4] transition-colors">
        <Link
          to="/"
          className="group block w-full px-5 pt-6 pb-3 transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#20BFA9]"
          title="Grupo EPA - Página Inicial"
        >
          <div className="flex items-center justify-center w-full">
            <EpaLogo
              variant="full"
              size="custom"
              className="w-full max-w-[210px] h-auto object-contain transition-transform group-hover:scale-[1.02]"
            />
          </div>
        </Link>

        {/* Subtítulo institucional e badge sobre o fundo verde-petróleo escuro */}
        <div className="flex items-center justify-between px-5 pb-3.5 text-xs border-t border-white/10 pt-2.5">
          <span className="text-[10px] uppercase tracking-widest font-semibold text-[#A7C4C0]">
            Conciliação Financeira
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#20BFA9]/20 font-bold text-[#20BFA9] border border-[#20BFA9]/30">
            OFICIAL
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-[#A7C4C0] uppercase tracking-wider px-3 mb-2">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/'}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-[#F1F5F4] hover:bg-white/10 data-[active=true]:bg-[#00796F] data-[active=true]:text-white data-[active=true]:shadow-sm data-[active=true]:border-l-4 data-[active=true]:border-[#20BFA9]"
                >
                  <Link to="/">
                    <FileUp className="w-4 h-4 text-[#20BFA9]" />
                    <span>Upload & Conciliação</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-white/10 text-xs text-[#A7C4C0] flex items-center justify-between">
        <span className="font-semibold text-white/90">GRUPO EPA</span>
        <span className="text-[11px] bg-white/10 px-2 py-0.5 rounded text-[#20BFA9] font-medium">
          v1.0.0
        </span>
      </SidebarFooter>
    </Sidebar>
  )
}
