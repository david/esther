import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { NotifyingReadModelStore } from "./notifying-adapter";

// ── Projection state ──────────────────────────────────────────────────

export type ProjectionState<T> =
  | { readonly status: "loading" }
  | { readonly status: "found"; readonly value: T }
  | { readonly status: "not-found" };

// ── Context ───────────────────────────────────────────────────────────

type DispatchFn = (sliceName: string, input: unknown) => Promise<unknown>;

type EstherContextValue = {
  readonly readModelStore: NotifyingReadModelStore;
  readonly dispatch: DispatchFn;
};

const EstherContext = createContext<EstherContextValue | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────

type EstherProviderProps = {
  readonly readModelStore: NotifyingReadModelStore;
  readonly dispatch?: DispatchFn;
  readonly children: React.ReactNode;
};

const noopDispatch: DispatchFn = async () => {
  throw new Error("dispatch not configured in EstherProvider");
};

export function EstherProvider({ readModelStore, dispatch, children }: EstherProviderProps) {
  const value: EstherContextValue = {
    readModelStore,
    dispatch: dispatch ?? noopDispatch,
  };

  return createElement(EstherContext.Provider, { value }, children);
}

// ── useProjection ─────────────────────────────────────────────────────

export function useProjection<T>(name: string, id: string): ProjectionState<T> {
  const ctx = useContext(EstherContext);
  if (ctx === undefined) {
    throw new Error("useProjection must be used within an EstherProvider");
  }

  const { readModelStore } = ctx;
  const [state, setState] = useState<ProjectionState<T>>({ status: "loading" });
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const result = await readModelStore.get<T>(name, id);
    if (!mountedRef.current) return;

    if (result.isOk()) {
      setState({ status: "found", value: result.value });
    } else {
      setState({ status: "not-found" });
    }
  }, [readModelStore, name, id]);

  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch
    void refresh();

    // Subscribe to changes
    const unsubscribe = readModelStore.subscribe(() => {
      void refresh();
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [readModelStore, refresh]);

  return state;
}

// ── useDispatch ───────────────────────────────────────────────────────

export function useDispatch(): DispatchFn {
  const ctx = useContext(EstherContext);
  if (ctx === undefined) {
    throw new Error("useDispatch must be used within an EstherProvider");
  }
  return ctx.dispatch;
}

// ── Re-exports ────────────────────────────────────────────────────────

export {
  createInMemoryReadModelStore,
  createNotifyingReadModelStore,
  type NotifyingReadModelStore,
  type ReadModelStore,
} from "./notifying-adapter";
