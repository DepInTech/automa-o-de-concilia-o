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
      {/* Cabeçalho da Sidebar com a logo oficial proporcional e área de proteção neutra */}
      <SidebarHeader className="p-4 border-b border-white/10 space-y-3">
        {/*
          Área de proteção neutra clara recomendada no briefing:
          Ocupa a largura útil da sidebar (~85-90%), com cantos arredondados,
          garantindo contraste e legibilidade impecáveis para a árvore e texto verde-petróleo
          em ambos os temas claro e escuro, sem filtros CSS que alterem a logo.
        */}
        <Link
          to="/"
          className="group block w-full rounded-2xl bg-white dark:bg-[#F4F8F7] px-4 py-3.5 shadow-md ring-1 ring-black/5 transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#20BFA9]"
          title="Grupo EPA - Página Inicial"
        >
          <div className="flex items-center justify-center w-full py-0.5">
            <EpaLogo
              variant="full"
              size="custom"
              className="w-full max-w-[210px] h-auto object-contain transition-transform group-hover:scale-[1.02]"
            />
          </div>
        </Link>

        {/* Subtítulo institucional com separador sutil */}
        <div className="flex items-center justify-between px-1 pt-1 text-xs text-[#A7C4C0]">
          <span className="text-[10px] uppercase tracking-widest font-bold text-[#20BFA9]">
            Conciliação Financeira
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 font-medium text-white/80">
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
