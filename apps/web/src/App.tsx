import React, { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { OperationalProvider, useOperational } from "./context/OperationalContext";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardView } from "./views/DashboardView";
import { PracticeDeskView } from "./views/PracticeDeskView";
import { CentersView } from "./views/CentersView";
import { DataIntakeView } from "./views/DataIntakeView";
import { ReconciliationView } from "./views/ReconciliationView";
import { AuditLedgerView } from "./views/AuditLedgerView";
import { LoginView } from "./views/LoginView";
import { ReviewAcceptModal } from "./components/modals/ReviewAcceptModal";
import { RecordMovementModal } from "./components/modals/RecordMovementModal";

const AuthenticatedTerminal: React.FC = () => {
  const { activePage } = useOperational();
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isRecordMovementModalOpen, setIsRecordMovementModalOpen] = useState(false);

  return (
    <AppLayout
      onOpenPublishModal={() => setIsPublishModalOpen(true)}
      onOpenRecordMovementModal={() => setIsRecordMovementModalOpen(true)}
    >
      {activePage === "dashboard" && <DashboardView />}
      {activePage === "studio" && (
        <PracticeDeskView onOpenAcceptModal={() => setIsPublishModalOpen(true)} />
      )}
      {activePage === "centers" && <CentersView />}
      {activePage === "intake" && <DataIntakeView />}
      {activePage === "reconciliation" && (
        <ReconciliationView onOpenRecordModal={() => setIsRecordMovementModalOpen(true)} />
      )}
      {activePage === "audit" && <AuditLedgerView />}

      {/* Published Plan Modal */}
      <ReviewAcceptModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
      />

      {/* Movement Waybill Modal */}
      <RecordMovementModal
        isOpen={isRecordMovementModalOpen}
        onClose={() => setIsRecordMovementModalOpen(false)}
      />
    </AppLayout>
  );
};

const RootRouter: React.FC = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <OperationalProvider>
      <AuthenticatedTerminal />
    </OperationalProvider>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <RootRouter />
    </AuthProvider>
  );
};

export default App;
