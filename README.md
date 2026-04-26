# wasm-zig

A ts utility allowing easier interaction with zig built wasm executable.

Two classes cover the two standard use cases:

- **`WasmExecutable`** — loads WASM on the main thread, plain `WebAssembly.Memory`
- **`WasmWorker`** — loads WASM inside a Web Worker with `SharedArrayBuffer`, main thread reads/writes memory directly without messaging

## Installation

```
npm install zig-wasm
```

## Usage

### WasmExecutable

Instantiates a `.wasm` binary on the main thread. All memory access is synchronous via typed array views over the underlying `WebAssembly.Memory`.

#### Example

```ts
import { WasmExecutable, WASM_TYPE } from "zig-wasm";

interface MyExports extends WebAssembly.Exports {
  tick(): void;
  score: WebAssembly.ExportValue;
  pixel_buf: WebAssembly.ExportValue;
}

const wasm = await WasmExecutable.create<MyExports>("/game.wasm");

// call an exported function
wasm.call("tick");

// read a scalar
const score = wasm.get("score", WASM_TYPE.U32);

// read a pixel buffer into an ImageData-ready array
const pixels = wasm.getImg("pixel_buf", width * height * 4);
ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
```

#### API reference

##### `create(url, options?)`

Fetches and instantiates the `.wasm` binary. Returns a `Promise<WasmExecutable<T>>`.

| Option          | Type                                                 | Description                                                                                   |
| --------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `memoryOptions` | `{ initial?: number, maximum?: number }`             | Override default memory limits (initial: 100 pages, max: 500 pages). The `shared` flag is set automatically and cannot be overridden. |
| `envImport`     | `WebAssembly.ModuleImports`                          | Additional imports merged into the `env` namespace alongside the built-in ones                |
| `fetchImport`   | `{ [exportKey]: { url, size, type, fetchOption? } }` | Pre-fetches binary data and writes it into the named export's memory address before resolving |

##### `call(key, ...args)`

Calls an exported WASM function by name.

```ts
wasm.call("tick");
wasm.call("set_difficulty", 3);
```

##### Memory access methods

All methods take a `key` that resolves to a linear memory address via the exported global symbol.

| Method                       | Description                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `get(key, type)`             | Read a single scalar (`i8`, `u8`, `u32`, `f32`)                                  |
| `set(key, type, val)`        | Write a single scalar                                                            |
| `getArr(key, type, len)`     | Typed array view (`Int8Array` / `Uint8Array` / `Uint32Array` / `Float32Array`)   |
| `setArr(key, type, ...vals)` | Write multiple scalars sequentially                                              |
| `getImg(key, len)`           | `Uint8ClampedArray` view, ready for `new ImageData(...)`         |
| `getText(key, len)`          | Decode UTF-8 bytes to a JS string                                |
| `getJSON(key, len)`          | Decode and parse JSON from WASM memory                           |

---

### WasmWorker

Runs the WASM module inside a dedicated Web Worker using `SharedArrayBuffer` memory. Once `create()` resolves, the main thread can read and write WASM memory **directly and synchronously** — no round-trip messages required for data access.

> **Requirements:** the page must be served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers to enable `SharedArrayBuffer`.

#### Bundler setup

`WasmWorker` spawns its worker with `new Worker(new URL("./worker.js", import.meta.url))`. The URL is resolved relative to the **bundled output file** at runtime, not the original source location. If your bundler inlines `WasmWorker` into a top-level bundle (e.g. `index.js`), `worker.js` must be emitted into the **same output directory**.

With esbuild, declare both entry points and use `outdir` instead of `outfile`:

```js
// esbuild.config.mjs
import { context } from "esbuild";

const ctx = await context({
  entryPoints: {
    index: "./index.ts",
    worker: "./node_modules/zig-wasm/dist/worker.js", // or your local path
  },
  outdir: ".",
  bundle: true,
  format: "esm",
});
```

This ensures `worker.js` lands next to `index.js` so the relative URL resolves correctly. Without this, the browser requests `worker.js` from the server root and receives an HTML 404 page, which is rejected with a MIME type error.

```ts
import { WasmWorker, WASM_TYPE } from "zig-wasm";

const wasm = await WasmWorker.create<MyExports>("/game.wasm");

// execute a WASM function in the worker thread
await wasm.call("tick");

// read shared memory from the main thread — zero-copy, no messaging
const pixels = wasm.getImg("pixel_buf", width * height * 4);
ctx.putImageData(new ImageData(pixels, width, height), 0, 0);

// write directly into shared memory
wasm.set("input_state", WASM_TYPE.U32, 0b0101);

wasm.terminate();
```

#### API reference

##### `create(url, options?)`

