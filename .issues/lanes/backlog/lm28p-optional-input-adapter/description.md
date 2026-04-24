# Make input adapter optional

Source: [proposed-improvements.md](../../../references/proposed-improvements.md)

`createApp()` currently requires an `inputAdapter` even for direct in-process usage and tests that do not need transport binding. Make direct dispatch first-class by allowing app creation without a mandatory transport/input adapter, or by layering transport binding separately.
