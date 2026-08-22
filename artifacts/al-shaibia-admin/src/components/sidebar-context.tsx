import { createContext, useContext } from "react";

export interface SidebarCtx {
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

export const SidebarContext = createContext<SidebarCtx>({
  collapsed: false,
  toggleCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
});

export const useSidebar = () => useContext(SidebarContext);
