# Add event-store adapter conformance tests

Source: current session

Append precondition semantics are currently implemented separately in the in-memory, filesystem, and postgres event-store adapters. The duplication is intentional because adapters own their persistence behavior, but the shared contract can drift over time.

Add a reusable adapter conformance test suite or fixture for the `EventStore.append(...)` precondition contract so each adapter can run the same semantic checks while keeping adapter implementations separate.

The contract should cover at least:
- `append(events)` means no precondition.
- Present `AppendOptions` always activates a precondition.
- `expectedPosition: undefined` means the selected boundary must be empty.
- `boundaryTags: undefined` and `boundaryTags: []` both select the global stream boundary.
- Stale tagged and global boundaries return the expected `ConcurrencyError` shape.

Prefer shared tests/fixtures over shared adapter implementation unless implementation duplication becomes clearly harmful.
