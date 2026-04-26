import { WasmMemory } from "./WasmMemory";
import {
  WASM_TYPE,
  type FetchImportEntry,
  type WasmExecutableOptions,
  type FnKeys,
  type GlobalKeys,
} from "./wasmTypes";

function logger(
  memory: WebAssembly.Memory,
  ptr: number,
  len: number,
  error = false,
) {
  const buffer = new Uint8Array(memory.buffer, ptr, len);
  if (error) {
    console.error(new TextDecoder().decode(buffer.slice()));
    return;
  }
  console.log(new TextDecoder().decode(buffer.slice()));
}

const defaultMemory = {
  initial: 100,
  maximum: 500,
} satisfies WebAssembly.MemoryDescriptor;

export class WasmExecutable<T extends WebAssembly.Exports> {
  readonly memory: WasmMemory;
  readonly exports: Partial<T>;

  private constructor(
    obj: WebAssembly.WebAssemblyInstantiatedSource,
    mem: WebAssembly.Memory,
  ) {
    const { memory, ...exports } = obj.instance.exports;
    this.memory = new WasmMemory(mem as WebAssembly.Memory);
    this.exports = exports as Partial<T>;
  }

  /** Fetches a `.wasm` binary, instantiates it with shared imports, and pre-loads any declared `fetchImport` data into WASM memory. */
  static async create<T extends WebAssembly.Exports = {}>(
    url: string,
    options?: WasmExecutableOptions<T>,
  ): Promise<WasmExecutable<T>> {
    const memory = new WebAssembly.Memory({
      ...defaultMemory,
      ...options?.memoryOptions,
    });
    const wasmExec = await WebAssembly.instantiateStreaming(fetch(url), {
      env: {
        ...options?.envImport,
        jsLog(ptr: number, len: number) {
          return logger(memory, ptr, len);
        },
        jsError(ptr: number, len: number) {
          return logger(memory, ptr, len, true);
        },
        now() {
          return performance.now();
        },
        rand() {
          return Math.random();
        },
        memory,
      },
    });

    const wasm = new WasmExecutable<T>(wasmExec, memory);
    for (const [key, value] of Object.entries(options?.fetchImport ?? {}) as [
      string,
      FetchImportEntry | undefined,
    ][]) {
      if (!value) continue;
      const { url, size, type, fetchOption } = value;
      try {
        const response = await fetch(url, fetchOption);
        const bytes = await response.bytes();
        wasm.setArr(key as GlobalKeys<T>, type, ...bytes.slice(0, size));
      } catch (error) {
        console.warn(
          `fetchImport: failed to load "${key}" from "${url}":`,
          error,
        );
      }
    }
    return wasm;
  }

  private getPointer(key: GlobalKeys<T>): number {
    const val = this.exports[key];
    if (val == null || typeof val === "function")
      throw new Error(`${key.toString()} is not an exported value.`);
    return val.valueOf() as number;
  }

  /** Reads a single numeric value from WASM linear memory at the address of the exported symbol. */
  get(key: GlobalKeys<T>, asType: WASM_TYPE): number {
    const ptr = this.getPointer(key);
    switch (asType) {
      case WASM_TYPE.U8:
        return this.memory.getU8(ptr);
      case WASM_TYPE.I8:
        return this.memory.getI8(ptr);
      case WASM_TYPE.F32:
        return this.memory.getF32(ptr);
      case WASM_TYPE.U32:
        return this.memory.getU32(ptr);
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }

  /** Returns a typed array view into WASM linear memory starting at the address of the exported symbol. */
  getArr(
    key: GlobalKeys<T>,
    asType: WASM_TYPE,
    len: number,
  ): Int8Array | Uint8Array | Uint32Array | Float32Array {
    const ptr = this.getPointer(key);
    switch (asType) {
      case WASM_TYPE.U8:
        return this.memory.getU8Array(ptr, len);
      case WASM_TYPE.I8:
        return this.memory.getI8Array(ptr, len);
      case WASM_TYPE.F32:
        return this.memory.getF32Array(ptr, len);
      case WASM_TYPE.U32:
        return this.memory.getU32Array(ptr, len);
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }

  /** Writes a single numeric value into WASM linear memory at the address of the exported symbol. */
  set(key: GlobalKeys<T>, asType: WASM_TYPE, val: number): void {
    const ptr = this.getPointer(key);
    switch (asType) {
      case WASM_TYPE.U8:
        this.memory.setU8(ptr, val);
        break;
      case WASM_TYPE.I8:
        this.memory.setI8(ptr, val);
        break;
      case WASM_TYPE.F32:
        this.memory.setF32(ptr, val);
        break;
      case WASM_TYPE.U32:
        this.memory.setU32(ptr, val);
        break;
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }

  /** Writes multiple values sequentially into WASM linear memory starting at the address of the exported symbol. */
  setArr(key: GlobalKeys<T>, asType: WASM_TYPE, ...vals: number[]): void {
    const ptr = this.getPointer(key);
    switch (asType) {
      case WASM_TYPE.U8:
        this.memory.setU8Array(ptr, ...vals);
        break;
      case WASM_TYPE.I8:
        this.memory.setI8Array(ptr, ...vals);
        break;
      case WASM_TYPE.F32:
        this.memory.setF32Array(ptr, ...vals);
        break;
      case WASM_TYPE.U32:
        this.memory.setU32Array(ptr, ...vals);
        break;
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }

  /** Returns a `Uint8ClampedArray` view of pixel data at the exported symbol's address, ready for use with `ImageData`. */
  getImg(key: GlobalKeys<T>, len: number): Uint8ClampedArray<ArrayBuffer> {
    const ptr = this.getPointer(key);
    return this.memory.getImgBuffer(ptr, len);
  }

  /** Decodes UTF-8 bytes from WASM memory at the exported symbol's address into a JS string. */
  getText(key: GlobalKeys<T>, len: number): string {
    const ptr = this.getPointer(key);
    const buf = this.memory.getU8Array(ptr, len);
    return new TextDecoder().decode(buf);
  }

  /** Parses a JSON string from WASM memory at the exported symbol's address. */
  getJSON(key: GlobalKeys<T>, len: number): unknown {
    const txt = this.getText(key, len);
    try {
      return JSON.parse(txt);
    } catch (err) {
      console.error(`Invalid JSON : ${err}
       raw content : ${txt}`);
    }
  }

  /** Calls an exported WASM function by key. Throws if the export is not a function. */
  call(key: FnKeys<T>, ...args: unknown[]): unknown {
    const fn = this.exports[key];
    if (typeof fn !== "function")
      throw new Error(`${key.toString()} is not an exported function`);
    return (fn as (...a: unknown[]) => unknown)(...args);
  }
}
