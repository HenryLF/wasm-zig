// src/wasmTypes.ts
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
        memory
      }
    });
    const wasm2 = new _WasmExecutable(wasmExec, memory);
    for (const [key, value] of Object.entries(options?.fetchImport ?? {})) {
      if (!value) continue;
      const { url: url2, size, type, fetchOption } = value;
      try {
        const response = await fetch(url2, fetchOption);
        const bytes = await response.bytes();
        wasm2.setArr(key, type, ...bytes.slice(0, size));
      } catch (error) {
        console.warn(
          `fetchImport: failed to load "${key}" from "${url2}":`,
          error
        );
      }
    }
    return wasm2;
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

// src/worker.ts
var wasm = null;
self.onmessage = async (e) => {
  const { id, type, ...data } = e.data;
  try {
    let result;
    switch (type) {
      case "init": {
        const callbackEnv = {};
        for (const name of data.callbackNames ?? []) {
          callbackEnv[name] = (...args) => {
            self.postMessage({ type: "callback", name, args });
          };
        }
        const sharedOptions = {
          ...data.options,
          envImport: { ...data.options?.envImport, ...callbackEnv },
          memoryOptions: { ...data.options?.memoryOptions, shared: true }
        };
        wasm = await WasmExecutable.create(data.url, sharedOptions);
        const pointers = {};
        for (const [key, val] of Object.entries(wasm.exports)) {
          if (val && typeof val !== "function")
            pointers[key] = val.valueOf();
        }
        result = { sab: wasm.memory.memory.buffer, pointers };
        break;
      }
      case "call": {
        if (!wasm) throw new Error("WASM not initialized");
        result = wasm.call(data.fn, ...data.args);
        break;
      }
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
//# sourceMappingURL=worker.js.map
//# sourceMappingURL=worker.js.map