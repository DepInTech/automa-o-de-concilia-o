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
    <Sidebar className="border-r border-[#006B67]/30 bg-[#004D4A] dark:bg-[#043330] text-[#F1F5F4]">
      <SidebarHeader className="p-4 border-b border-white/10">
        <div className="flex items-center justify-center py-2 px-1">
          <EpaLogo size="md" />
        </div>
        <div className="mt-1 text-center">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-[#20C9A6]/90">
            Gestão Financeira
          </p>
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
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-[#F1F5F4] hover:bg-white/10 data-[active=true]:bg-[#008F83] data-[active=true]:text-white data-[active=true]:shadow-sm data-[active=true]:border-l-4 data-[active=true]:border-[#20C9A6]"
                >
                  <Link to="/">
                    <FileUp className="w-4 h-4 text-[#20C9A6]" />
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
        <span className="text-[11px] bg-white/10 px-2 py-0.5 rounded text-[#20C9A6]">v1.0.0</span>
      </SidebarFooter>
    </Sidebar>
  )
}
