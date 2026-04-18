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
