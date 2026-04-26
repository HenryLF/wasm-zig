declare enum WASM_TYPE {
    I8 = "i8",
    U8 = "u8",
    F32 = "f32",
    U32 = "u32"
}
/** Keys of `T` whose values are callable (i.e. exported WASM functions). */
type FnKeys<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];
/** Keys of `T` whose values are pointers (i.e. exported WASM globals). */
type GlobalKeys<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];
/** A single pre-fetch declaration: binary data to load into a WASM global before first use. */
interface FetchImportEntry {
    url: string;
    fetchOption?: RequestInit;
    size: number;
    type: WASM_TYPE;
}
/** Options for {@link WasmExecutable.create}. All JS imports run on the main thread. */
interface WasmExecutableOptions<T extends WebAssembly.Exports = {}> {
    /** Additional symbols merged into the `env` import namespace alongside the built-ins (`jsLog`, `jsError`, `now`, `rand`). */
    envImport?: WebAssembly.ModuleImports;
    /** Overrides for the `WebAssembly.Memory` descriptor. `shared` is always `false` for `WasmExecutable`. */
    memoryOptions?: Omit<WebAssembly.MemoryDescriptor, "shared">;
    /** Fetch binary resources at startup and write them into the named WASM globals before `create()` resolves. */
    fetchImport?: {
        [k in GlobalKeys<T>]?: FetchImportEntry;
    };
}
/** Options for {@link WasmWorker.create}. All JS imports run inside the dedicated Web Worker thread. */
interface WasmWorkerOptions<T extends WebAssembly.Exports = {}> {
    /** Additional symbols merged into the `env` import namespace. These functions execute in the worker thread. */
    envImport?: WebAssembly.ModuleImports;
    /** Overrides for the `WebAssembly.Memory` descriptor. `shared` is always forced to `true` by the worker. */
    memoryOptions?: Omit<WebAssembly.MemoryDescriptor, "shared">;
    /** Fetch binary resources at startup and write them into the named WASM globals before `create()` resolves. */
    fetchImport?: {
        [k in GlobalKeys<T>]?: FetchImportEntry;
    };
}

declare class WasmMemory {
    memory: WebAssembly.Memory;
    /** Returns a `DataView` scoped to the given byte range in WASM linear memory. */
    view(ptr?: number, len?: number): DataView<ArrayBuffer>;
    constructor(memory: WebAssembly.Memory);
    /** Reads a single `u8` at `ptr`. */
    getU8(ptr: number): number;
    /** Returns a `Uint8Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
    getU8Array(ptr?: number, len?: number): Uint8Array;
    /** Writes a single `u8` at `ptr`. */
    setU8(ptr: number, val: number): void;
    /** Writes multiple `u8` values starting at `ptr`. */
    setU8Array(ptr: number, ...vals: number[]): void;
    /** Reads a single `i8` at `ptr`. */
    getI8(ptr: number): number;
    /** Returns a `Int8Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
    getI8Array(ptr?: number, len?: number): Int8Array;
    /** Writes a single `i8` at `ptr`. */
    setI8(ptr: number, val: number): void;
    /** Writes multiple `i8` values starting at `ptr`. */
    setI8Array(ptr: number, ...vals: number[]): void;
    /** Reads a single little-endian `u32` at `ptr`. */
    getU32(ptr: number): number;
    /** Returns a `Uint32Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
    getU32Array(ptr?: number, len?: number): Uint32Array;
    /** Writes a single little-endian `u32` at `ptr`. */
    setU32(ptr: number, val: number): void;
    /** Writes multiple little-endian `u32` values starting at `ptr`. */
    setU32Array(ptr: number, ...vals: number[]): void;
    /** Reads a single little-endian `f32` at `ptr`. */
    getF32(ptr: number): number;
    /** Returns a `Float32Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
    getF32Array(ptr?: number, len?: number): Float32Array;
    /** Writes a single little-endian `f32` at `ptr`. */
    setF32(ptr: number, val: number): void;
    /** Writes multiple little-endian `f32` values starting at `ptr`. */
    setF32Array(ptr: number, ...vals: number[]): void;
    /** Returns a `Uint8ClampedArray` view into WASM memory at `ptr`, suitable for use as `ImageData` pixel data. */
    getImgBuffer(ptr: number, len: number): Uint8ClampedArray<ArrayBuffer>;
}

