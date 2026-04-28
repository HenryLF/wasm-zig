// src/wasmTypes.ts
var WASM_TYPE = /* @__PURE__ */ ((WASM_TYPE2) => {
  WASM_TYPE2["I8"] = "i8";
  WASM_TYPE2["U8"] = "u8";
  WASM_TYPE2["F32"] = "f32";
  WASM_TYPE2["U32"] = "u32";
  return WASM_TYPE2;
})(WASM_TYPE || {});
var SIZE_OF_ = {
  ["u8" /* U8 */]: 1,
  ["i8" /* I8 */]: 1,
  ["u32" /* U32 */]: 4,
  ["f32" /* F32 */]: 4
};

// src/WasmMemory.ts
var WasmMemory = class {
  memory;
  /** Returns a `DataView` scoped to the given byte range in WASM linear memory. */
  view(ptr, len) {
    return new DataView(this.memory.buffer, ptr, len);
  }
  constructor(memory) {
    this.memory = memory;
  }
  /** Reads a single `u8` at `ptr`. */
  getU8(ptr) {
    return this.view(ptr, SIZE_OF_["u8" /* U8 */]).getUint8(0);
  }
  /** Returns a `Uint8Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
  getU8Array(ptr, len) {
    return new Uint8Array(this.memory.buffer, ptr, len);
  }
  /** Writes a single `u8` at `ptr`. */
  setU8(ptr, val) {
    this.view(ptr, SIZE_OF_["u8" /* U8 */]).setUint8(0, val);
  }
  /** Writes multiple `u8` values starting at `ptr`. */
  setU8Array(ptr, ...vals) {
    new Uint8Array(this.memory.buffer, ptr, vals.length).set(vals);
  }
  /** Reads a single `i8` at `ptr`. */
  getI8(ptr) {
    return this.view(ptr, SIZE_OF_["i8" /* I8 */]).getInt8(0);
  }
  /** Returns a `Int8Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
  getI8Array(ptr, len) {
    return new Int8Array(this.memory.buffer, ptr, len);
  }
  /** Writes a single `i8` at `ptr`. */
  setI8(ptr, val) {
    this.view(ptr, SIZE_OF_["i8" /* I8 */]).setInt8(0, val);
  }
  /** Writes multiple `i8` values starting at `ptr`. */
  setI8Array(ptr, ...vals) {
    new Int8Array(this.memory.buffer, ptr, vals.length).set(vals);
  }
  /** Reads a single little-endian `u32` at `ptr`. */
  getU32(ptr) {
    return this.view(ptr, SIZE_OF_["u32" /* U32 */]).getUint32(0, true);
  }
  /** Returns a `Uint32Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
  getU32Array(ptr, len) {
    return new Uint32Array(this.memory.buffer, ptr, len);
  }
  /** Writes a single little-endian `u32` at `ptr`. */
  setU32(ptr, val) {
    this.view(ptr, SIZE_OF_["u32" /* U32 */]).setUint32(0, val, true);
  }
  /** Writes multiple little-endian `u32` values starting at `ptr`. */
  setU32Array(ptr, ...vals) {
    new Uint32Array(this.memory.buffer, ptr, vals.length).set(vals);
  }
  /** Reads a single little-endian `f32` at `ptr`. */
  getF32(ptr) {
    return this.view(ptr, SIZE_OF_["f32" /* F32 */]).getFloat32(0, true);
  }
  /** Returns a `Float32Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
  getF32Array(ptr, len) {
    return new Float32Array(this.memory.buffer, ptr, len);
  }
  /** Writes a single little-endian `f32` at `ptr`. */
  setF32(ptr, val) {
    this.view(ptr, SIZE_OF_["f32" /* F32 */]).setFloat32(0, val, true);
  }
  /** Writes multiple little-endian `f32` values starting at `ptr`. */
  setF32Array(ptr, ...vals) {
    new Float32Array(this.memory.buffer, ptr, vals.length).set(vals);
  }
  /** Returns a `Uint8ClampedArray` view into WASM memory at `ptr`, suitable for use as `ImageData` pixel data. */
  getImgBuffer(ptr, len) {
    return new Uint8ClampedArray(this.memory.buffer, ptr, len);
  }
};

