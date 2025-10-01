import React from 'react';
import { Outlet } from 'react-router';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { GlobalHeader } from './global-header';

interface AppLayoutProps {
  children?: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider 
      defaultOpen={false}
      style={{
        "--sidebar-width": "320px",
        "--sidebar-width-mobile": "280px",
        "--sidebar-width-icon": "52px"
      } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="bg-bg-3 flex flex-col h-screen relative ">
        <GlobalHeader />
        <div className="flex-1 bg-bg-3">
          {children || <Outlet />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}