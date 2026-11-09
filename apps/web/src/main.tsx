import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <main>
        <p>FairShare</p>
        <h1>Fair food. Clear decisions.</h1>
        <p>Plan, explain, reconcile, and replan food distribution.</p>
        <p>The project foundation is ready. Planning tools are not implemented yet.</p>
      </main>
    </QueryClientProvider>
  </React.StrictMode>,
);
