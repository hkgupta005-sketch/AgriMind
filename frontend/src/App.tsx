import { lazy, Suspense, useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { AppLayout } from "./components/layout/AppLayout";
import { AssistantLauncher } from "./components/assistant/AssistantLauncher";
import { LoadingState } from "./components/ui/States";
import { SessionProvider } from "./context/SessionContext";
import { ToastProvider } from "./context/ToastContext";
import { AssistantProvider } from "./context/AssistantContext";
import LandingPage from "./pages/LandingPage";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ProductionPage = lazy(() => import("./pages/ProductionPage"));
const IrrigationPage = lazy(() => import("./pages/IrrigationPage"));
const LeafPage = lazy(() => import("./pages/LeafPage"));
const PricePage = lazy(() => import("./pages/PricePage"));
const CropAnalysisPage = lazy(() => import("./pages/CropAnalysisPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard", "/production": "Crop Production", "/irrigation": "Pre-Irrigation",
  "/leaf-prediction": "Leaf Prediction", "/crop-price": "Crop Price", "/crop-analysis": "Crop Analysing", "/settings": "Settings",
};

function PageEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = TITLES[pathname] ? `${TITLES[pathname]} · AgriMind` : "AgriMind — Grow Smarter. Farm Better.";
    if (pathname !== "/") window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <Compass className="mx-auto mb-4 h-10 w-10 text-neon" />
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-ink-muted">This path does not exist in AgriMind.</p>
        <Link to="/dashboard" className="btn-primary mt-6">Go to the dashboard</Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <AssistantProvider>
          <PageEffects />
          <Suspense fallback={<LoadingState label="Loading page…" className="min-h-screen" />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/production" element={<ProductionPage />} />
                <Route path="/irrigation" element={<IrrigationPage />} />
                <Route path="/leaf-prediction" element={<LeafPage />} />
                <Route path="/crop-price" element={<PricePage />} />
                <Route path="/crop-analysis" element={<CropAnalysisPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
          <AssistantLauncher />
        </AssistantProvider>
      </SessionProvider>
    </ToastProvider>
  );
}
