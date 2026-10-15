import { ChartNoAxesCombined, Droplets, LayoutDashboard, Leaf, ScanSearch, Sprout, type LucideIcon } from "lucide-react";

export interface NavItem { to: string; label: string; icon: LucideIcon; short: string }

// Sidebar items — exact order
export const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, short: "Your farming overview" },
  { to: "/production", label: "Crop Production", icon: Sprout, short: "How much will my crop produce?" },
  { to: "/irrigation", label: "Pre-Irrigation", icon: Droplets, short: "Does my field need water today?" },
  { to: "/leaf-prediction", label: "Leaf Prediction", icon: Leaf, short: "Is my plant sick?" },
  { to: "/crop-price", label: "Crop Price", icon: ChartNoAxesCombined, short: "What price will my crop get?" },
  { to: "/crop-analysis", label: "Crop Analysing", icon: ScanSearch, short: "Which crop should I grow?" },
];