Spawns the Web Worker, loads the `.wasm` binary inside it with a `SharedArrayBuffer`-backed memory, and resolves once ready. Accepts `WasmWorkerOptions`, which has the same fields as `WasmExecutableOptions` — note that `envImport` functions run in the worker thread and `memoryOptions.shared` is always forced to `true`.

##### `call(fn, ...args)`

Sends a call request to the worker thread and returns `Promise<unknown>` that resolves with the function's return value.

```ts
await wasm.call("tick");
const result = await wasm.call("compute", 42);
```

##### `terminate()`

Shuts down the underlying Web Worker.

##### `buffer`

The raw `SharedArrayBuffer` backing WASM linear memory, available after `create()` resolves. Useful for constructing typed array views at arbitrary byte offsets when you have a raw pointer.

```ts
const view = new Uint8Array(wasm.buffer!, ptr, len);
```

##### `exports`

A map of exported global names to their resolved memory addresses in the shared WASM buffer, available after `create()` resolves. Mirrors `WasmExecutable.exports` but holds pre-resolved numeric pointers rather than raw `WebAssembly.ExportValue` objects.

```ts
const addr = wasm.exports["pixel_buf"];
```

##### Memory access methods

Reads and writes go directly to the `SharedArrayBuffer` — synchronous, zero-copy.

| Method                       | Description                              |
| ---------------------------- | ---------------------------------------- |
| `get(key, type)`             | Read a single scalar from shared memory  |
| `set(key, type, val)`        | Write a single scalar to shared memory   |
| `getArr(key, type, len)`     | Typed array view over shared memory      |
| `setArr(key, type, ...vals)` | Write multiple scalars sequentially      |
| `getImg(key, len)`           | Copies pixel data into a new `Uint8ClampedArray` backed by a regular `ArrayBuffer`, required for `ImageData` (canvas rejects `SharedArrayBuffer` views) |
| `getText(key, len)`          | Decode UTF-8 text from shared memory     |
| `getJSON(key, len)`          | Decode and parse JSON from shared memory |

---

### WasmMemory

`WasmMemory` is exported and can be used as a type annotation. `WasmExecutable` exposes its underlying memory as `wasm.memory`, a `WasmMemory` instance wrapping the `WebAssembly.Memory` object. The high-level methods on `WasmExecutable` (like `get`, `getImg`) resolve an exported global name to a pointer and then delegate here. When you already have a raw pointer — for example the return value of a WASM function — you can call `WasmMemory` methods directly to avoid the name lookup.

```ts
// a WASM function returns a pointer to a struct
const ptr = wasm.call("alloc_player") as number;

// read fields at known byte offsets from that pointer
const x = wasm.memory.getF32(ptr + 0);
const y = wasm.memory.getF32(ptr + 4);
const lives = wasm.memory.getU8(ptr + 8);

// or build a DataView over the whole struct
const view = wasm.memory.view(ptr, 12);
const flags = view.getUint8(9);
```

For `WasmWorker` there is no `WasmMemory` instance — the memory lives in the worker thread. Use `wasm.buffer` directly to construct typed arrays at raw pointers on the main thread.

#### API reference

| Property / Method           | Returns              | Description                                                  |
| --------------------------- | -------------------- | ------------------------------------------------------------ |
| `memory`                    | `WebAssembly.Memory` | The underlying memory object; `.buffer` is the `ArrayBuffer` |
| `view(ptr?, len?)`          | `DataView`           | `DataView` scoped to `[ptr, ptr+len)` in linear memory       |
| `getI8(ptr)`                | `number`             | Read a single `i8`                                           |
| `getI8Array(ptr?, len?)`    | `Int8Array`          | View over `[ptr, ptr+len)`                                   |
| `setI8(ptr, val)`           | `void`               | Write a single `i8`                                          |
| `setI8Array(ptr, ...vals)`  | `void`               | Write multiple `i8` values sequentially                      |
| `getU8(ptr)`                | `number`             | Read a single `u8`                                           |
| `getU8Array(ptr?, len?)`    | `Uint8Array`         | View over `[ptr, ptr+len)`                                   |
| `setU8(ptr, val)`           | `void`               | Write a single `u8`                                          |
| `setU8Array(ptr, ...vals)`  | `void`               | Write multiple `u8` values sequentially                      |
| `getU32(ptr)`               | `number`             | Read a little-endian `u32`                                   |
| `getU32Array(ptr?, len?)`   | `Uint32Array`        | View over `[ptr, ptr+len*4)`                                 |
| `setU32(ptr, val)`          | `void`               | Write a little-endian `u32`                                  |
| `setU32Array(ptr, ...vals)` | `void`               | Write multiple little-endian `u32` values sequentially       |
| `getF32(ptr)`               | `number`             | Read a little-endian `f32`                                   |
| `getF32Array(ptr?, len?)`   | `Float32Array`       | View over `[ptr, ptr+len*4)`                                 |
| `setF32(ptr, val)`          | `void`               | Write a little-endian `f32`                                  |
| `setF32Array(ptr, ...vals)` | `void`               | Write multiple little-endian `f32` values sequentially       |
| `getImgBuffer(ptr, len)`    | `Uint8ClampedArray`  | View suitable as `ImageData` pixel data                      |

