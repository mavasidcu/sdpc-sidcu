import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { MotionConfig } from "framer-motion";
import superjson from "superjson";
import { trpc } from "./lib/trpc";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* reducedMotion="user" respeta prefers-reduced-motion del SO/navegador --
        framer-motion desactiva animaciones de transform/opacity automaticamente
        para todo motion.* del arbol, sin tocar cada pagina (WCAG 2.3.3). */}
    <MotionConfig reducedMotion="user">
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </trpc.Provider>
    </MotionConfig>
  </StrictMode>,
);
