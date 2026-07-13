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

import { FileUp, FileCheck2 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar>
      <SidebarHeader className="p-4 flex flex-row items-center gap-3">
        <div className="bg-slate-900 dark:bg-white p-1.5 rounded-lg">
          <FileCheck2 className="w-5 h-5 text-white dark:text-slate-900" />
        </div>
        <span className="font-bold text-lg text-slate-900 dark:text-white">GRUPO EPA</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.pathname === '/'}>
                  <Link to="/">
                    <FileUp /> <span>Upload de Dados</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 text-xs text-slate-500">GRUPO EPA v1.0.0</SidebarFooter>
    </Sidebar>
  )
}