// src/WasmExecutable.ts
function logger(memory, ptr, len, error = false) {
  const buffer = new Uint8Array(memory.buffer, ptr, len);
  if (error) {
    console.error(new TextDecoder().decode(buffer.slice()));
    return;
  }
  console.log(new TextDecoder().decode(buffer.slice()));
}
var defaultMemory = {
  initial: 100,
  maximum: 500
};
var WasmExecutable = class _WasmExecutable {
  memory;
  exports;
  constructor(obj, mem) {
    const { memory, ...exports$1 } = obj.instance.exports;
    this.memory = new WasmMemory(mem);
    this.exports = exports$1;
  }
  /** Fetches a `.wasm` binary, instantiates it with shared imports, and pre-loads any declared `fetchImport` data into WASM memory. */
  static async create(url, options) {
    const memory = new WebAssembly.Memory({
      ...defaultMemory,
      ...options?.memoryOptions
    });
    const wasmExec = await WebAssembly.instantiateStreaming(fetch(url), {
      env: {
        ...options?.envImport,
        jsLog(ptr, len) {
          return logger(memory, ptr, len);
        },
        jsError(ptr, len) {
          return logger(memory, ptr, len, true);
        },
        now() {
          return performance.now();
        },
        rand() {
          return Math.random();
        },
        sleep(ms) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
        },
        memory
      }
    });
    const wasm = new _WasmExecutable(wasmExec, memory);
    for (const [key, value] of Object.entries(options?.fetchImport ?? {})) {
      if (!value) continue;
      const { url: url2, size, type, fetchOption } = value;
      try {
        const response = await fetch(url2, fetchOption);
        const bytes = await response.bytes();
        wasm.setArr(key, type, ...bytes.slice(0, size));
      } catch (error) {
        console.warn(
          `fetchImport: failed to load "${key}" from "${url2}":`,
          error
        );
      }
    }
    return wasm;
  }
  getPointer(key) {
    const val = this.exports[key];
    if (val == null || typeof val === "function")
      throw new Error(`${key.toString()} is not an exported value.`);
    return val.valueOf();
  }
  /** Reads a single numeric value from WASM linear memory at the address of the exported symbol. */
  get(key, asType) {
    const ptr = this.getPointer(key);
    switch (asType) {
      case "u8" /* U8 */:
        return this.memory.getU8(ptr);
      case "i8" /* I8 */:
        return this.memory.getI8(ptr);
      case "f32" /* F32 */:
        return this.memory.getF32(ptr);
      case "u32" /* U32 */:
        return this.memory.getU32(ptr);
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }
  /** Returns a typed array view into WASM linear memory starting at the address of the exported symbol. */
  getArr(key, asType, len) {
    const ptr = this.getPointer(key);
    switch (asType) {
      case "u8" /* U8 */:
        return this.memory.getU8Array(ptr, len);
      case "i8" /* I8 */:
        return this.memory.getI8Array(ptr, len);
      case "f32" /* F32 */:
        return this.memory.getF32Array(ptr, len);
      case "u32" /* U32 */:
        return this.memory.getU32Array(ptr, len);
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }
  /** Writes a single numeric value into WASM linear memory at the address of the exported symbol. */
  set(key, asType, val) {
    const ptr = this.getPointer(key);
    switch (asType) {
      case "u8" /* U8 */:
        this.memory.setU8(ptr, val);
        break;
      case "i8" /* I8 */:
        this.memory.setI8(ptr, val);
        break;
      case "f32" /* F32 */:
        this.memory.setF32(ptr, val);
        break;
      case "u32" /* U32 */:
        this.memory.setU32(ptr, val);
        break;
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }
  /** Writes multiple values sequentially into WASM linear memory starting at the address of the exported symbol. */
  setArr(key, asType, ...vals) {
    const ptr = this.getPointer(key);
    switch (asType) {
      case "u8" /* U8 */:
        this.memory.setU8Array(ptr, ...vals);
        break;
      case "i8" /* I8 */:
        this.memory.setI8Array(ptr, ...vals);
        break;
      case "f32" /* F32 */:
        this.memory.setF32Array(ptr, ...vals);
        break;
      case "u32" /* U32 */:
        this.memory.setU32Array(ptr, ...vals);
        break;
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }
  /** Returns a `Uint8ClampedArray` view of pixel data at the exported symbol's address, ready for use with `ImageData`. */
  getImg(key, len) {
    const ptr = this.getPointer(key);
    return this.memory.getImgBuffer(ptr, len);
  }
  /** Decodes UTF-8 bytes from WASM memory at the exported symbol's address into a JS string. */
  getText(key, len) {
    const ptr = this.getPointer(key);
    const buf = this.memory.getU8Array(ptr, len);
    return new TextDecoder().decode(buf);
  }
  /** Parses a JSON string from WASM memory at the exported symbol's address. */
  getJSON(key, len) {
    const txt = this.getText(key, len);
    try {
      return JSON.parse(txt);
    } catch (err) {
      console.error(`Invalid JSON : ${err}
       raw content : ${txt}`);
    }
  }
  /** Calls an exported WASM function by key. Throws if the export is not a function. */
  call(key, ...args) {
    const fn = this.exports[key];
    if (typeof fn !== "function")
      throw new Error(`${key.toString()} is not an exported function`);
    return fn(...args);
  }
};

// src/WasmWorker.ts
var WasmWorker = class _WasmWorker {
  buffer = null;
  _pointers = {};
  mainCallbacks = /* @__PURE__ */ new Map();
  /** Maps exported global names to their memory addresses in the shared WASM buffer. */
  get exports() {
    return this._pointers;
  }
  worker;
  pending = /* @__PURE__ */ new Map();
  seq = 0;
  constructor() {
    this.worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module"
    });
    this.worker.onmessage = ({ data }) => {
      if (data.type === "callback") {
        this.mainCallbacks.get(data.name)?.(...data.args ?? []);
        return;
      }
      const cb = this.pending.get(data.id);
      if (!cb) return;
      this.pending.delete(data.id);
      data.error ? cb.reject(data.error) : cb.resolve(data.result);
    };
    this.worker.onerror = (e) => console.error("WasmWorker error:", e);
  }
  /** Creates a `WasmWorker`, loads the `.wasm` binary inside a dedicated Web Worker with shared memory, and resolves once ready. */
  static async create(url, options) {
    const w = new _WasmWorker();
    await w.init(url, options);
    return w;
  }
  async init(url, options) {
    const { envImport, ...restOptions } = options ?? {};
    const callbackNames = [];
    for (const [name, fn] of Object.entries(envImport ?? {})) {
      if (typeof fn === "function") {
        this.mainCallbacks.set(name, fn);
        callbackNames.push(name);
      }
    }
    const { sab, pointers } = await this.send("init", { url, options: restOptions, callbackNames });
    this.buffer = sab;
    this._pointers = pointers;
  }
  send(type, data) {
    const id = this.seq++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject
      });
      this.worker.postMessage({ id, type, ...data });
    });
  }
  ptr(key) {
    if (!this.buffer) throw new Error("not initialized");
    const ptr = this._pointers[key];
    if (ptr === void 0) throw new Error(`no pointer for "${String(key)}"`);
    return ptr;
  }
  // --- direct SAB reads ---
  /** Returns a typed array view directly into the shared WASM memory — zero-copy, synchronous. */
  getArr(key, asType, len) {
    const ptr = this.ptr(key);
    switch (asType) {
      case "u8" /* U8 */:
        return new Uint8Array(this.buffer, ptr, len);
      case "i8" /* I8 */:
        return new Int8Array(this.buffer, ptr, len);
      case "u32" /* U32 */:
        return new Uint32Array(this.buffer, ptr, len);
      case "f32" /* F32 */:
        return new Float32Array(this.buffer, ptr, len);
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }
  /** Reads a single numeric value directly from the shared WASM memory. */
  get(key, asType) {
    const ptr = this.ptr(key);
    const view = new DataView(this.buffer);
    switch (asType) {
      case "u8" /* U8 */:
        return view.getUint8(ptr);
      case "i8" /* I8 */:
        return view.getInt8(ptr);
      case "u32" /* U32 */:
        return view.getUint32(ptr, true);
      case "f32" /* F32 */:
        return view.getFloat32(ptr, true);
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }
  /** Copies pixel data out of shared WASM memory into a regular `ArrayBuffer`, ready for use with `ImageData`. */
  getImg(key, len) {
    return new Uint8ClampedArray(this.buffer, this.ptr(key), len).slice();
  }
  /** Decodes UTF-8 text directly from the shared WASM memory. */
  getText(key, len) {
    return new TextDecoder().decode(
      new Uint8Array(this.buffer, this.ptr(key), len)
    );
  }
  /** Parses a JSON string directly from the shared WASM memory. */
  getJSON(key, len) {
    try {
      return JSON.parse(this.getText(key, len));
    } catch (err) {
      console.error(`Invalid JSON: ${err}`);
    }
  }
  // --- direct SAB writes ---
  /** Writes a single numeric value directly into the shared WASM memory. */
  set(key, asType, val) {
    const ptr = this.ptr(key);
    const view = new DataView(this.buffer);
    switch (asType) {
      case "u8" /* U8 */:
        view.setUint8(ptr, val);
        break;
      case "i8" /* I8 */:
        view.setInt8(ptr, val);
        break;
      case "u32" /* U32 */:
        view.setUint32(ptr, val, true);
        break;
      case "f32" /* F32 */:
        view.setFloat32(ptr, val, true);
        break;
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }
  /** Writes multiple values into the shared WASM memory starting at the exported symbol's address. */
  setArr(key, asType, ...vals) {
    const base = this.ptr(key);
    switch (asType) {
      case "u8" /* U8 */:
        new Uint8Array(this.buffer, base, vals.length).set(vals);
        break;
      case "i8" /* I8 */:
        new Int8Array(this.buffer, base, vals.length).set(vals);
        break;
      case "u32" /* U32 */:
        new Uint32Array(this.buffer, base, vals.length).set(vals);
        break;
      case "f32" /* F32 */:
        new Float32Array(this.buffer, base, vals.length).set(vals);
        break;
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }
  /** Executes an exported WASM function in the worker thread and returns its result. */
  call(fn, ...args) {
    return this.send("call", { fn, args });
  }
  /** Terminates the underlying Web Worker and rejects any in-flight `call()` promises. */
  terminate() {
    for (const { reject } of this.pending.values()) {
      reject("Worker terminated");
    }
    this.pending.clear();
    this.worker.terminate();
  }
};

export { WASM_TYPE, WasmExecutable, WasmWorker };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map