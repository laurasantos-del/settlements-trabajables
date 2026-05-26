"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  fetchClientInteractions,
  fetchCommissions,
  fetchCreditorStatus,
  fetchExpectedPayments,
  fetchNewEnrollments,
  fetchPaymentNSF,
  fetchPaymentsCleared,
  fetchSettlementPayments,
  fetchSettlements,
  fetchSettlementsPerDate,
  fetchSummaryReport,
  isFastApiReachable
} from "@/lib/api";
import type { ReportStore } from "@/lib/types";

type DataContextValue = {
  store: ReportStore;
  loading: boolean;
  error: string;
  hasRealData: boolean;
  lastLoaded: string;
  reload: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

const emptyStore: ReportStore = {
  settlements: [],
  newEnrollments: [],
  clientInteractions: [],
  expectedClientPayments: [],
  settlementPayments: [],
  settlementsPerDate: [],
  creditorStatus: [],
  paymentsCleared: [],
  paymentNSF: [],
  summaryReport: [],
  commissions: [],
  clientLifecycle: []
};

export function DataProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<ReportStore>(emptyStore);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastLoaded, setLastLoaded] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [
        settlements,
        newEnrollments,
        clientInteractions,
        expectedClientPayments,
        settlementPayments,
        settlementsPerDate,
        creditorStatus,
        paymentsCleared,
        paymentNSF,
        summaryReport,
        commissions
      ] = await Promise.all([
        fetchSettlements(),
        fetchNewEnrollments(),
        fetchClientInteractions(),
        fetchExpectedPayments(),
        fetchSettlementPayments(),
        fetchSettlementsPerDate(),
        fetchCreditorStatus(),
        fetchPaymentsCleared(),
        fetchPaymentNSF(),
        fetchSummaryReport(),
        fetchCommissions()
      ]);

      const next: ReportStore = {
        settlements,
        newEnrollments,
        clientInteractions,
        expectedClientPayments,
        settlementPayments,
        settlementsPerDate,
        creditorStatus,
        paymentsCleared,
        paymentNSF,
        summaryReport,
        commissions,
        clientLifecycle: []
      };

      setStore(next);
      setLastLoaded(new Date().toLocaleString());
      const loadedAny = Object.values(next).some((rows) => rows?.length);
      if (!loadedAny) {
        const reachable = await isFastApiReachable();
        if (!reachable) {
          setError("Sin conexión con FastAPI. Asegúrate que el servidor está corriendo en http://127.0.0.1:8000");
        }
      }
    } catch (apiError) {
      console.error("FastAPI load failed", apiError);
      setStore(emptyStore);
      setError("Sin conexión con FastAPI. Asegúrate que el servidor está corriendo en http://127.0.0.1:8000");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const hasRealData = useMemo(() => Object.values(store).some((rows) => rows?.length), [store]);

  return (
    <DataContext.Provider
      value={{
        store,
        loading,
        error,
        hasRealData,
        lastLoaded,
        reload
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useReports() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useReports must be used within DataProvider");
  return context;
}
