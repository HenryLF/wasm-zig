export enum WASM_TYPE {
  I8 = "i8",
  U8 = "u8",
  F32 = "f32",
  U32 = "u32",
}

export const SIZE_OF_ = {
  [WASM_TYPE.U8]: 1,
  [WASM_TYPE.I8]: 1,
  [WASM_TYPE.U32]: 4,
  [WASM_TYPE.F32]: 4,
};

/** Keys of `T` whose values are callable (i.e. exported WASM functions). */
export type FnKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

/** Keys of `T` whose values are pointers (i.e. exported WASM globals). */
export type GlobalKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];

/** A single pre-fetch declaration: binary data to load into a WASM global before first use. */
export interface FetchImportEntry {
  url: string;
  fetchOption?: RequestInit;
  size: number;
  type: WASM_TYPE;
}

/** Options for {@link WasmExecutable.create}. All JS imports run on the main thread. */
export interface WasmExecutableOptions<T extends WebAssembly.Exports = {}> {
  /** Additional symbols merged into the `env` import namespace alongside the built-ins (`jsLog`, `jsError`, `now`, `rand`). */
  envImport?: WebAssembly.ModuleImports;
  /** Overrides for the `WebAssembly.Memory` descriptor. `shared` is always `false` for `WasmExecutable`. */
  memoryOptions?: Omit<WebAssembly.MemoryDescriptor, "shared">;
  /** Fetch binary resources at startup and write them into the named WASM globals before `create()` resolves. */
  fetchImport?: { [k in GlobalKeys<T>]?: FetchImportEntry };
}

/** Options for {@link WasmWorker.create}. All JS imports run inside the dedicated Web Worker thread. */
export interface WasmWorkerOptions<T extends WebAssembly.Exports = {}> {
  /** Additional symbols merged into the `env` import namespace. These functions execute in the worker thread. */
  envImport?: WebAssembly.ModuleImports;
  /** Overrides for the `WebAssembly.Memory` descriptor. `shared` is always forced to `true` by the worker. */
  memoryOptions?: Omit<WebAssembly.MemoryDescriptor, "shared">;
  /** Fetch binary resources at startup and write them into the named WASM globals before `create()` resolves. */
  fetchImport?: { [k in GlobalKeys<T>]?: FetchImportEntry };
}