---

## Building the WASM blob

The Zig side must be compiled for `wasm32-freestanding` with memory imported from the JS host. A minimal `build.zig` looks like this:

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    // atomics + bulk_memory are required for SharedArrayBuffer (WasmWorker)
    var cpu_features = std.Target.Cpu.Feature.Set.empty;
    cpu_features.addFeature(@intFromEnum(std.Target.wasm.Feature.atomics));
    cpu_features.addFeature(@intFromEnum(std.Target.wasm.Feature.bulk_memory));

    const target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .freestanding,
        .cpu_features_add = cpu_features,
    });

    const optimize = b.standardOptimizeOption(.{});

    const exe_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });

    // List every function that JS will call via wasm.call().
    // Without this the linker treats them as dead code and strips them.
    exe_mod.export_symbol_names = &.{
        "init",
        "tick",
    };

    const exe = b.addExecutable(.{
        .name = "game",
        .root_module = exe_mod,
    });

    exe.entry = .disabled;       // no main — exported functions are the API
    exe.import_symbols = true;   // imports from the JS `env` namespace (jsLog, now, rand …)
    exe.import_memory = true;    // memory is provided by the JS host
    exe.shared_memory = true;    // required for WasmWorker (SharedArrayBuffer)

    // Memory sizes must match the JS side (1 WASM page = 65536 bytes):
    //   initial_memory <= JS memoryOptions.initial * 65536
    //   max_memory must equal JS memoryOptions.maximum * 65536 exactly
    // The defaults in WasmWorker are initial=100, maximum=500 pages.
    exe.initial_memory = 100 * 65536; // 100 pages
    exe.max_memory = 500 * 65536; // 500 pages

    b.installArtifact(exe);
}
```

Build and output the `.wasm` binary:

```sh
# debug
zig build

# optimised
zig build -Doptimize=ReleaseFast
```

The binary is written to `zig-out/bin/<name>.wasm`.

> **Memory size constraints for shared memory:** `import_memory = true` hands off memory ownership to JS; `shared_memory = true` marks it as a `SharedArrayBuffer`; `atomics` + `bulk_memory` enable the required CPU instructions. On top of that, `max_memory` in Zig must equal `maximum * 65536` from the JS `memoryOptions` **exactly** — a mismatch produces an "incompatible memory size" error at instantiation. `initial_memory` in Zig only sets the binary's declared minimum and must be `≤ initial * 65536` from JS. If you need more than 500 pages (32 MB), change both `max_memory` here and pass `memoryOptions: { initial: …, maximum: … }` to `WasmWorker.create`.

---

## Zig side — `js.zig`

The built-in imports (`jsLog`, `jsError`, `now`, `rand`) correspond directly to `src/lib/js.zig`. Copy it into your Zig project to get formatted logging and JS interop with no boilerplate.

```zig
const js = @import("lib/js.zig");

export fn tick() void {
    const t = js.now();        // performance.now()
    const r = js.rand();       // Math.random()

    js.log("tick at {d:.2}ms", .{t});

    if (something_went_wrong) {
        js.err(error.BadState); // logs "WASM error :: BadState" via console.error
    }
}
```

### `js.zig`

Drop this file into your Zig project. It implements the four symbols that `WasmExecutable` and `WasmWorker` inject into the `env` import namespace, and exposes two public helpers for formatted logging.

```zig
const std = @import("std");

extern fn jsLog(ptr: [*]const u8, len: usize) void;
extern fn jsError(ptr: [*]const u8, len: usize) void;

pub extern fn now() f64;
pub extern fn rand() f64;

pub fn log(comptime fmt: []const u8, args: anytype) void {
    var buf: [4096]u8 = undefined;
    const msg = std.fmt.bufPrint(&buf, fmt, args) catch |e| return err(e);
    jsLog(msg.ptr, msg.len);
}

pub fn err(e: anyerror) void {
    var buf: [256]u8 = undefined;
    const msg = std.fmt.bufPrint(&buf, "WASM error :: {s}", .{@errorName(e)}) catch return;
    jsError(msg.ptr, msg.len);
}
```

- **`now()`** — returns `performance.now()` from the JS host
- **`rand()`** — returns `Math.random()` from the JS host
- **`log(fmt, args)`** — formats with `std.fmt.bufPrint` (4 KB stack buffer) and writes to `console.log`
- **`err(e)`** — formats as `"WASM error :: <name>"` (256 B stack buffer) and writes to `console.error`
