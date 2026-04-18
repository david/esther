import { describe, expect, test } from "bun:test";
import {
  createApp,
  createInMemoryAdapter,
  createInMemoryEventStore,
  createInMemoryProjectionAdapter,
  defineQuerySlice,
  defineReadModel,
  defineReadModelQuery,
  projection,
  state,
} from "../index";
import { err, ok } from "neverthrow";
import { z } from "zod";

type SongRow = {
  readonly songId: string;
  readonly title: string;
};

const songs = defineReadModel({
  name: "test_songs",
  key: "songId",
  schema: z.object({
    songId: z.string(),
    title: z.string(),
  }),
});

const allSongs = defineReadModelQuery({
  name: "test_songs_all",
  source: songs,
  args: z.object({}),
  resolve: () => ({ where: {}, orderBy: "title" }),
});

describe("query slice list projections", () => {
  test("projection({ many: true }) returns all matching rows", async () => {
    const eventStore = createInMemoryEventStore();
    const input = createInMemoryAdapter();
    const songsProjection = createInMemoryProjectionAdapter(songs);

    const listSongs = defineQuerySlice({
      name: "songs/list-many",
      inputSchema: z.object({}),
      outputSchema: z.array(songs.schema),
      state: state<Record<string, never>>().pipe(
        projection({
          key: "rows" as const,
          model: allSongs,
          args: () => ({}),
          many: true,
        }),
      ),
      handle: (ctx) => ok(ctx.rows),
    });

    const app = createApp({
      eventStore,
      projectionAdapters: [
        {
          kind: "table",
          adapter: songsProjection.adapter,
          get: songsProjection.get,
          constraints: songs.constraints,
          tableName: "test_songs",
          handle: songs,
        },
      ],
      projectionQuery: {
        query: async (name, entries, orderBy, limit, orderDirection) => {
          if (name !== songs.name) {
            return [];
          }
          return songsProjection.query(entries, orderBy, limit, orderDirection);
        },
      },
      inputAdapter: input,
      slices: [listSongs],
    });

    await songsProjection.adapter.execute(
      songs.project({ songId: "song-2", title: "Vem" }, "insert"),
    );
    await songsProjection.adapter.execute(
      songs.project({ songId: "song-1", title: "Aclame" }, "insert"),
    );

    const result = await app.dispatch("songs/list-many", {});
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      { songId: "song-1", title: "Aclame" },
      { songId: "song-2", title: "Vem" },
    ] satisfies ReadonlyArray<SongRow>);
  });

  test("single-row projection rejects malformed persisted rows", async () => {
    const eventStore = createInMemoryEventStore();
    const input = createInMemoryAdapter();

    const getSong = defineQuerySlice({
      name: "songs/get-one",
      inputSchema: z.object({ songId: z.string() }),
      outputSchema: songs.schema,
      state: state<{ songId: string }>().pipe(
        projection({
          key: "row" as const,
          model: songs,
          id: (ctx: { songId: string }) => ctx.songId,
          required: true,
        }),
      ),
      handle: (ctx) => ok(ctx.row),
    });

    const app = createApp({
      eventStore,
      projectionAdapters: [
        {
          kind: "view",
          name: songs.name,
          get: async () => ok({ value: { songId: "song-1", title: 42 } }),
        },
      ],
      inputAdapter: input,
      slices: [getSong],
    });

    const result = await app.dispatch("songs/get-one", { songId: "song-1" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const error = result.error as {
        readonly _tag: string;
        readonly readModelName: string;
        readonly queryName?: string;
      };
      expect(error._tag).toBe("ReadModelSchemaError");
      expect(error.readModelName).toBe("test_songs");
      expect(error.queryName).toBeUndefined();
    }
  });

  test("single-row query projection rejects malformed rows before handle", async () => {
    const eventStore = createInMemoryEventStore();
    const input = createInMemoryAdapter();
    let handleCalled = false;

    const getSong = defineQuerySlice({
      name: "songs/get-one-by-query",
      inputSchema: z.object({}),
      outputSchema: songs.schema,
      state: state<Record<string, never>>().pipe(
        projection({
          key: "row" as const,
          model: allSongs,
          args: () => ({}),
          required: true,
        }),
      ),
      handle: (ctx) => {
        handleCalled = true;
        return ok(ctx.row);
      },
    });

    const app = createApp({
      eventStore,
      projectionQuery: {
        query: async () => [{ songId: "song-1", title: 42 }],
      },
      inputAdapter: input,
      slices: [getSong],
    });

    const result = await app.dispatch("songs/get-one-by-query", {});
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const error = result.error as {
        readonly _tag: string;
        readonly readModelName: string;
        readonly queryName?: string;
      };
      expect(error._tag).toBe("ReadModelSchemaError");
      expect(error.readModelName).toBe("test_songs");
      expect(error.queryName).toBe("test_songs_all");
    }
    expect(handleCalled).toBe(false);
  });

  test("projection({ many: true }) fails the whole query on malformed rows", async () => {
    const eventStore = createInMemoryEventStore();
    const input = createInMemoryAdapter();

    const listSongs = defineQuerySlice({
      name: "songs/list-many-malformed",
      inputSchema: z.object({}),
      outputSchema: z.array(songs.schema),
      state: state<Record<string, never>>().pipe(
        projection({
          key: "rows" as const,
          model: allSongs,
          args: () => ({}),
          many: true,
        }),
      ),
      handle: (ctx) => ok(ctx.rows),
    });

    const app = createApp({
      eventStore,
      projectionQuery: {
        query: async () => [
          { songId: "song-1", title: "Aclame" },
          { songId: "song-2", title: 42 },
        ],
      },
      inputAdapter: input,
      slices: [listSongs],
    });

    const result = await app.dispatch("songs/list-many-malformed", {});
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const error = result.error as {
        readonly _tag: string;
        readonly readModelName: string;
        readonly queryName?: string;
      };
      expect(error._tag).toBe("ReadModelSchemaError");
      expect(error.readModelName).toBe("test_songs");
      expect(error.queryName).toBe("test_songs_all");
    }
  });

  test("query slices can return custom typed errors", async () => {
    const eventStore = createInMemoryEventStore();
    const input = createInMemoryAdapter();
    const songsProjection = createInMemoryProjectionAdapter(songs);

    const authenticatedListInputSchema = z.object({ sessionToken: z.string().optional() });
    type AuthenticatedListInput = z.infer<typeof authenticatedListInputSchema>;

    const authenticatedList = defineQuerySlice<
      AuthenticatedListInput,
      AuthenticatedListInput,
      ReadonlyArray<SongRow>,
      { readonly type: "MissingSession" }
    >({
      name: "songs/auth-list",
      inputSchema: authenticatedListInputSchema,
      outputSchema: z.array(songs.schema),
      state: state<AuthenticatedListInput>(),
      handle: (ctx) => {
        if (!ctx.sessionToken) {
          return err({ type: "MissingSession" as const });
        }
        return ok([]);
      },
    });

    const app = createApp({
      eventStore,
      projectionAdapters: [
        {
          kind: "table",
          adapter: songsProjection.adapter,
          get: songsProjection.get,
          constraints: songs.constraints,
          tableName: "test_songs",
          handle: songs,
        },
      ],
      inputAdapter: input,
      slices: [authenticatedList],
    });

    const result = await app.dispatch("songs/auth-list", {});
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ type: "MissingSession" });
  });
});