declare class WasmExecutable<T extends WebAssembly.Exports> {
    readonly memory: WasmMemory;
    readonly exports: Partial<T>;
    private constructor();
    /** Fetches a `.wasm` binary, instantiates it with shared imports, and pre-loads any declared `fetchImport` data into WASM memory. */
    static create<T extends WebAssembly.Exports = {}>(url: string, options?: WasmExecutableOptions<T>): Promise<WasmExecutable<T>>;
    private getPointer;
    /** Reads a single numeric value from WASM linear memory at the address of the exported symbol. */
    get(key: GlobalKeys<T>, asType: WASM_TYPE): number;
    /** Returns a typed array view into WASM linear memory starting at the address of the exported symbol. */
    getArr(key: GlobalKeys<T>, asType: WASM_TYPE, len: number): Int8Array | Uint8Array | Uint32Array | Float32Array;
    /** Writes a single numeric value into WASM linear memory at the address of the exported symbol. */
    set(key: GlobalKeys<T>, asType: WASM_TYPE, val: number): void;
    /** Writes multiple values sequentially into WASM linear memory starting at the address of the exported symbol. */
    setArr(key: GlobalKeys<T>, asType: WASM_TYPE, ...vals: number[]): void;
    /** Returns a `Uint8ClampedArray` view of pixel data at the exported symbol's address, ready for use with `ImageData`. */
    getImg(key: GlobalKeys<T>, len: number): Uint8ClampedArray<ArrayBuffer>;
    /** Decodes UTF-8 bytes from WASM memory at the exported symbol's address into a JS string. */
    getText(key: GlobalKeys<T>, len: number): string;
    /** Parses a JSON string from WASM memory at the exported symbol's address. */
    getJSON(key: GlobalKeys<T>, len: number): unknown;
    /** Calls an exported WASM function by key. Throws if the export is not a function. */
    call(key: FnKeys<T>, ...args: unknown[]): unknown;
}

declare class WasmWorker<T extends WebAssembly.Exports> {
    buffer: SharedArrayBuffer | null;
    private _pointers;
    private mainCallbacks;
    /** Maps exported global names to their memory addresses in the shared WASM buffer. */
    get exports(): Partial<Record<keyof T, number>>;
    private worker;
    private pending;
    private seq;
    private constructor();
    /** Creates a `WasmWorker`, loads the `.wasm` binary inside a dedicated Web Worker with shared memory, and resolves once ready. */
    static create<T extends WebAssembly.Exports = {}>(url: string, options?: WasmWorkerOptions<T>): Promise<WasmWorker<T>>;
    private init;
    private send;
    private ptr;
    /** Returns a typed array view directly into the shared WASM memory — zero-copy, synchronous. */
    getArr(key: GlobalKeys<T>, asType: WASM_TYPE, len: number): Uint8Array | Uint32Array | Float32Array | Int8Array;
    /** Reads a single numeric value directly from the shared WASM memory. */
    get(key: GlobalKeys<T>, asType: WASM_TYPE): number;
    /** Copies pixel data out of shared WASM memory into a regular `ArrayBuffer`, ready for use with `ImageData`. */
    getImg(key: GlobalKeys<T>, len: number): Uint8ClampedArray<ArrayBuffer>;
    /** Decodes UTF-8 text directly from the shared WASM memory. */
    getText(key: GlobalKeys<T>, len: number): string;
    /** Parses a JSON string directly from the shared WASM memory. */
    getJSON(key: GlobalKeys<T>, len: number): unknown;
    /** Writes a single numeric value directly into the shared WASM memory. */
    set(key: GlobalKeys<T>, asType: WASM_TYPE, val: number): void;
    /** Writes multiple values into the shared WASM memory starting at the exported symbol's address. */
    setArr(key: GlobalKeys<T>, asType: WASM_TYPE, ...vals: number[]): void;
    /** Executes an exported WASM function in the worker thread and returns its result. */
    call(fn: FnKeys<T>, ...args: unknown[]): Promise<unknown>;
    /** Terminates the underlying Web Worker and rejects any in-flight `call()` promises. */
    terminate(): void;
}

export { type FetchImportEntry, type FnKeys, type GlobalKeys, WASM_TYPE, WasmExecutable, type WasmExecutableOptions, WasmWorker, type WasmWorkerOptions };
