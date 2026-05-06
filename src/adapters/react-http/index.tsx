import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createHttpReadModelQueryClient,
  type HttpReadModelQueryClient,
} from "../http/index.js";
import type {
  ReadModelQueryCardinality,
  ReadModelQueryHandle,
  ReadModelQueryResult,
} from "../../core/read-model.js";

export type ReadModelQueryCacheOption = false | true | { readonly staleMs: number };

export type ReadModelQueryState<T> =
  | {
      readonly status: "idle";
      readonly data: undefined;
      readonly error: undefined;
      readonly previousData: T | undefined;
      readonly refetch: () => Promise<void>;
    }
  | {
      readonly status: "loading";
      readonly data: undefined;
      readonly error: undefined;
      readonly previousData: T | undefined;
      readonly refetch: () => Promise<void>;
    }
  | {
      readonly status: "success";
      readonly data: T;
      readonly error: undefined;
      readonly previousData: undefined;
      readonly refetch: () => Promise<void>;
    }
  | {
      readonly status: "error";
      readonly data: undefined;
      readonly error: unknown;
      readonly previousData: T | undefined;
      readonly refetch: () => Promise<void>;
    };

export type UseReadModelQueryOptions = {
  readonly enabled: boolean;
  readonly cache: ReadModelQueryCacheOption;
};

type CacheEntry = {
  readonly data: unknown;
  readonly storedAt: number;
};

type InFlightEntry = {
  readonly promise: Promise<unknown>;
};

const completedCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, InFlightEntry>();

const EstherHttpContext = createContext<HttpReadModelQueryClient | undefined>(undefined);
const defaultClient = createHttpReadModelQueryClient();

export function EstherHttpProvider(input: {
  readonly client: HttpReadModelQueryClient;
  readonly children: React.ReactNode;
}) {
  return createElement(EstherHttpContext.Provider, { value: input.client }, input.children);
}

function cacheFresh(entry: CacheEntry, cache: ReadModelQueryCacheOption): boolean {
  if (cache === false) return false;
  if (cache === true) return true;
  return Date.now() - entry.storedAt <= cache.staleMs;
}

function queryCacheKey<T, TInput, TCardinality extends ReadModelQueryCardinality>(
  handle: ReadModelQueryHandle<T, TInput, TCardinality>,
  input: TInput,
): string {
  const parsed = handle.inputSchema.safeParse(input);
  const value = parsed.success ? parsed.data : input;
  return `${handle.name}:${JSON.stringify(value)}`;
}

function cacheDependencyKey(cache: ReadModelQueryCacheOption): string {
  if (cache === false) return "false";
  if (cache === true) return "true";
  return `stale:${cache.staleMs}`;
}

function initialState<T>(refetch: () => Promise<void>): ReadModelQueryState<T> {
  return {
    status: "idle",
    data: undefined,
    error: undefined,
    previousData: undefined,
    refetch,
  };
}

export function useReadModelQuery<
  T,
  TInput,
  TCardinality extends ReadModelQueryCardinality,
>(
  handle: ReadModelQueryHandle<T, TInput, TCardinality>,
  input: TInput,
  options: UseReadModelQueryOptions,
): ReadModelQueryState<ReadModelQueryResult<T, TCardinality>> {
  const contextClient = useContext(EstherHttpContext);
  const client = contextClient ?? defaultClient;
  const previousDataRef = useRef<ReadModelQueryResult<T, TCardinality> | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const inputRef = useRef(input);
  inputRef.current = input;
  const key = queryCacheKey(handle, input);
  const cacheKey = cacheDependencyKey(options.cache);
  const refetchRef = useRef<() => Promise<void>>(async () => {});
  const refetch = useCallback(async (): Promise<void> => refetchRef.current(), []);
  const [state, setState] = useState<ReadModelQueryState<ReadModelQueryResult<T, TCardinality>>>(
    () => initialState(refetch),
  );

  const run = useCallback(
    async (bypassCache: boolean): Promise<void> => {
      if (!options.enabled) {
        setState({
          status: "idle",
          data: undefined,
          error: undefined,
          previousData: previousDataRef.current,
          refetch,
        });
        return;
      }

      if (!bypassCache) {
        const cached = completedCache.get(key);
        if (cached !== undefined && cacheFresh(cached, options.cache)) {
          const data = cached.data as ReadModelQueryResult<T, TCardinality>;
          previousDataRef.current = data;
          setState({
            status: "success",
            data,
            error: undefined,
            previousData: undefined,
            refetch,
          });
          return;
        }
      }

      const staleCached = completedCache.get(key);
      setState({
        status: "loading",
        data: undefined,
        error: undefined,
        previousData:
          staleCached === undefined
            ? previousDataRef.current
            : (staleCached.data as ReadModelQueryResult<T, TCardinality>),
        refetch,
      });

      abortRef.current?.abort("read model query replaced");
      const controller = new AbortController();
      abortRef.current = controller;

      let entry = bypassCache ? undefined : inFlight.get(key);
      if (entry === undefined) {
        const promise = client.execute(handle, inputRef.current, { signal: controller.signal });
        entry = { promise };
        inFlight.set(key, entry);
        void promise.then(
          () => {
            if (inFlight.get(key) === entry) {
              inFlight.delete(key);
            }
          },
          () => {
            if (inFlight.get(key) === entry) {
              inFlight.delete(key);
            }
          },
        );
      }

      try {
        const data = (await entry.promise) as ReadModelQueryResult<T, TCardinality>;
        if (abortRef.current !== controller && !bypassCache) return;
        if (options.cache !== false) {
          completedCache.set(key, { data, storedAt: Date.now() });
        }
        previousDataRef.current = data;
        setState({
          status: "success",
          data,
          error: undefined,
          previousData: undefined,
          refetch,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          data: undefined,
          error,
          previousData: previousDataRef.current,
          refetch,
        });
      }
    },
    [client, handle, key, cacheKey, options.enabled, refetch],
  );

  useEffect(() => {
    refetchRef.current = async () => {
      if (!options.enabled) return;
      await run(true);
    };
  }, [options.enabled, run]);

  useEffect(() => {
    if (!options.enabled) {
      setState({
        status: "idle",
        data: undefined,
        error: undefined,
        previousData: previousDataRef.current,
        refetch,
      });
      return;
    }

    void run(false);

    return () => {
      abortRef.current?.abort("read model query unmounted");
    };
  }, [options.enabled, refetch, run]);

  return state;
}
