function h(t) {
  if (!t)
    throw new Error("Assertion failed.");
}
const Yi = Math.PI / 180, Zi = (t) => {
  const e = (t % 360 + 360) % 360;
  if (e === 0 || e === 90 || e === 180 || e === 270)
    return e;
  throw new Error(`Invalid rotation ${t}.`);
}, Ti = [1, 0, 0, 0, 1, 0, 0, 0, 1], Ji = (t, e, i) => {
  const [r, s, , n, o] = t, a = Math.abs(r) * e + Math.abs(n) * i, l = Math.abs(s) * e + Math.abs(o) * i;
  return gt(gt(Mt(-e / 2, -i / 2), t), Mt(a / 2, l / 2));
}, er = (t) => {
  const e = t * Yi, i = Math.round(Math.cos(e)), r = Math.round(Math.sin(e));
  return [
    i,
    r,
    0,
    -r,
    i,
    0,
    0,
    0,
    1
  ];
}, Mt = (t, e) => [
  1,
  0,
  0,
  0,
  1,
  0,
  t,
  e,
  1
], tr = (t, e) => [
  t,
  0,
  0,
  0,
  e,
  0,
  0,
  0,
  1
], gt = (t, e) => {
  const i = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let s = 0; s < 3; s++)
      i[3 * r + s] = t[3 * r] * e[s] + t[3 * r + 1] * e[3 + s] + t[3 * r + 2] * e[6 + s];
  return i;
}, ir = (t, e, i, r) => ({
  rotation: Zi(t + (e ? -i : i)),
  flip: e !== r
}), re = (t) => t && t[t.length - 1], de = (t) => t >= 0 && t < 2 ** 32, rr = (t) => t >= -2147483648 && t < 2 ** 31, w = (t) => {
  let e = 0;
  for (; t.readBits(1) === 0 && e < 32; )
    e++;
  if (e >= 32)
    throw new Error("Invalid exponential-Golomb code.");
  return (1 << e) - 1 + t.readBits(e);
}, ae = (t) => {
  const e = w(t);
  return (e & 1) === 0 ? -(e >> 1) : e + 1 >> 1;
}, K = (t) => t.constructor === Uint8Array ? t : ArrayBuffer.isView(t) ? new Uint8Array(t.buffer, t.byteOffset, t.byteLength) : new Uint8Array(t), Ge = (t) => t.constructor === DataView ? t : ArrayBuffer.isView(t) ? new DataView(t.buffer, t.byteOffset, t.byteLength) : new DataView(t), sr = typeof globalThis.TextEncoder < "u" ? globalThis.TextEncoder : class {
  constructor() {
    this.encoding = "utf-8";
  }
  encode(e = "") {
    const i = new Uint8Array(3 * e.length);
    let r = 0;
    for (let s = 0; s < e.length; s++) {
      let n = e.charCodeAt(s);
      if (n < 128)
        i[r++] = n;
      else if (n < 2048)
        i[r++] = 192 | n >> 6, i[r++] = 128 | n & 63;
      else if (n < 55296 || n > 57343)
        i[r++] = 224 | n >> 12, i[r++] = 128 | n >> 6 & 63, i[r++] = 128 | n & 63;
      else {
        const o = s + 1 < e.length ? e.charCodeAt(s + 1) : 0;
        n < 56320 && o >= 56320 && o <= 57343 ? (n = 65536 + (n - 55296 << 10) + (o - 56320), s++, i[r++] = 240 | n >> 18, i[r++] = 128 | n >> 12 & 63, i[r++] = 128 | n >> 6 & 63, i[r++] = 128 | n & 63) : (i[r++] = 239, i[r++] = 191, i[r++] = 189);
      }
    }
    return i.slice(0, r);
  }
}, se = /* @__PURE__ */ new sr(), Qe = {
  bt709: 1,
  // ITU-R BT.709
  bt470bg: 5,
  // ITU-R BT.470BG
  smpte170m: 6,
  // ITU-R BT.601 525 - SMPTE 170M
  bt2020: 9,
  // ITU-R BT.202
  smpte432: 12
  // SMPTE EG 432-1
}, Xe = {
  bt709: 1,
  // ITU-R BT.709
  smpte170m: 6,
  // SMPTE 170M
  linear: 8,
  // Linear transfer characteristics
  "iec61966-2-1": 13,
  // IEC 61966-2-1
  pq: 16,
  // Rec. ITU-R BT.2100-2 perceptual quantization (PQ) system
  hlg: 18
  // Rec. ITU-R BT.2100-2 hybrid loggamma (HLG) system
}, Ke = {
  rgb: 0,
  // Identity
  bt709: 1,
  // ITU-R BT.709
  bt470bg: 5,
  // ITU-R BT.470BG
  smpte170m: 6,
  // SMPTE 170M
  "bt2020-ncl": 9
  // ITU-R BT.2020-2 (non-constant luminance)
}, nr = (t) => !t || t.primaries == null && t.transfer == null && t.matrix == null && t.fullRange == null, Ct = (t) => t instanceof ArrayBuffer || typeof SharedArrayBuffer < "u" && t instanceof SharedArrayBuffer || ArrayBuffer.isView(t);
class Ei {
  constructor() {
    this.currentPromise = Promise.resolve(), this.pending = 0;
  }
  async acquire() {
    let e;
    const i = new Promise((s) => {
      let n = !1;
      e = () => {
        n || (s(), this.pending--, n = !0);
      };
    }), r = this.currentPromise;
    return this.currentPromise = i, this.pending++, await r, e;
  }
}
const Ft = (t, e, i) => {
  let r = 0, s = t.length - 1, n = -1;
  for (; r <= s; ) {
    const o = r + (s - r + 1) / 2 | 0;
    i(t[o]) <= e ? (n = o, r = o + 1) : s = o - 1;
  }
  return n;
}, _i = () => {
  let t, e;
  return { promise: new Promise((r, s) => {
    t = r, e = s;
  }), resolve: t, reject: e };
}, Be = (t) => {
  throw new Error(`Unexpected value: ${t}`);
}, or = (t, e, i) => {
  const r = t.getUint8(e), s = t.getUint8(e + 1), n = t.getUint8(e + 2);
  return r << 16 | s << 8 | n;
}, ar = (t, e, i, r) => {
  i = i >>> 0, i = i & 16777215, t.setUint8(e, i >>> 16 & 255), t.setUint8(e + 1, i >>> 8 & 255), t.setUint8(e + 2, i & 255);
}, Ot = (t, e, i) => Math.max(e, Math.min(i, t)), cr = (t, e, i) => t + (e - t) * i, dr = "und", Wt = (t, e) => Math.round(t / e) * e, zt = (t, e) => Math.floor(t * e) / e, lr = (t) => {
  let e = 0;
  for (; t !== 0; )
    t &= t - 1, e++;
  return e;
}, ur = /^[a-z]{3}$/, fr = (t) => ur.test(t), Ce = 1e6 * (1 + Number.EPSILON), hr = (t, e) => {
  const i = t < 0 ? -1 : 1;
  t = Math.abs(t);
  let r = 0, s = 1, n = 1, o = 0, a = t;
  for (; ; ) {
    const l = Math.floor(a), c = l * n + r, d = l * o + s;
    if (d > e)
      return {
        num: i * n,
        den: o
      };
    if (r = n, s = o, n = c, o = d, a = 1 / (a - l), !isFinite(a))
      break;
  }
  return {
    num: i * n,
    den: o
  };
};
class mr {
  constructor() {
    this.currentPromise = Promise.resolve();
  }
  call(e) {
    return this.currentPromise = this.currentPromise.then(e);
  }
}
let Je = null;
const pr = () => Je !== null ? Je : Je = !!(typeof navigator < "u" && // eslint-disable-next-line @typescript-eslint/no-deprecated
(navigator.vendor?.match(/apple/i) || /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) || /\b(iPad|iPhone|iPod)\b/.test(navigator.userAgent)));
let et = null;
const vi = () => et !== null ? et : et = typeof navigator < "u" && navigator.userAgent?.includes("Firefox");
let tt = null;
const gr = () => tt !== null ? tt : tt = !!(typeof navigator < "u" && (navigator.vendor?.includes("Google Inc") || /Chrome/.test(navigator.userAgent))), wr = (t) => typeof globalThis.isSecureContext < "u" && !globalThis.isSecureContext ? `${t} is not available in this environment; this may be because this page is running in an insecure context. Try serving your page over HTTPS or use localhost.` : `${t} is not available in this environment.`, yr = (t) => t instanceof DOMException && t.name === "QuotaExceededError" && /reclaimed/i.test(t.message), br = (async () => {
})().constructor, be = (t) => t instanceof br || t instanceof Promise ? !0 : typeof t?.then == "function", Ci = function* (t) {
  for (const e in t) {
    const i = t[e];
    i !== void 0 && (yield { key: e, value: i });
  }
}, Tr = () => {
  Symbol.dispose ??= /* @__PURE__ */ Symbol("Symbol.dispose");
}, Er = (t) => typeof t == "number" && !Number.isNaN(t), _r = (t, e) => {
  let i = -1, r = 1 / 0;
  for (let s = 0; s < t.length; s++) {
    const n = e(t[s]);
    n < r && (r = n, i = s);
  }
  return i;
}, xi = (t) => {
  h(Number.isInteger(t.num)), h(Number.isInteger(t.den)), h(t.den !== 0);
  let e = Math.abs(t.num), i = Math.abs(t.den);
  for (; i !== 0; ) {
    const s = e % i;
    e = i, i = s;
  }
  const r = e || 1;
  return {
    num: t.num / r,
    den: t.den / r
  };
}, it = (t, e) => {
  if (typeof t != "object" || !t)
    throw new TypeError(`${e} must be an object.`);
  if (!Number.isInteger(t.left) || t.left < 0)
    throw new TypeError(`${e}.left must be a non-negative integer.`);
  if (!Number.isInteger(t.top) || t.top < 0)
    throw new TypeError(`${e}.top must be a non-negative integer.`);
  if (!Number.isInteger(t.width) || t.width < 0)
    throw new TypeError(`${e}.width must be a non-negative integer.`);
  if (!Number.isInteger(t.height) || t.height < 0)
    throw new TypeError(`${e}.height must be a non-negative integer.`);
}, vr = (t) => new Promise((e) => setTimeout(e, t)), Vt = (t) => Array.isArray(t) ? t : [t];
class xt {
  constructor() {
    this._listeners = /* @__PURE__ */ new Map();
  }
  /** Registers a listener for the given event. Returns a function that, when called, removes the listener again. */
  on(e, i, r) {
    this._listeners.has(e) || this._listeners.set(e, /* @__PURE__ */ new Set());
    const s = { fn: i, once: r?.once ?? !1 };
    return this._listeners.get(e).add(s), () => {
      this._listeners.get(e)?.delete(s);
    };
  }
  /** @internal */
  _emit(...e) {
    const [i, r] = e, s = this._listeners.get(i);
    if (s)
      for (const n of s) {
        try {
          n.fn(r);
        } catch (o) {
          console.error(o);
        }
        n.once && s.delete(n);
      }
  }
}
const Cr = (t) => t !== null && typeof t == "object" && Object.getPrototypeOf(t) === Object.prototype && Object.values(t).every((e) => typeof e == "string");
var te;
(function(t) {
  t[t.Silent = 0] = "Silent", t[t.Errors = 1] = "Errors", t[t.Warnings = 2] = "Warnings", t[t.Info = 3] = "Info";
})(te || (te = {}));
class k {
  constructor() {
  }
  /** The current log level. Defaults to {@link LogLevel.Info}. */
  static get level() {
    return k._level;
  }
  static set level(e) {
    if (e !== te.Silent && e !== te.Errors && e !== te.Warnings && e !== te.Info)
      throw new TypeError("Invalid log level. Use one of the values of the LogLevel enum.");
    k._level = e;
  }
  /** @internal */
  static get _emitter() {
    return k._emitterInstance ??= new xt();
  }
  /** Registers a listener for a log event. Returns a function that, when called, removes the listener again. */
  static on(e, i, r) {
    return k._emitter.on(e, i, r);
  }
  /** @internal */
  static _error(...e) {
    k._emitter._emit("error", e), k._level >= te.Errors && console.error(...e);
  }
  /** @internal */
  static _warn(...e) {
    k._emitter._emit("warn", e), k._level >= te.Warnings && console.warn(...e);
  }
  /** @internal */
  static _info(...e) {
    k._emitter._emit("info", e), k._level >= te.Info && console.info(...e);
  }
}
k._level = te.Info;
k._emitterInstance = null;
class Si {
  /** Creates a new {@link RichImageData}. */
  constructor(e, i) {
    if (this.data = e, this.mimeType = i, !(e instanceof Uint8Array))
      throw new TypeError("data must be a Uint8Array.");
    if (typeof i != "string")
      throw new TypeError("mimeType must be a string.");
  }
}
class xr {
  /** Creates a new {@link AttachedFile}. */
  constructor(e, i, r, s) {
    if (this.data = e, this.mimeType = i, this.name = r, this.description = s, !(e instanceof Uint8Array))
      throw new TypeError("data must be a Uint8Array.");
    if (i !== void 0 && typeof i != "string")
      throw new TypeError("mimeType, when provided, must be a string.");
    if (r !== void 0 && typeof r != "string")
      throw new TypeError("name, when provided, must be a string.");
    if (s !== void 0 && typeof s != "string")
      throw new TypeError("description, when provided, must be a string.");
  }
}
const Sr = (t) => {
  if (!t || typeof t != "object")
    throw new TypeError("tags must be an object.");
  if (t.title !== void 0 && typeof t.title != "string")
    throw new TypeError("tags.title, when provided, must be a string.");
  if (t.description !== void 0 && typeof t.description != "string")
    throw new TypeError("tags.description, when provided, must be a string.");
  if (t.artist !== void 0 && typeof t.artist != "string")
    throw new TypeError("tags.artist, when provided, must be a string.");
  if (t.album !== void 0 && typeof t.album != "string")
    throw new TypeError("tags.album, when provided, must be a string.");
  if (t.albumArtist !== void 0 && typeof t.albumArtist != "string")
    throw new TypeError("tags.albumArtist, when provided, must be a string.");
  if (t.trackNumber !== void 0 && (!Number.isInteger(t.trackNumber) || t.trackNumber <= 0))
    throw new TypeError("tags.trackNumber, when provided, must be a positive integer.");
  if (t.tracksTotal !== void 0 && (!Number.isInteger(t.tracksTotal) || t.tracksTotal <= 0))
    throw new TypeError("tags.tracksTotal, when provided, must be a positive integer.");
  if (t.discNumber !== void 0 && (!Number.isInteger(t.discNumber) || t.discNumber <= 0))
    throw new TypeError("tags.discNumber, when provided, must be a positive integer.");
  if (t.discsTotal !== void 0 && (!Number.isInteger(t.discsTotal) || t.discsTotal <= 0))
    throw new TypeError("tags.discsTotal, when provided, must be a positive integer.");
  if (t.genre !== void 0 && typeof t.genre != "string")
    throw new TypeError("tags.genre, when provided, must be a string.");
  if (t.date !== void 0 && (!(t.date instanceof Date) || Number.isNaN(t.date.getTime())))
    throw new TypeError("tags.date, when provided, must be a valid Date.");
  if (t.beatsPerMinute !== void 0 && (!Number.isInteger(t.beatsPerMinute) || t.beatsPerMinute <= 0))
    throw new TypeError("tags.beatsPerMinute, when provided, must be a positive integer.");
  if (t.lyrics !== void 0 && typeof t.lyrics != "string")
    throw new TypeError("tags.lyrics, when provided, must be a string.");
  if (t.images !== void 0) {
    if (!Array.isArray(t.images))
      throw new TypeError("tags.images, when provided, must be an array.");
    for (const e of t.images) {
      if (!e || typeof e != "object")
        throw new TypeError("Each image in tags.images must be an object.");
      if (!(e.data instanceof Uint8Array))
        throw new TypeError("Each image.data must be a Uint8Array.");
      if (typeof e.mimeType != "string")
        throw new TypeError("Each image.mimeType must be a string.");
      if (!["coverFront", "coverBack", "unknown"].includes(e.kind))
        throw new TypeError("Each image.kind must be 'coverFront', 'coverBack', or 'unknown'.");
    }
  }
  if (t.comment !== void 0 && typeof t.comment != "string")
    throw new TypeError("tags.comment, when provided, must be a string.");
  if (t.raw !== void 0) {
    if (!t.raw || typeof t.raw != "object")
      throw new TypeError("tags.raw, when provided, must be an object.");
    for (const e of Object.values(t.raw))
      if (e !== null && typeof e != "string" && !(Array.isArray(e) && e.every((i) => typeof i == "string")) && !(e instanceof Uint8Array) && !(e instanceof Si) && !(e instanceof xr) && !Cr(e))
        throw new TypeError("Each value in tags.raw must be a string, string array, Uint8Array, RichImageData, AttachedFile, Record<string, string>, or null.");
  }
}, Br = (t) => {
  if (!t || typeof t != "object")
    throw new TypeError("disposition must be an object.");
  if (t.default !== void 0 && typeof t.default != "boolean")
    throw new TypeError("disposition.default must be a boolean.");
  if (t.primary !== void 0 && typeof t.primary != "boolean")
    throw new TypeError("disposition.primary must be a boolean.");
  if (t.forced !== void 0 && typeof t.forced != "boolean")
    throw new TypeError("disposition.forced must be a boolean.");
  if (t.original !== void 0 && typeof t.original != "boolean")
    throw new TypeError("disposition.original must be a boolean.");
  if (t.commentary !== void 0 && typeof t.commentary != "boolean")
    throw new TypeError("disposition.commentary must be a boolean.");
  if (t.hearingImpaired !== void 0 && typeof t.hearingImpaired != "boolean")
    throw new TypeError("disposition.hearingImpaired must be a boolean.");
  if (t.visuallyImpaired !== void 0 && typeof t.visuallyImpaired != "boolean")
    throw new TypeError("disposition.visuallyImpaired must be a boolean.");
};
class I {
  constructor(e) {
    this.bytes = e, this.pos = 0;
  }
  seekToByte(e) {
    this.pos = 8 * e;
  }
  readBit() {
    const e = Math.floor(this.pos / 8), i = this.bytes[e] ?? 0, r = 7 - (this.pos & 7), s = (i & 1 << r) >> r;
    return this.pos++, s;
  }
  readBits(e) {
    if (e === 1)
      return this.readBit();
    let i = 0;
    for (let r = 0; r < e; r++)
      i <<= 1, i |= this.readBit();
    return i;
  }
  writeBits(e, i) {
    const r = this.pos + e;
    for (let s = this.pos; s < r; s++) {
      const n = Math.floor(s / 8);
      let o = this.bytes[n];
      const a = 7 - (s & 7);
      o &= ~(1 << a), o |= (i & 1 << r - s - 1) >> r - s - 1 << a, this.bytes[n] = o;
    }
    this.pos = r;
  }
  copyBits(e, i) {
    let r = 0;
    for (r; r < e - 7; r += 8)
      this.writeBits(8, i.readBits(8));
    const s = e - r;
    s > 0 && this.writeBits(s, i.readBits(s));
  }
  readAlignedByte() {
    if (this.pos % 8 !== 0)
      throw new Error("Bitstream is not byte-aligned.");
    const e = this.pos / 8, i = this.bytes[e] ?? 0;
    return this.pos += 8, i;
  }
  skipBits(e) {
    this.pos += e;
  }
  getBitsLeft() {
    return this.bytes.length * 8 - this.pos;
  }
  clone() {
    const e = new I(this.bytes);
    return e.pos = this.pos, e;
  }
}
const Bi = [
  96e3,
  88200,
  64e3,
  48e3,
  44100,
  32e3,
  24e3,
  22050,
  16e3,
  12e3,
  11025,
  8e3,
  7350
], Pi = [-1, 1, 2, 3, 4, 5, 6, 8], Pr = (t) => {
  const e = t.objectType === 5 || t.objectType === 29, i = t.objectType === 29, r = e ? t.outputSampleRate / 2 : t.outputSampleRate, s = i ? 1 : t.outputNumberOfChannels, n = Pi.indexOf(s);
  if (n === -1)
    throw new TypeError(`Unsupported number of channels: ${t.outputNumberOfChannels}`);
  let o = 16;
  t.objectType >= 32 && (o += 6), wt(r) === 15 && (o += 24), e && (o += 9, wt(t.outputSampleRate) === 15 && (o += 24));
  const a = Math.ceil(o / 8), l = new Uint8Array(a), c = new I(l);
  return Lt(c, t.objectType), Nt(c, r), c.writeBits(4, n), e && (Nt(c, t.outputSampleRate), Lt(c, 2)), c.writeBits(3, 0), l;
}, Lt = (t, e) => {
  e < 32 ? t.writeBits(5, e) : (t.writeBits(5, 31), t.writeBits(6, e - 32));
}, Nt = (t, e) => {
  const i = wt(e);
  t.writeBits(4, i), i === 15 && t.writeBits(24, e);
}, wt = (t) => {
  const e = Bi.indexOf(t);
  return e === -1 ? 15 : e;
};
const kr = [48e3, 44100, 32e3], Ar = [24e3, 22050, 16e3];
const Ir = "1.61.0", rt = `Mediabunny v${Ir}`;
var ce;
(function(t) {
  t[t.NON_IDR_SLICE = 1] = "NON_IDR_SLICE", t[t.SLICE_DPA = 2] = "SLICE_DPA", t[t.SLICE_DPB = 3] = "SLICE_DPB", t[t.SLICE_DPC = 4] = "SLICE_DPC", t[t.IDR = 5] = "IDR", t[t.SEI = 6] = "SEI", t[t.SPS = 7] = "SPS", t[t.PPS = 8] = "PPS", t[t.AUD = 9] = "AUD", t[t.SPS_EXT = 13] = "SPS_EXT";
})(ce || (ce = {}));
var L;
(function(t) {
  t[t.RASL_N = 8] = "RASL_N", t[t.RASL_R = 9] = "RASL_R", t[t.BLA_W_LP = 16] = "BLA_W_LP", t[t.RSV_IRAP_VCL23 = 23] = "RSV_IRAP_VCL23", t[t.VPS_NUT = 32] = "VPS_NUT", t[t.SPS_NUT = 33] = "SPS_NUT", t[t.PPS_NUT = 34] = "PPS_NUT", t[t.AUD_NUT = 35] = "AUD_NUT", t[t.PREFIX_SEI_NUT = 39] = "PREFIX_SEI_NUT", t[t.SUFFIX_SEI_NUT = 40] = "SUFFIX_SEI_NUT";
})(L || (L = {}));
const Ve = function* (t) {
  let e = 0, i = -1;
  for (; e < t.length - 2; ) {
    const r = t.indexOf(0, e);
    if (r === -1 || r >= t.length - 2)
      break;
    e = r;
    let s = 0;
    if (e + 3 < t.length && t[e + 1] === 0 && t[e + 2] === 0 && t[e + 3] === 1 ? s = 4 : t[e + 1] === 0 && t[e + 2] === 1 && (s = 3), s === 0) {
      e++;
      continue;
    }
    i !== -1 && e > i && (yield {
      offset: i,
      length: e - i
    }), i = e + s, e = i;
  }
  i !== -1 && i < t.length && (yield {
    offset: i,
    length: t.length - i
  });
}, ki = function* (t, e) {
  let i = 0;
  const r = new DataView(t.buffer, t.byteOffset, t.byteLength);
  for (; i + e <= t.length; ) {
    let s;
    e === 1 ? s = r.getUint8(i) : e === 2 ? s = r.getUint16(i, !1) : e === 3 ? s = or(r, i) : (h(e === 4), s = r.getUint32(i, !1)), i += e, yield {
      offset: i,
      length: s
    }, i += s;
  }
}, Rr = (t, e) => {
  if (e.description) {
    const s = (K(e.description)[4] & 3) + 1;
    return ki(t, s);
  } else
    return Ve(t);
}, Ai = (t) => t & 31, Ye = (t) => {
  const e = [], i = t.length;
  for (let r = 0; r < i; r++)
    r + 2 < i && t[r] === 0 && t[r + 1] === 0 && t[r + 2] === 3 ? (e.push(0, 0), r += 2) : e.push(t[r]);
  return new Uint8Array(e);
}, Mr = (t, e) => {
  const i = t.reduce((n, o) => n + e + o.byteLength, 0), r = new Uint8Array(i);
  let s = 0;
  for (const n of t) {
    const o = new DataView(r.buffer, r.byteOffset, r.byteLength);
    switch (e) {
      case 1:
        o.setUint8(s, n.byteLength);
        break;
      case 2:
        o.setUint16(s, n.byteLength, !1);
        break;
      case 3:
        ar(o, s, n.byteLength);
        break;
      case 4:
        o.setUint32(s, n.byteLength, !1);
        break;
    }
    s += e, r.set(n, s), s += n.byteLength;
  }
  return r;
}, Fr = (t) => {
  try {
    const e = [], i = [], r = [];
    for (const a of Ve(t)) {
      const l = t.subarray(a.offset, a.offset + a.length), c = Ai(l[0]);
      c === ce.SPS ? e.push(l) : c === ce.PPS ? i.push(l) : c === ce.SPS_EXT && r.push(l);
    }
    if (e.length === 0 || i.length === 0)
      return null;
    const s = e[0], n = Wr(s);
    h(n !== null);
    const o = n.profileIdc === 100 || n.profileIdc === 110 || n.profileIdc === 122 || n.profileIdc === 144;
    return {
      configurationVersion: 1,
      avcProfileIndication: n.profileIdc,
      profileCompatibility: n.constraintFlags,
      avcLevelIndication: n.levelIdc,
      lengthSizeMinusOne: 3,
      // Typically 4 bytes for length field
      sequenceParameterSets: e,
      pictureParameterSets: i,
      chromaFormat: o ? n.chromaFormatIdc : null,
      bitDepthLumaMinus8: o ? n.bitDepthLumaMinus8 : null,
      bitDepthChromaMinus8: o ? n.bitDepthChromaMinus8 : null,
      sequenceParameterSetExt: o ? r : null
    };
  } catch (e) {
    return k._error("Error building AVC Decoder Configuration Record:", e), null;
  }
}, Or = (t) => {
  const e = [];
  e.push(t.configurationVersion), e.push(t.avcProfileIndication), e.push(t.profileCompatibility), e.push(t.avcLevelIndication), e.push(252 | t.lengthSizeMinusOne & 3), e.push(224 | t.sequenceParameterSets.length & 31);
  for (const i of t.sequenceParameterSets) {
    const r = i.byteLength;
    e.push(r >> 8), e.push(r & 255);
    for (let s = 0; s < r; s++)
      e.push(i[s]);
  }
  e.push(t.pictureParameterSets.length);
  for (const i of t.pictureParameterSets) {
    const r = i.byteLength;
    e.push(r >> 8), e.push(r & 255);
    for (let s = 0; s < r; s++)
      e.push(i[s]);
  }
  if ((t.avcProfileIndication === 100 || t.avcProfileIndication === 110 || t.avcProfileIndication === 122 || t.avcProfileIndication === 144) && t.chromaFormat !== null) {
    h(t.bitDepthLumaMinus8 !== null), h(t.bitDepthChromaMinus8 !== null), h(t.sequenceParameterSetExt !== null), e.push(252 | t.chromaFormat & 3), e.push(248 | t.bitDepthLumaMinus8 & 7), e.push(248 | t.bitDepthChromaMinus8 & 7), e.push(t.sequenceParameterSetExt.length);
    for (const i of t.sequenceParameterSetExt) {
      const r = i.byteLength;
      e.push(r >> 8), e.push(r & 255);
      for (let s = 0; s < r; s++)
        e.push(i[s]);
    }
  }
  return new Uint8Array(e);
}, Ii = {
  1: { num: 1, den: 1 },
  2: { num: 12, den: 11 },
  3: { num: 10, den: 11 },
  4: { num: 16, den: 11 },
  5: { num: 40, den: 33 },
  6: { num: 24, den: 11 },
  7: { num: 20, den: 11 },
  8: { num: 32, den: 11 },
  9: { num: 80, den: 33 },
  10: { num: 18, den: 11 },
  11: { num: 15, den: 11 },
  12: { num: 64, den: 33 },
  13: { num: 160, den: 99 },
  14: { num: 4, den: 3 },
  15: { num: 3, den: 2 },
  16: { num: 2, den: 1 }
}, Wr = (t) => {
  try {
    const e = Ye(t), i = new I(e);
    if (i.skipBits(1), i.skipBits(2), i.readBits(5) !== 7)
      return null;
    const s = i.readAlignedByte(), n = i.readAlignedByte(), o = i.readAlignedByte();
    w(i);
    let a = 1, l = 0, c = 0, d = 0;
    if ((s === 100 || s === 110 || s === 122 || s === 244 || s === 44 || s === 83 || s === 86 || s === 118 || s === 128) && (a = w(i), a === 3 && (d = i.readBits(1)), l = w(i), c = w(i), i.skipBits(1), i.readBits(1))) {
      for (let F = 0; F < (a !== 3 ? 8 : 12); F++)
        if (i.readBits(1)) {
          const D = F < 6 ? 16 : 64;
          let G = 8, O = 8;
          for (let ue = 0; ue < D; ue++) {
            if (O !== 0) {
              const ge = ae(i);
              O = (G + ge + 256) % 256;
            }
            G = O === 0 ? G : O;
          }
        }
    }
    w(i);
    const u = w(i);
    if (u === 0)
      w(i);
    else if (u === 1) {
      i.skipBits(1), ae(i), ae(i);
      const j = w(i);
      for (let F = 0; F < j; F++)
        ae(i);
    }
    w(i), i.skipBits(1);
    const f = w(i), m = w(i), g = 16 * (f + 1), y = 16 * (m + 1);
    let E = g, _ = y;
    const x = i.readBits(1);
    if (x || i.skipBits(1), i.skipBits(1), i.readBits(1)) {
      const j = w(i), F = w(i), $ = w(i), D = w(i);
      let G, O;
      if ((d === 0 ? a : 0) === 0)
        G = 1, O = 2 - x;
      else {
        const ge = a === 3 ? 1 : 2, Ne = a === 1 ? 2 : 1;
        G = ge, O = Ne * (2 - x);
      }
      E -= G * (j + F), _ -= O * ($ + D);
    }
    let M = 2, V = 2, me = 2, pe = 0, ne = { num: 1, den: 1 }, Z = null, U = null, q = null, A = null;
    const oe = i.pos;
    if (i.readBits(1)) {
      if (i.readBits(1)) {
        const ge = i.readBits(8);
        if (ge === 255)
          ne = {
            num: i.readBits(16),
            den: i.readBits(16)
          };
        else {
          const Ne = Ii[ge];
          Ne && (ne = Ne);
        }
      }
      i.readBits(1) && i.skipBits(1), i.readBits(1) && (i.skipBits(3), pe = i.readBits(1), i.readBits(1) && (M = i.readBits(8), V = i.readBits(8), me = i.readBits(8))), i.readBits(1) && (w(i), w(i)), i.readBits(1) && (i.skipBits(32), i.skipBits(32), i.skipBits(1));
      const O = i.readBits(1);
      O && Ht(i);
      const ue = i.readBits(1);
      ue && Ht(i), (O || ue) && i.skipBits(1), i.skipBits(1), q = i.pos, A = i.readBits(1), A && (i.skipBits(1), w(i), w(i), w(i), w(i), Z = w(i), U = w(i));
    }
    if (Z === null) {
      h(U === null);
      const j = n & 16;
      if ((s === 44 || s === 86 || s === 100 || s === 110 || s === 122 || s === 244) && j)
        Z = 0, U = 0;
      else {
        const F = f + 1, $ = m + 1, D = (2 - x) * $, G = De.find((ue) => ue.level >= o) ?? re(De), O = Math.min(Math.floor(G.maxDpbMbs / (F * D)), 16);
        Z = O, U = O;
      }
    }
    return h(U !== null), {
      emulationUnpreventedBytes: e,
      profileIdc: s,
      constraintFlags: n,
      levelIdc: o,
      frameMbsOnlyFlag: x,
      chromaFormatIdc: a,
      bitDepthLumaMinus8: l,
      bitDepthChromaMinus8: c,
      codedWidth: g,
      codedHeight: y,
      displayWidth: E,
      displayHeight: _,
      pixelAspectRatio: ne,
      colourPrimaries: M,
      matrixCoefficients: me,
      transferCharacteristics: V,
      fullRangeFlag: pe,
      numReorderFrames: Z,
      maxDecFrameBuffering: U,
      vuiParametersFlagBitOffset: oe,
      bitstreamRestrictionFlagBitOffset: q,
      bitstreamRestrictionFlag: A
    };
  } catch (e) {
    return k._error("Error parsing AVC SPS:", e), null;
  }
}, Ht = (t) => {
  const e = w(t);
  t.skipBits(4), t.skipBits(4);
  for (let i = 0; i <= e; i++)
    w(t), w(t), t.skipBits(1);
  t.skipBits(5), t.skipBits(5), t.skipBits(5), t.skipBits(5);
}, zr = (t, e) => {
  if (e.description) {
    const s = (K(e.description)[21] & 3) + 1;
    return ki(t, s);
  } else
    return Ve(t);
}, yt = (t) => t >> 1 & 63, Vr = (t) => {
  try {
    const e = new I(Ye(t));
    e.skipBits(16), e.readBits(4);
    const i = e.readBits(3), r = e.readBits(1), { general_profile_space: s, general_tier_flag: n, general_profile_idc: o, general_profile_compatibility_flags: a, general_constraint_indicator_flags: l, general_level_idc: c } = Nr(e, i);
    w(e);
    const d = w(e);
    let u = 0;
    d === 3 && (u = e.readBits(1));
    const f = w(e), m = w(e);
    let g = f, y = m;
    if (e.readBits(1)) {
      const A = w(e), oe = w(e), Pe = w(e), j = w(e);
      let F = 1, $ = 1;
      const D = u === 0 ? d : 0;
      D === 1 ? (F = 2, $ = 2) : D === 2 && (F = 2, $ = 1), g -= (A + oe) * F, y -= (Pe + j) * $;
    }
    const E = w(e), _ = w(e);
    w(e);
    const R = e.readBits(1) ? 0 : i;
    let M = 0;
    for (let A = R; A <= i; A++)
      w(e), M = w(e), w(e);
    w(e), w(e), w(e), w(e), w(e), w(e), e.readBits(1) && e.readBits(1) && Hr(e), e.skipBits(1), e.skipBits(1), e.readBits(1) && (e.skipBits(4), e.skipBits(4), w(e), w(e), e.skipBits(1));
    const V = w(e);
    if (Ur(e, V), e.readBits(1)) {
      const A = w(e);
      for (let oe = 0; oe < A; oe++)
        w(e), e.skipBits(1);
    }
    e.skipBits(1), e.skipBits(1);
    let me = 2, pe = 2, ne = 2, Z = 0, U = 0, q = { num: 1, den: 1 };
    if (e.readBits(1)) {
      const A = jr(e, i);
      q = A.pixelAspectRatio, me = A.colourPrimaries, pe = A.transferCharacteristics, ne = A.matrixCoefficients, Z = A.fullRangeFlag, U = A.minSpatialSegmentationIdc;
    }
    return {
      displayWidth: g,
      displayHeight: y,
      pixelAspectRatio: q,
      colourPrimaries: me,
      transferCharacteristics: pe,
      matrixCoefficients: ne,
      fullRangeFlag: Z,
      maxDecFrameBuffering: M + 1,
      spsMaxSubLayersMinus1: i,
      spsTemporalIdNestingFlag: r,
      generalProfileSpace: s,
      generalTierFlag: n,
      generalProfileIdc: o,
      generalProfileCompatibilityFlags: a,
      generalConstraintIndicatorFlags: l,
      generalLevelIdc: c,
      chromaFormatIdc: d,
      bitDepthLumaMinus8: E,
      bitDepthChromaMinus8: _,
      minSpatialSegmentationIdc: U
    };
  } catch (e) {
    return k._error("Error parsing HEVC SPS:", e), null;
  }
}, Lr = (t) => {
  try {
    const e = [], i = [], r = [], s = [];
    for (const c of Ve(t)) {
      const d = t.subarray(c.offset, c.offset + c.length), u = yt(d[0]);
      u === L.VPS_NUT ? e.push(d) : u === L.SPS_NUT ? i.push(d) : u === L.PPS_NUT ? r.push(d) : (u === L.PREFIX_SEI_NUT || u === L.SUFFIX_SEI_NUT) && s.push(d);
    }
    if (i.length === 0 || r.length === 0)
      return null;
    const n = Vr(i[0]);
    if (!n)
      return null;
    let o = 0;
    if (r.length > 0) {
      const c = r[0], d = new I(Ye(c));
      d.skipBits(16), w(d), w(d), d.skipBits(1), d.skipBits(1), d.skipBits(3), d.skipBits(1), d.skipBits(1), w(d), w(d), ae(d), d.skipBits(1), d.skipBits(1), d.readBits(1) && w(d), ae(d), ae(d), d.skipBits(1), d.skipBits(1), d.skipBits(1), d.skipBits(1);
      const u = d.readBits(1), f = d.readBits(1);
      !u && !f ? o = 0 : u && !f ? o = 2 : !u && f ? o = 3 : o = 0;
    }
    const a = [
      ...e.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: L.VPS_NUT,
          nalUnits: e
        }
      ] : [],
      ...i.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: L.SPS_NUT,
          nalUnits: i
        }
      ] : [],
      ...r.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: L.PPS_NUT,
          nalUnits: r
        }
      ] : [],
      ...s.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: yt(s[0][0]),
          nalUnits: s
        }
      ] : []
    ];
    return {
      configurationVersion: 1,
      generalProfileSpace: n.generalProfileSpace,
      generalTierFlag: n.generalTierFlag,
      generalProfileIdc: n.generalProfileIdc,
      generalProfileCompatibilityFlags: n.generalProfileCompatibilityFlags,
      generalConstraintIndicatorFlags: n.generalConstraintIndicatorFlags,
      generalLevelIdc: n.generalLevelIdc,
      minSpatialSegmentationIdc: n.minSpatialSegmentationIdc,
      parallelismType: o,
      chromaFormatIdc: n.chromaFormatIdc,
      bitDepthLumaMinus8: n.bitDepthLumaMinus8,
      bitDepthChromaMinus8: n.bitDepthChromaMinus8,
      avgFrameRate: 0,
      constantFrameRate: 0,
      numTemporalLayers: n.spsMaxSubLayersMinus1 + 1,
      temporalIdNested: n.spsTemporalIdNestingFlag,
      lengthSizeMinusOne: 3,
      arrays: a
    };
  } catch (e) {
    return k._error("Error building HEVC Decoder Configuration Record:", e), null;
  }
}, Nr = (t, e) => {
  const i = t.readBits(2), r = t.readBits(1), s = t.readBits(5);
  let n = 0;
  for (let d = 0; d < 32; d++)
    n = n << 1 | t.readBits(1);
  const o = new Uint8Array(6);
  for (let d = 0; d < 6; d++)
    o[d] = t.readBits(8);
  const a = t.readBits(8), l = [], c = [];
  for (let d = 0; d < e; d++)
    l.push(t.readBits(1)), c.push(t.readBits(1));
  if (e > 0)
    for (let d = e; d < 8; d++)
      t.skipBits(2);
  for (let d = 0; d < e; d++)
    l[d] && t.skipBits(88), c[d] && t.skipBits(8);
  return {
    general_profile_space: i,
    general_tier_flag: r,
    general_profile_idc: s,
    general_profile_compatibility_flags: n,
    general_constraint_indicator_flags: o,
    general_level_idc: a
  };
}, Hr = (t) => {
  for (let e = 0; e < 4; e++)
    for (let i = 0; i < (e === 3 ? 2 : 6); i++)
      if (!t.readBits(1))
        w(t);
      else {
        const s = Math.min(64, 1 << 4 + (e << 1));
        e > 1 && ae(t);
        for (let n = 0; n < s; n++)
          ae(t);
      }
}, Ur = (t, e) => {
  const i = [];
  for (let r = 0; r < e; r++)
    i[r] = qr(t, r, e, i);
}, qr = (t, e, i, r) => {
  let s = 0, n = 0, o = 0;
  if (e !== 0 && (n = t.readBits(1)), n) {
    if (e === i) {
      const l = w(t);
      o = e - (l + 1);
    } else
      o = e - 1;
    t.readBits(1), w(t);
    const a = r[o] ?? 0;
    for (let l = 0; l <= a; l++)
      t.readBits(1) || t.readBits(1);
    s = r[o];
  } else {
    const a = w(t), l = w(t);
    for (let c = 0; c < a; c++)
      w(t), t.readBits(1);
    for (let c = 0; c < l; c++)
      w(t), t.readBits(1);
    s = a + l;
  }
  return s;
}, jr = (t, e) => {
  let i = 2, r = 2, s = 2, n = 0, o = 0, a = { num: 1, den: 1 };
  if (t.readBits(1)) {
    const l = t.readBits(8);
    if (l === 255)
      a = {
        num: t.readBits(16),
        den: t.readBits(16)
      };
    else {
      const c = Ii[l];
      c && (a = c);
    }
  }
  return t.readBits(1) && t.readBits(1), t.readBits(1) && (t.readBits(3), n = t.readBits(1), t.readBits(1) && (i = t.readBits(8), r = t.readBits(8), s = t.readBits(8))), t.readBits(1) && (w(t), w(t)), t.readBits(1), t.readBits(1), t.readBits(1), t.readBits(1) && (w(t), w(t), w(t), w(t)), t.readBits(1) && (t.readBits(32), t.readBits(32), t.readBits(1) && w(t), t.readBits(1) && $r(t, !0, e)), t.readBits(1) && (t.readBits(1), t.readBits(1), t.readBits(1), o = w(t), w(t), w(t), w(t), w(t)), {
    pixelAspectRatio: a,
    colourPrimaries: i,
    transferCharacteristics: r,
    matrixCoefficients: s,
    fullRangeFlag: n,
    minSpatialSegmentationIdc: o
  };
}, $r = (t, e, i) => {
  let r = !1, s = !1, n = !1;
  r = t.readBits(1) === 1, s = t.readBits(1) === 1, (r || s) && (n = t.readBits(1) === 1, n && (t.readBits(8), t.readBits(5), t.readBits(1), t.readBits(5)), t.readBits(4), t.readBits(4), n && t.readBits(4), t.readBits(5), t.readBits(5), t.readBits(5));
  for (let o = 0; o <= i; o++) {
    const a = t.readBits(1) === 1;
    let l = !0;
    a || (l = t.readBits(1) === 1);
    let c = !1;
    l ? w(t) : c = t.readBits(1) === 1;
    let d = 1;
    c || (d = w(t) + 1), r && Ut(t, d, n), s && Ut(t, d, n);
  }
}, Ut = (t, e, i) => {
  for (let r = 0; r < e; r++)
    w(t), w(t), i && (w(t), w(t)), t.readBits(1);
}, Dr = (t) => {
  const e = [];
  e.push(t.configurationVersion), e.push((t.generalProfileSpace & 3) << 6 | (t.generalTierFlag & 1) << 5 | t.generalProfileIdc & 31), e.push(t.generalProfileCompatibilityFlags >>> 24 & 255), e.push(t.generalProfileCompatibilityFlags >>> 16 & 255), e.push(t.generalProfileCompatibilityFlags >>> 8 & 255), e.push(t.generalProfileCompatibilityFlags & 255), e.push(...t.generalConstraintIndicatorFlags), e.push(t.generalLevelIdc & 255), e.push(240 | t.minSpatialSegmentationIdc >> 8 & 15), e.push(t.minSpatialSegmentationIdc & 255), e.push(252 | t.parallelismType & 3), e.push(252 | t.chromaFormatIdc & 3), e.push(248 | t.bitDepthLumaMinus8 & 7), e.push(248 | t.bitDepthChromaMinus8 & 7), e.push(t.avgFrameRate >> 8 & 255), e.push(t.avgFrameRate & 255), e.push((t.constantFrameRate & 3) << 6 | (t.numTemporalLayers & 7) << 3 | (t.temporalIdNested & 1) << 2 | t.lengthSizeMinusOne & 3), e.push(t.arrays.length & 255);
  for (const i of t.arrays) {
    e.push((i.arrayCompleteness & 1) << 7 | 0 | i.nalUnitType & 63), e.push(i.nalUnits.length >> 8 & 255), e.push(i.nalUnits.length & 255);
    for (const r of i.nalUnits) {
      e.push(r.length >> 8 & 255), e.push(r.length & 255);
      for (let s = 0; s < r.length; s++)
        e.push(r[s]);
    }
  }
  return new Uint8Array(e);
};
var qt;
(function(t) {
  t[t.audAllowed = 0] = "audAllowed", t[t.beforeFirstVcl = 1] = "beforeFirstVcl", t[t.afterFirstVcl = 2] = "afterFirstVcl", t[t.eoBitstreamAllowed = 3] = "eoBitstreamAllowed", t[t.noMoreDataAllowed = 4] = "noMoreDataAllowed";
})(qt || (qt = {}));
const Gr = function* (t) {
  const e = new I(t), i = () => {
    let r = 0;
    for (let s = 0; s < 8; s++) {
      const n = e.readAlignedByte();
      if (r += (n & 127) * 2 ** (s * 7), !(n & 128))
        break;
      if (s === 7 && n & 128)
        return null;
    }
    return r > 2 ** 32 - 1 ? null : r;
  };
  for (; e.getBitsLeft() >= 8; ) {
    e.skipBits(1);
    const r = e.readBits(4), s = e.readBits(1), n = e.readBits(1);
    e.skipBits(1), s && e.skipBits(8);
    let o;
    if (n) {
      const a = i();
      if (a === null)
        return;
      o = a;
    } else
      o = Math.floor(e.getBitsLeft() / 8);
    h(e.pos % 8 === 0), yield {
      type: r,
      data: t.subarray(e.pos / 8, e.pos / 8 + o)
    }, e.skipBits(o * 8);
  }
}, Qr = (t) => {
  const e = Ge(t), i = e.getUint8(9), r = e.getUint16(10, !0), s = e.getUint32(12, !0), n = e.getInt16(16, !0), o = e.getUint8(18);
  let a = null;
  return o && (a = t.subarray(19, 21 + i)), {
    outputChannelCount: i,
    preSkip: r,
    inputSampleRate: s,
    outputGain: n,
    channelMappingFamily: o,
    channelMappingTable: a
  };
}, Xr = (t, e, i) => {
  switch (t) {
    case "avc": {
      for (const r of Rr(i, e)) {
        const s = i[r.offset], n = Ai(s);
        if (n >= ce.NON_IDR_SLICE && n <= ce.SLICE_DPC)
          return "delta";
        if (n === ce.IDR)
          return "key";
        if (n === ce.SEI && !gr()) {
          const o = i.subarray(r.offset, r.offset + r.length), a = Ye(o);
          let l = 1;
          do {
            let c = 0;
            for (; ; ) {
              const f = a[l++];
              if (f === void 0 || (c += f, f < 255))
                break;
            }
            let d = 0;
            for (; ; ) {
              const f = a[l++];
              if (f === void 0 || (d += f, f < 255))
                break;
            }
            if (c === 6) {
              const f = new I(a);
              f.pos = 8 * l;
              const m = w(f), g = f.readBits(1);
              if (m === 0 && g === 1)
                return "key";
            }
            l += d;
          } while (l < a.length - 1);
        }
      }
      return "delta";
    }
    case "hevc": {
      for (const r of zr(i, e)) {
        const s = yt(i[r.offset]);
        if (s < L.BLA_W_LP)
          return "delta";
        if (s <= L.RSV_IRAP_VCL23)
          return "key";
      }
      return "delta";
    }
    case "vp8":
      return (i[0] & 1) === 0 ? "key" : "delta";
    case "vp9": {
      const r = new I(i);
      if (r.readBits(2) !== 2)
        return null;
      const s = r.readBits(1);
      return (r.readBits(1) << 1) + s === 3 && r.skipBits(1), r.readBits(1) ? null : r.readBits(1) === 0 ? "key" : "delta";
    }
    case "av1": {
      let r = !1;
      for (const { type: s, data: n } of Gr(i))
        if (s === 1) {
          const o = new I(n);
          o.skipBits(4), r = !!o.readBits(1);
        } else if (s === 3 || s === 6 || s === 7) {
          if (r)
            return "key";
          const o = new I(n);
          return o.readBits(1) ? null : o.readBits(2) === 0 ? "key" : "delta";
        }
      return null;
    }
    case "prores":
      return "key";
    default:
      Be(t), h(!1);
  }
};
var jt;
(function(t) {
  t[t.STREAMINFO = 0] = "STREAMINFO", t[t.VORBIS_COMMENT = 4] = "VORBIS_COMMENT", t[t.PICTURE = 6] = "PICTURE";
})(jt || (jt = {}));
const Kr = (t) => {
  if (t.length < 7 || t[0] !== 11 || t[1] !== 119)
    return null;
  const e = new I(t);
  e.skipBits(16), e.skipBits(16);
  const i = e.readBits(2);
  if (i === 3)
    return null;
  const r = e.readBits(6), s = e.readBits(5);
  if (s > 8)
    return null;
  const n = e.readBits(3), o = e.readBits(3);
  (o & 1) !== 0 && o !== 1 && e.skipBits(2), (o & 4) !== 0 && e.skipBits(2), o === 2 && e.skipBits(2);
  const a = e.readBits(1), l = Math.floor(r / 2);
  return { fscod: i, bsid: s, bsmod: n, acmod: o, lfeon: a, bitRateCode: l };
}, Yr = [1, 2, 3, 6], Zr = (t) => {
  if (t.length < 6 || t[0] !== 11 || t[1] !== 119)
    return null;
  const e = new I(t);
  e.skipBits(16);
  const i = e.readBits(2);
  if (e.skipBits(3), i !== 0 && i !== 2)
    return null;
  const r = e.readBits(11), s = e.readBits(2);
  let n = 0, o;
  s === 3 ? (n = e.readBits(2), o = 3) : o = e.readBits(2);
  const a = e.readBits(3), l = e.readBits(1), c = e.readBits(5);
  if (c < 11 || c > 16)
    return null;
  const d = Yr[o];
  let u;
  return s < 3 ? u = kr[s] / 1e3 : u = Ar[n] / 1e3, {
    dataRate: Math.round((r + 1) * u / (d * 16)),
    substreams: [{
      fscod: s,
      fscod2: n,
      bsid: c,
      bsmod: 0,
      acmod: a,
      lfeon: l,
      numDepSub: 0,
      chanLoc: 0
    }]
  };
}, Jr = 1683496997, es = 18, ts = 10, $t = 32, is = 20, rs = 8, ss = [
  0,
  8e3,
  16e3,
  32e3,
  0,
  0,
  11025,
  22050,
  44100,
  0,
  0,
  12e3,
  24e3,
  48e3,
  96e3,
  192e3
], ns = [
  32e3,
  56e3,
  64e3,
  96e3,
  112e3,
  128e3,
  192e3,
  224e3,
  256e3,
  32e4,
  384e3,
  448e3,
  512e3,
  576e3,
  64e4,
  768e3,
  96e4,
  1024e3,
  1152e3,
  128e4,
  1344e3,
  1408e3,
  1411200,
  1472e3,
  1536e3,
  192e4,
  2048e3,
  3072e3,
  384e4,
  0,
  0,
  0
], os = [16, 16, 20, 20, 0, 24, 24, 0], Dt = [1, 2, 2, 2, 2, 3, 3, 4, 4, 5, 6, 6, 6, 7, 8, 8], as = [
  1,
  2,
  2,
  2,
  2,
  3,
  18,
  19,
  6,
  7,
  518,
  323,
  83,
  519,
  582,
  535
], cs = 8, ds = [32e3, 44100, 48e3, 0], ls = [
  8e3,
  16e3,
  32e3,
  64e3,
  128e3,
  22050,
  44100,
  88200,
  176400,
  352800,
  12e3,
  24e3,
  48e3,
  96e3,
  192e3,
  384e3
], us = [512, 1024, 2048, 4096], fs = (t) => {
  const e = hs(t), i = Ge(t);
  let r = e ? Math.ceil(e.frameSize / 4) * 4 : 0, s = null;
  for (; r + 4 <= t.length && i.getUint32(r) === Jr; ) {
    const o = ms(t.subarray(r));
    if (!o)
      break;
    s ??= o, r += o.frameSize;
  }
  if (e)
    return {
      frameSize: s ? r : e.frameSize,
      sampleRate: e.sampleRate,
      numberOfChannels: e.numberOfChannels,
      sampleCount: e.sampleCount,
      channelLayout: e.channelLayout,
      pcmResolution: e.pcmResolution,
      bitRate: e.bitRate,
      core: e,
      hasExtensions: s !== null
    };
  if (!s?.asset)
    return null;
  const { asset: n } = s;
  return {
    frameSize: r,
    sampleRate: n.sampleRate,
    numberOfChannels: n.numberOfChannels,
    sampleCount: n.sampleCount,
    channelLayout: n.channelLayout,
    pcmResolution: n.pcmResolution,
    bitRate: 0,
    core: null,
    hasExtensions: !0
  };
}, hs = (t) => {
  if (t.length < es || t[0] !== 127 || t[1] !== 254 || t[2] !== 128 || t[3] !== 1)
    return null;
  const e = new I(t);
  if (e.skipBits(32), e.skipBits(1), e.readBits(5) !== $t - 1)
    return null;
  const i = e.readBits(1), r = e.readBits(7) + 1;
  if (r % rs !== 0)
    return null;
  const s = e.readBits(14) + 1;
  if (s < 96)
    return null;
  const n = e.readBits(6);
  if (n >= Dt.length)
    return null;
  const o = ss[e.readBits(4)];
  if (o === 0)
    return null;
  const a = ns[e.readBits(5)];
  if (e.readBits(1) !== 0)
    return null;
  e.skipBits(4), e.skipBits(5);
  const l = e.readBits(2);
  if (l === 3)
    return null;
  e.skipBits(1), i && e.skipBits(16), e.skipBits(7);
  const c = os[e.readBits(3)];
  if (c === 0)
    return null;
  const d = l !== 0;
  return {
    frameSize: s,
    sampleRate: o,
    numberOfChannels: Dt[n] + (d ? 1 : 0),
    sampleCount: r * $t,
    channelLayout: as[n] | (d ? cs : 0),
    amode: n,
    lfePresent: d,
    bitRate: a,
    pcmResolution: c
  };
}, ms = (t) => {
  if (t.length < ts || t[0] !== 100 || t[1] !== 88 || t[2] !== 32 || t[3] !== 37)
    return null;
  const e = new I(t);
  e.skipBits(32), e.skipBits(8);
  const i = e.readBits(2), r = e.readBits(1), s = 8 + 4 * r, n = 16 + 4 * r;
  e.skipBits(s);
  const o = e.readBits(n) + 1, a = { frameSize: o, asset: null };
  if (!e.readBits(1))
    return a;
  const l = ds[e.readBits(2)], c = 512 * (e.readBits(3) + 1);
  e.readBits(1) && e.skipBits(36);
  const d = e.readBits(3) + 1, u = e.readBits(3) + 1, f = [];
  for (let _ = 0; _ < d; _++)
    f.push(e.readBits(i + 1));
  for (const _ of f)
    e.skipBits(8 * lr(_));
  if (e.readBits(1)) {
    e.skipBits(2);
    const _ = e.readBits(2) + 1 << 2, x = e.readBits(2) + 1;
    e.skipBits(x * _);
  }
  for (let _ = 0; _ < u; _++)
    e.skipBits(n);
  e.skipBits(9), e.skipBits(3), e.readBits(1) && e.skipBits(4), e.readBits(1) && e.skipBits(24), e.readBits(1) && e.skipBits(8 * (e.readBits(10) + 1));
  const m = e.readBits(5) + 1, g = ls[e.readBits(4)], y = e.readBits(8) + 1;
  let E = 0;
  if (e.readBits(1) && (y > 2 && e.skipBits(1), y > 6 && e.skipBits(1), e.readBits(1))) {
    const _ = e.readBits(2) + 1 << 2;
    E = e.readBits(_);
  }
  return l === 0 || e.getBitsLeft() < 0 ? a : {
    frameSize: o,
    asset: {
      sampleRate: g,
      numberOfChannels: y,
      sampleCount: Math.round(c * g / l),
      channelLayout: E,
      pcmResolution: m
    }
  };
}, ps = (t) => {
  const e = new Uint8Array(is), i = Ge(e);
  i.setUint32(0, t.sampleRate), i.setUint32(4, t.bitRate), i.setUint32(8, t.bitRate), e[12] = t.pcmResolution;
  const r = t.core && !t.hasExtensions ? 1 : 0, s = new I(e);
  return s.seekToByte(13), s.writeBits(2, Math.max(us.indexOf(t.sampleCount), 0)), s.writeBits(5, r), s.writeBits(1, t.core?.lfePresent ? 1 : 0), s.writeBits(6, t.core?.amode ?? 0), s.writeBits(14, t.core ? t.core.frameSize - 1 : 0), s.writeBits(1, 0), s.writeBits(3, 0), s.writeBits(16, t.channelLayout), s.writeBits(1, 0), s.writeBits(1, 0), s.writeBits(1, 0), s.writeBits(5, 0), e;
};
const le = [
  "avc",
  "hevc",
  "vp9",
  "av1",
  "vp8",
  "prores"
], Te = [
  "pcm-s16",
  // We don't prefix 'le' so we're compatible with the WebCodecs-registered PCM codec strings
  "pcm-s16be",
  "pcm-s24",
  "pcm-s24be",
  "pcm-s32",
  "pcm-s32be",
  "pcm-f32",
  "pcm-f32be",
  "pcm-f64",
  "pcm-f64be",
  "pcm-u8",
  "pcm-s8",
  "ulaw",
  "alaw"
], St = [
  "aac",
  "opus",
  "mp3",
  "vorbis",
  "flac",
  "ac3",
  "eac3",
  "dts"
], $e = [
  ...St,
  ...Te
], Oe = [
  "webvtt"
], De = [
  { maxMacroblocks: 99, maxBitrate: 64e3, maxDpbMbs: 396, level: 10 },
  // Level 1
  { maxMacroblocks: 396, maxBitrate: 192e3, maxDpbMbs: 900, level: 11 },
  // Level 1.1
  { maxMacroblocks: 396, maxBitrate: 384e3, maxDpbMbs: 2376, level: 12 },
  // Level 1.2
  { maxMacroblocks: 396, maxBitrate: 768e3, maxDpbMbs: 2376, level: 13 },
  // Level 1.3
  { maxMacroblocks: 396, maxBitrate: 2e6, maxDpbMbs: 2376, level: 20 },
  // Level 2
  { maxMacroblocks: 792, maxBitrate: 4e6, maxDpbMbs: 4752, level: 21 },
  // Level 2.1
  { maxMacroblocks: 1620, maxBitrate: 4e6, maxDpbMbs: 8100, level: 22 },
  // Level 2.2
  { maxMacroblocks: 1620, maxBitrate: 1e7, maxDpbMbs: 8100, level: 30 },
  // Level 3
  { maxMacroblocks: 3600, maxBitrate: 14e6, maxDpbMbs: 18e3, level: 31 },
  // Level 3.1
  { maxMacroblocks: 5120, maxBitrate: 2e7, maxDpbMbs: 20480, level: 32 },
  // Level 3.2
  { maxMacroblocks: 8192, maxBitrate: 2e7, maxDpbMbs: 32768, level: 40 },
  // Level 4
  { maxMacroblocks: 8192, maxBitrate: 5e7, maxDpbMbs: 32768, level: 41 },
  // Level 4.1
  { maxMacroblocks: 8704, maxBitrate: 5e7, maxDpbMbs: 34816, level: 42 },
  // Level 4.2
  { maxMacroblocks: 22080, maxBitrate: 135e6, maxDpbMbs: 110400, level: 50 },
  // Level 5
  { maxMacroblocks: 36864, maxBitrate: 24e7, maxDpbMbs: 184320, level: 51 },
  // Level 5.1
  { maxMacroblocks: 36864, maxBitrate: 24e7, maxDpbMbs: 184320, level: 52 },
  // Level 5.2
  { maxMacroblocks: 139264, maxBitrate: 24e7, maxDpbMbs: 696320, level: 60 },
  // Level 6
  { maxMacroblocks: 139264, maxBitrate: 48e7, maxDpbMbs: 696320, level: 61 },
  // Level 6.1
  { maxMacroblocks: 139264, maxBitrate: 8e8, maxDpbMbs: 696320, level: 62 }
  // Level 6.2
], Gt = [
  { maxPictureSize: 36864, maxBitrate: 128e3, tier: "L", level: 30 },
  // Level 1 (Low Tier)
  { maxPictureSize: 122880, maxBitrate: 15e5, tier: "L", level: 60 },
  // Level 2 (Low Tier)
  { maxPictureSize: 245760, maxBitrate: 3e6, tier: "L", level: 63 },
  // Level 2.1 (Low Tier)
  { maxPictureSize: 552960, maxBitrate: 6e6, tier: "L", level: 90 },
  // Level 3 (Low Tier)
  { maxPictureSize: 983040, maxBitrate: 1e7, tier: "L", level: 93 },
  // Level 3.1 (Low Tier)
  { maxPictureSize: 2228224, maxBitrate: 12e6, tier: "L", level: 120 },
  // Level 4 (Low Tier)
  { maxPictureSize: 2228224, maxBitrate: 3e7, tier: "H", level: 120 },
  // Level 4 (High Tier)
  { maxPictureSize: 2228224, maxBitrate: 2e7, tier: "L", level: 123 },
  // Level 4.1 (Low Tier)
  { maxPictureSize: 2228224, maxBitrate: 5e7, tier: "H", level: 123 },
  // Level 4.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 25e6, tier: "L", level: 150 },
  // Level 5 (Low Tier)
  { maxPictureSize: 8912896, maxBitrate: 1e8, tier: "H", level: 150 },
  // Level 5 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 4e7, tier: "L", level: 153 },
  // Level 5.1 (Low Tier)
  { maxPictureSize: 8912896, maxBitrate: 16e7, tier: "H", level: 153 },
  // Level 5.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 6e7, tier: "L", level: 156 },
  // Level 5.2 (Low Tier)
  { maxPictureSize: 8912896, maxBitrate: 24e7, tier: "H", level: 156 },
  // Level 5.2 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 6e7, tier: "L", level: 180 },
  // Level 6 (Low Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "H", level: 180 },
  // Level 6 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 12e7, tier: "L", level: 183 },
  // Level 6.1 (Low Tier)
  { maxPictureSize: 35651584, maxBitrate: 48e7, tier: "H", level: 183 },
  // Level 6.1 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "L", level: 186 },
  // Level 6.2 (Low Tier)
  { maxPictureSize: 35651584, maxBitrate: 8e8, tier: "H", level: 186 }
  // Level 6.2 (High Tier)
], Qt = [
  { maxPictureSize: 36864, maxBitrate: 2e5, level: 10 },
  // Level 1
  { maxPictureSize: 73728, maxBitrate: 8e5, level: 11 },
  // Level 1.1
  { maxPictureSize: 122880, maxBitrate: 18e5, level: 20 },
  // Level 2
  { maxPictureSize: 245760, maxBitrate: 36e5, level: 21 },
  // Level 2.1
  { maxPictureSize: 552960, maxBitrate: 72e5, level: 30 },
  // Level 3
  { maxPictureSize: 983040, maxBitrate: 12e6, level: 31 },
  // Level 3.1
  { maxPictureSize: 2228224, maxBitrate: 18e6, level: 40 },
  // Level 4
  { maxPictureSize: 2228224, maxBitrate: 3e7, level: 41 },
  // Level 4.1
  { maxPictureSize: 8912896, maxBitrate: 6e7, level: 50 },
  // Level 5
  { maxPictureSize: 8912896, maxBitrate: 12e7, level: 51 },
  // Level 5.1
  { maxPictureSize: 8912896, maxBitrate: 18e7, level: 52 },
  // Level 5.2
  { maxPictureSize: 35651584, maxBitrate: 18e7, level: 60 },
  // Level 6
  { maxPictureSize: 35651584, maxBitrate: 24e7, level: 61 },
  // Level 6.1
  { maxPictureSize: 35651584, maxBitrate: 48e7, level: 62 }
  // Level 6.2
], Xt = [
  { maxPictureSize: 147456, maxBitrate: 15e5, tier: "M", level: 0 },
  // Level 2.0 (Main Tier)
  { maxPictureSize: 278784, maxBitrate: 3e6, tier: "M", level: 1 },
  // Level 2.1 (Main Tier)
  { maxPictureSize: 665856, maxBitrate: 6e6, tier: "M", level: 4 },
  // Level 3.0 (Main Tier)
  { maxPictureSize: 1065024, maxBitrate: 1e7, tier: "M", level: 5 },
  // Level 3.1 (Main Tier)
  { maxPictureSize: 2359296, maxBitrate: 12e6, tier: "M", level: 8 },
  // Level 4.0 (Main Tier)
  { maxPictureSize: 2359296, maxBitrate: 3e7, tier: "H", level: 8 },
  // Level 4.0 (High Tier)
  { maxPictureSize: 2359296, maxBitrate: 2e7, tier: "M", level: 9 },
  // Level 4.1 (Main Tier)
  { maxPictureSize: 2359296, maxBitrate: 5e7, tier: "H", level: 9 },
  // Level 4.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 3e7, tier: "M", level: 12 },
  // Level 5.0 (Main Tier)
  { maxPictureSize: 8912896, maxBitrate: 1e8, tier: "H", level: 12 },
  // Level 5.0 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 4e7, tier: "M", level: 13 },
  // Level 5.1 (Main Tier)
  { maxPictureSize: 8912896, maxBitrate: 16e7, tier: "H", level: 13 },
  // Level 5.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 6e7, tier: "M", level: 14 },
  // Level 5.2 (Main Tier)
  { maxPictureSize: 8912896, maxBitrate: 24e7, tier: "H", level: 14 },
  // Level 5.2 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 6e7, tier: "M", level: 15 },
  // Level 5.3 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "H", level: 15 },
  // Level 5.3 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 6e7, tier: "M", level: 16 },
  // Level 6.0 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "H", level: 16 },
  // Level 6.0 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 1e8, tier: "M", level: 17 },
  // Level 6.1 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 48e7, tier: "H", level: 17 },
  // Level 6.1 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 16e7, tier: "M", level: 18 },
  // Level 6.2 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 8e8, tier: "H", level: 18 },
  // Level 6.2 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 16e7, tier: "M", level: 19 },
  // Level 6.3 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 8e8, tier: "H", level: 19 }
  // Level 6.3 (High Tier)
], Fe = [
  "ap4x",
  // ProRes 4444 XQ
  "ap4h",
  // ProRes 4444
  "apch",
  // ProRes 422 High Quality
  "apcn",
  // ProRes 422 Standard Definition
  "apcs",
  // ProRes 422 LT
  "apco"
  // ProRes 422 Proxy
], bt = [
  "dtsc",
  // DTS core
  "dtsh",
  // DTS-HD, core plus extension substreams
  "dtsl",
  // DTS-HD Lossless, no core
  "dtse"
  // DTS Express
], gs = [
  { fourCc: "apco", bitrate: 45e6, alpha: !1 },
  // 422 Proxy
  { fourCc: "apcs", bitrate: 102e6, alpha: !1 },
  // 422 LT
  { fourCc: "apcn", bitrate: 147e6, alpha: !1 },
  // 422 Standard
  { fourCc: "apch", bitrate: 22e7, alpha: !1 },
  // 422 HQ
  { fourCc: "ap4h", bitrate: 33e7, alpha: !0 },
  // 4444
  { fourCc: "ap4x", bitrate: 5e8, alpha: !0 }
  // 4444 XQ
], ws = (t, e, i, r, s) => {
  if (t === "avc") {
    const o = Math.ceil(e / 16) * Math.ceil(i / 16), a = De.find((f) => o <= f.maxMacroblocks && r <= f.maxBitrate) ?? re(De), l = a ? a.level : 0, c = "64".padStart(2, "0"), d = "00", u = l.toString(16).padStart(2, "0");
    return `avc1.${c}${d}${u}`;
  } else if (t === "hevc") {
    const l = e * i, c = Gt.find((u) => l <= u.maxPictureSize && r <= u.maxBitrate) ?? re(Gt);
    return `hev1.1.6.${c.tier}${c.level}.B0`;
  } else {
    if (t === "vp8")
      return "vp8";
    if (t === "vp9") {
      const o = e * i;
      return `vp09.00.${(Qt.find((c) => o <= c.maxPictureSize && r <= c.maxBitrate) ?? re(Qt)).level.toString().padStart(2, "0")}.08`;
    } else if (t === "av1") {
      const o = e * i, a = Xt.find((d) => o <= d.maxPictureSize && r <= d.maxBitrate) ?? re(Xt);
      return `av01.0.${a.level.toString().padStart(2, "0")}${a.tier}.08`;
    } else if (t === "prores") {
      const o = Math.pow(e * i / 2073600, 0.95), a = gs.filter((d) => d.alpha === s);
      let l = a[0].fourCc, c = 1 / 0;
      for (const { fourCc: d, bitrate: u } of a) {
        const f = Math.abs(u * o - r);
        f < c && (c = f, l = d);
      }
      return l;
    } else
      Be(t);
  }
  throw new TypeError(`Unhandled codec '${String(t)}'.`);
}, ys = (t) => {
  const e = t.split("."), s = (1 << 7) + 1, n = Number(e[1]), o = e[2], a = Number(o.slice(0, -1)), l = (n << 5) + a, c = o.slice(-1) === "H" ? 1 : 0, d = Number(e[3]), u = d === 8 ? 0 : 1, f = d === 12 ? 1 : 0, m = e[4] ? Number(e[4]) : 0, g = e[5] ? Number(e[5][0]) : 1, y = e[5] ? Number(e[5][1]) : 1, E = e[5] ? Number(e[5][2]) : 0, _ = (c << 7) + (u << 6) + (f << 5) + (m << 4) + (g << 3) + (y << 2) + E;
  return [s, l, _, 0];
}, Ri = /^pcm-([usf])(\d+)(be)?$/, xe = (t) => {
  if (h(Te.includes(t)), t === "ulaw")
    return { dataType: "ulaw", sampleSize: 1, littleEndian: !0, silentValue: 255 };
  if (t === "alaw")
    return { dataType: "alaw", sampleSize: 1, littleEndian: !0, silentValue: 213 };
  const e = Ri.exec(t);
  h(e);
  let i;
  e[1] === "u" ? i = "unsigned" : e[1] === "s" ? i = "signed" : i = "float";
  const r = Number(e[2]) / 8, s = e[3] !== "be", n = t === "pcm-u8" ? 2 ** 7 : 0;
  return { dataType: i, sampleSize: r, littleEndian: s, silentValue: n };
}, Bt = (t) => t.startsWith("avc1") || t.startsWith("avc3") ? "avc" : t.startsWith("hev1") || t.startsWith("hvc1") ? "hevc" : t === "vp8" ? "vp8" : t.startsWith("vp09") ? "vp9" : t.startsWith("av01") ? "av1" : Fe.includes(t) ? "prores" : t === "mp3" || t === "mp4a.69" || t === "mp4a.6B" || t === "mp4a.6b" || t === "mp4a.40.34" ? "mp3" : t.startsWith("mp4a.40.") || t === "mp4a.67" ? "aac" : t === "opus" || t === "Opus" ? "opus" : t === "vorbis" ? "vorbis" : t === "flac" ? "flac" : t === "ac-3" || t === "ac3" ? "ac3" : t === "ec-3" || t === "eac3" ? "eac3" : bt.includes(t) ? "dts" : t === "ulaw" ? "ulaw" : t === "alaw" ? "alaw" : Ri.test(t) ? t : t === "webvtt" ? "webvtt" : null, bs = (t) => t === "avc" ? {
  avc: {
    format: "avc"
    // Ensure the format is not Annex B
  }
} : t === "hevc" ? {
  hevc: {
    format: "hevc"
    // Ensure the format is not Annex B
  }
} : {}, Ts = ["avc1", "avc3", "hev1", "hvc1", "vp8", "vp09", "av01", ...Fe], Es = /^(avc1|avc3)\.[0-9a-fA-F]{6}$/, _s = /^(hev1|hvc1)\.(?:[ABC]?\d+)\.[0-9a-fA-F]{1,8}\.[LH]\d+(?:\.[0-9a-fA-F]{1,2}){0,6}$/, vs = /^vp09(?:\.\d{2}){3}(?:(?:\.\d{2}){5})?$/, Cs = /^av01\.\d\.\d{2}[MH]\.\d{2}(?:\.\d\.\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d)?$/, Mi = (t, e) => {
  if (!t)
    throw new TypeError("Video chunk metadata must be provided.");
  if (typeof t != "object")
    throw new TypeError("Video chunk metadata must be an object.");
  if (!t.decoderConfig)
    throw new TypeError("Video chunk metadata must include a decoder configuration.");
  if (typeof t.decoderConfig != "object")
    throw new TypeError("Video chunk metadata decoder configuration must be an object.");
  if (typeof t.decoderConfig.codec != "string")
    throw new TypeError("Video chunk metadata decoder configuration must specify a codec string.");
  if (!Ts.some((i) => t.decoderConfig.codec.startsWith(i)))
    throw new TypeError("Video chunk metadata decoder configuration codec string must be a valid video codec string as specified in the Mediabunny Codec Registry.");
  if (!Number.isInteger(t.decoderConfig.codedWidth) || t.decoderConfig.codedWidth <= 0)
    throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedWidth (positive integer).");
  if (!Number.isInteger(t.decoderConfig.codedHeight) || t.decoderConfig.codedHeight <= 0)
    throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedHeight (positive integer).");
  if (t.decoderConfig.displayAspectWidth !== void 0 && (!Number.isInteger(t.decoderConfig.displayAspectWidth) || t.decoderConfig.displayAspectWidth <= 0))
    throw new TypeError("Video chunk metadata decoder configuration displayAspectWidth, when defined, must be a positive integer.");
  if (t.decoderConfig.displayAspectHeight !== void 0 && (!Number.isInteger(t.decoderConfig.displayAspectHeight) || t.decoderConfig.displayAspectHeight <= 0))
    throw new TypeError("Video chunk metadata decoder configuration displayAspectHeight, when defined, must be a positive integer.");
  if (t.decoderConfig.displayAspectWidth !== void 0 != (t.decoderConfig.displayAspectHeight !== void 0))
    throw new TypeError("Video chunk metadata decoder configuration must specify both displayAspectWidth and displayAspectHeight, or neither.");
  if (t.decoderConfig.description !== void 0 && !Ct(t.decoderConfig.description))
    throw new TypeError("Video chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
  if (t.decoderConfig.colorSpace !== void 0) {
    const { colorSpace: i } = t.decoderConfig;
    if (typeof i != "object")
      throw new TypeError("Video chunk metadata decoder configuration colorSpace, when provided, must be an object.");
    const r = Object.keys(Qe);
    if (i.primaries != null && !r.includes(i.primaries))
      throw new TypeError(`Video chunk metadata decoder configuration colorSpace primaries, when defined, must be one of ${r.join(", ")}.`);
    const s = Object.keys(Xe);
    if (i.transfer != null && !s.includes(i.transfer))
      throw new TypeError(`Video chunk metadata decoder configuration colorSpace transfer, when defined, must be one of ${s.join(", ")}.`);
    const n = Object.keys(Ke);
    if (i.matrix != null && !n.includes(i.matrix))
      throw new TypeError(`Video chunk metadata decoder configuration colorSpace matrix, when defined, must be one of ${n.join(", ")}.`);
    if (i.fullRange != null && typeof i.fullRange != "boolean")
      throw new TypeError("Video chunk metadata decoder configuration colorSpace fullRange, when defined, must be a boolean.");
  }
  if (t.decoderConfig.codec.startsWith("avc1") || t.decoderConfig.codec.startsWith("avc3")) {
    if (!Es.test(t.decoderConfig.codec))
      throw new TypeError("Video chunk metadata decoder configuration codec string for AVC must be a valid AVC codec string as specified in Section 3.4 of RFC 6381.");
  } else if (t.decoderConfig.codec.startsWith("hev1") || t.decoderConfig.codec.startsWith("hvc1")) {
    if (!_s.test(t.decoderConfig.codec))
      throw new TypeError("Video chunk metadata decoder configuration codec string for HEVC must be a valid HEVC codec string as specified in Section E.3 of ISO 14496-15.");
  } else if (t.decoderConfig.codec.startsWith("vp8")) {
    if (t.decoderConfig.codec !== "vp8")
      throw new TypeError('Video chunk metadata decoder configuration codec string for VP8 must be "vp8".');
  } else if (t.decoderConfig.codec.startsWith("vp09")) {
    if (!vs.test(t.decoderConfig.codec))
      throw new TypeError('Video chunk metadata decoder configuration codec string for VP9 must be a valid VP9 codec string as specified in Section "Codecs Parameter String" of https://www.webmproject.org/vp9/mp4/.');
  } else if (t.decoderConfig.codec.startsWith("av01")) {
    if (!Cs.test(t.decoderConfig.codec))
      throw new TypeError('Video chunk metadata decoder configuration codec string for AV1 must be a valid AV1 codec string as specified in Section "Codecs Parameter String" of https://aomediacodec.github.io/av1-isobmff/.');
  } else if (Fe.some((i) => t.decoderConfig.codec.startsWith(i)) && !Fe.some((i) => t.decoderConfig.codec === i))
    throw new TypeError(`Video chunk metadata decoder configuration codec string for ProRes must be one of the valid ProRes four-character codes: ${Fe.join(", ")}.`);
  if (e !== null && Bt(t.decoderConfig.codec) !== e)
    throw new TypeError(`Video chunk metadata decoder configuration codec string '${t.decoderConfig.codec}' does not fit to the track codec '${e}'.`);
}, xs = [
  "mp4a",
  "mp3",
  "opus",
  "vorbis",
  "flac",
  "ulaw",
  "alaw",
  "pcm",
  "ac-3",
  "ec-3",
  "dts"
], Fi = (t, e) => {
  if (!t)
    throw new TypeError("Audio chunk metadata must be provided.");
  if (typeof t != "object")
    throw new TypeError("Audio chunk metadata must be an object.");
  if (!t.decoderConfig)
    throw new TypeError("Audio chunk metadata must include a decoder configuration.");
  if (typeof t.decoderConfig != "object")
    throw new TypeError("Audio chunk metadata decoder configuration must be an object.");
  if (typeof t.decoderConfig.codec != "string")
    throw new TypeError("Audio chunk metadata decoder configuration must specify a codec string.");
  if (!xs.some((i) => t.decoderConfig.codec.startsWith(i)))
    throw new TypeError("Audio chunk metadata decoder configuration codec string must be a valid audio codec string as specified in the Mediabunny Codec Registry.");
  if (!Number.isInteger(t.decoderConfig.sampleRate) || t.decoderConfig.sampleRate <= 0)
    throw new TypeError("Audio chunk metadata decoder configuration must specify a valid sampleRate (positive integer).");
  if (!Number.isInteger(t.decoderConfig.numberOfChannels) || t.decoderConfig.numberOfChannels <= 0)
    throw new TypeError("Audio chunk metadata decoder configuration must specify a valid numberOfChannels (positive integer).");
  if (t.decoderConfig.description !== void 0 && !Ct(t.decoderConfig.description))
    throw new TypeError("Audio chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
  if (t.decoderConfig.codec.startsWith("mp4a") && t.decoderConfig.codec !== "mp4a.69" && t.decoderConfig.codec !== "mp4a.6B" && t.decoderConfig.codec !== "mp4a.6b") {
    if (!["mp4a.40.2", "mp4a.40.02", "mp4a.40.5", "mp4a.40.05", "mp4a.40.29", "mp4a.67"].includes(t.decoderConfig.codec))
      throw new TypeError("Audio chunk metadata decoder configuration codec string for AAC must be a valid AAC codec string as specified in https://www.w3.org/TR/webcodecs-aac-codec-registration/.");
  } else if (t.decoderConfig.codec.startsWith("mp3") || t.decoderConfig.codec.startsWith("mp4a")) {
    if (t.decoderConfig.codec !== "mp3" && t.decoderConfig.codec !== "mp4a.69" && t.decoderConfig.codec !== "mp4a.6B" && t.decoderConfig.codec !== "mp4a.6b")
      throw new TypeError('Audio chunk metadata decoder configuration codec string for MP3 must be "mp3", "mp4a.69" or "mp4a.6B".');
  } else if (t.decoderConfig.codec.startsWith("opus")) {
    if (t.decoderConfig.codec !== "opus")
      throw new TypeError('Audio chunk metadata decoder configuration codec string for Opus must be "opus".');
    if (t.decoderConfig.description && t.decoderConfig.description.byteLength < 18)
      throw new TypeError("Audio chunk metadata decoder configuration description, when specified, is expected to be an Identification Header as specified in Section 5.1 of RFC 7845.");
  } else if (t.decoderConfig.codec.startsWith("vorbis")) {
    if (t.decoderConfig.codec !== "vorbis")
      throw new TypeError('Audio chunk metadata decoder configuration codec string for Vorbis must be "vorbis".');
    if (!t.decoderConfig.description)
      throw new TypeError("Audio chunk metadata decoder configuration for Vorbis must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-vorbis-codec-registration/.");
  } else if (t.decoderConfig.codec.startsWith("flac")) {
    if (t.decoderConfig.codec !== "flac")
      throw new TypeError('Audio chunk metadata decoder configuration codec string for FLAC must be "flac".');
    if (!t.decoderConfig.description || t.decoderConfig.description.byteLength < 42)
      throw new TypeError("Audio chunk metadata decoder configuration for FLAC must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-flac-codec-registration/.");
  } else if (t.decoderConfig.codec.startsWith("ac-3") || t.decoderConfig.codec.startsWith("ac3")) {
    if (t.decoderConfig.codec !== "ac-3")
      throw new TypeError('Audio chunk metadata decoder configuration codec string for AC-3 must be "ac-3".');
  } else if (t.decoderConfig.codec.startsWith("ec-3") || t.decoderConfig.codec.startsWith("eac3")) {
    if (t.decoderConfig.codec !== "ec-3")
      throw new TypeError('Audio chunk metadata decoder configuration codec string for EC-3 must be "ec-3".');
  } else if (t.decoderConfig.codec.startsWith("dts")) {
    if (!bt.includes(t.decoderConfig.codec))
      throw new TypeError(`Audio chunk metadata decoder configuration codec string for DTS must be one of the following four-character codes: ${bt.join(", ")}.`);
  } else if ((t.decoderConfig.codec.startsWith("pcm") || t.decoderConfig.codec.startsWith("ulaw") || t.decoderConfig.codec.startsWith("alaw")) && !Te.includes(t.decoderConfig.codec))
    throw new TypeError(`Audio chunk metadata decoder configuration codec string for PCM must be one of the supported PCM codecs (${Te.join(", ")}).`);
  if (e !== null && Bt(t.decoderConfig.codec) !== e)
    throw new TypeError(`Audio chunk metadata decoder configuration codec string '${t.decoderConfig.codec}' does not fit to the track codec '${e}'.`);
}, Ss = (t) => {
  if (!t)
    throw new TypeError("Subtitle metadata must be provided.");
  if (typeof t != "object")
    throw new TypeError("Subtitle metadata must be an object.");
  if (!t.config)
    throw new TypeError("Subtitle metadata must include a config object.");
  if (typeof t.config != "object")
    throw new TypeError("Subtitle metadata config must be an object.");
  if (typeof t.config.description != "string")
    throw new TypeError("Subtitle metadata config description must be a string.");
};
const Kt = /* @__PURE__ */ new Uint8Array(0);
class Ee {
  /** Creates a new {@link EncodedPacket} from raw bytes and timing information. */
  constructor(e, i, r, s, n = -1, o, a) {
    if (this.data = e, this.type = i, this.timestamp = r, this.duration = s, this.sequenceNumber = n, e === Kt && o === void 0)
      throw new Error("Internal error: byteLength must be explicitly provided when constructing metadata-only packets.");
    if (o === void 0 && (o = e.byteLength), !(e instanceof Uint8Array))
      throw new TypeError("data must be a Uint8Array.");
    if (i !== "key" && i !== "delta")
      throw new TypeError('type must be either "key" or "delta".');
    if (!Number.isFinite(r))
      throw new TypeError("timestamp must be a number.");
    if (!Number.isFinite(s) || s < 0)
      throw new TypeError("duration must be a non-negative number.");
    if (!Number.isFinite(n))
      throw new TypeError("sequenceNumber must be a number.");
    if (!Number.isInteger(o) || o < 0)
      throw new TypeError("byteLength must be a non-negative integer.");
    if (a !== void 0 && (typeof a != "object" || !a))
      throw new TypeError("sideData, when provided, must be an object.");
    if (a?.alpha !== void 0 && !(a.alpha instanceof Uint8Array))
      throw new TypeError("sideData.alpha, when provided, must be a Uint8Array.");
    if (a?.alphaByteLength !== void 0 && (!Number.isInteger(a.alphaByteLength) || a.alphaByteLength < 0))
      throw new TypeError("sideData.alphaByteLength, when provided, must be a non-negative integer.");
    this.byteLength = o, this.sideData = a ?? {}, this.sideData.alpha && this.sideData.alphaByteLength === void 0 && (this.sideData.alphaByteLength = this.sideData.alpha.byteLength);
  }
  /**
   * If this packet is a metadata-only packet. Metadata-only packets don't contain their packet data. They are the
   * result of retrieving packets with {@link PacketRetrievalOptions.metadataOnly} set to `true`.
   */
  get isMetadataOnly() {
    return this.data === Kt;
  }
  /** The timestamp of this packet in microseconds. */
  get microsecondTimestamp() {
    return Math.trunc(Ce * this.timestamp);
  }
  /** The duration of this packet in microseconds. */
  get microsecondDuration() {
    return Math.trunc(Ce * this.duration);
  }
  /** Converts this packet to an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) for use with the
   * WebCodecs API. */
  toEncodedVideoChunk() {
    if (this.isMetadataOnly)
      throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
    if (typeof EncodedVideoChunk > "u")
      throw new Error("EncodedVideoChunk is not available in this environment.");
    return new EncodedVideoChunk({
      data: this.data,
      type: this.type,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /**
   * Converts this packet to an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) for use with the
   * WebCodecs API, using the alpha side data instead of the color data. Throws if no alpha side data is defined.
   */
  alphaToEncodedVideoChunk(e = this.type) {
    if (!this.sideData.alpha)
      throw new TypeError("This packet does not contain alpha side data.");
    if (this.isMetadataOnly)
      throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
    if (typeof EncodedVideoChunk > "u")
      throw new Error("EncodedVideoChunk is not available in this environment.");
    return new EncodedVideoChunk({
      data: this.sideData.alpha,
      type: e,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /** Converts this packet to an
   * [`EncodedAudioChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedAudioChunk) for use with the
   * WebCodecs API. */
  toEncodedAudioChunk() {
    if (this.isMetadataOnly)
      throw new TypeError("Metadata-only packets cannot be converted to an audio chunk.");
    if (typeof EncodedAudioChunk > "u")
      throw new Error("EncodedAudioChunk is not available in this environment.");
    return new EncodedAudioChunk({
      data: this.data,
      type: this.type,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /**
   * Creates an {@link EncodedPacket} from an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) or
   * [`EncodedAudioChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedAudioChunk). This method is useful
   * for converting chunks from the WebCodecs API to `EncodedPacket` instances.
   */
  static fromEncodedChunk(e, i) {
    if (!(e instanceof EncodedVideoChunk || e instanceof EncodedAudioChunk))
      throw new TypeError("chunk must be an EncodedVideoChunk or EncodedAudioChunk.");
    const r = new Uint8Array(e.byteLength);
    return e.copyTo(r), new Ee(r, e.type, e.timestamp / 1e6, (e.duration ?? 0) / 1e6, void 0, void 0, i);
  }
  /** Clones this packet while optionally modifying the new packet's data. */
  clone(e) {
    if (e !== void 0 && (typeof e != "object" || e === null))
      throw new TypeError("options, when provided, must be an object.");
    if (e?.data !== void 0 && !(e.data instanceof Uint8Array))
      throw new TypeError("options.data, when provided, must be a Uint8Array.");
    if (e?.type !== void 0 && e.type !== "key" && e.type !== "delta")
      throw new TypeError('options.type, when provided, must be either "key" or "delta".');
    if (e?.timestamp !== void 0 && !Number.isFinite(e.timestamp))
      throw new TypeError("options.timestamp, when provided, must be a number.");
    if (e?.duration !== void 0 && !Number.isFinite(e.duration))
      throw new TypeError("options.duration, when provided, must be a number.");
    if (e?.sequenceNumber !== void 0 && !Number.isFinite(e.sequenceNumber))
      throw new TypeError("options.sequenceNumber, when provided, must be a number.");
    if (e?.sideData !== void 0 && (typeof e.sideData != "object" || e.sideData === null))
      throw new TypeError("options.sideData, when provided, must be an object.");
    return new Ee(e?.data ?? this.data, e?.type ?? this.type, e?.timestamp ?? this.timestamp, e?.duration ?? this.duration, e?.sequenceNumber ?? this.sequenceNumber, this.byteLength, e?.sideData ?? this.sideData);
  }
}
const Bs = (t) => {
  let i = (t.hasVideo ? "video/" : t.hasAudio ? "audio/" : "application/") + (t.isQuickTime ? "quicktime" : "mp4");
  if (t.codecStrings.length > 0) {
    const r = [...new Set(t.codecStrings)];
    i += `; codecs="${r.join(", ")}"`;
  }
  return i;
};
const st = 8, Yt = 16;
const Ps = 7, ks = 9, Zt = (t) => {
  const e = t.filePos, i = qs(t, 9), r = new I(i);
  if (r.readBits(12) !== 4095 || (r.skipBits(1), r.readBits(2) !== 0))
    return null;
  const o = r.readBits(1), a = r.readBits(2) + 1, l = r.readBits(4);
  if (l === 15)
    return null;
  r.skipBits(1);
  const c = r.readBits(3);
  if (c === 0)
    throw new Error("ADTS frames with channel configuration 0 are not supported.");
  r.skipBits(1), r.skipBits(1), r.skipBits(1), r.skipBits(1);
  const d = r.readBits(13);
  r.skipBits(11);
  const u = r.readBits(2) + 1;
  if (u !== 1)
    throw new Error("ADTS frames with more than one AAC frame are not supported.");
  let f = null;
  return o === 1 ? t.filePos -= 2 : f = r.readBits(16), {
    objectType: a,
    samplingFrequencyIndex: l,
    channelConfiguration: c,
    frameLength: d,
    numberOfAacFrames: u,
    crcCheck: f,
    startPos: e
  };
};
var As = function(t, e, i) {
  if (e != null) {
    if (typeof e != "object" && typeof e != "function") throw new TypeError("Object expected.");
    var r, s;
    if (i) {
      if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
      r = e[Symbol.asyncDispose];
    }
    if (r === void 0) {
      if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
      r = e[Symbol.dispose], i && (s = r);
    }
    if (typeof r != "function") throw new TypeError("Object not disposable.");
    s && (r = function() {
      try {
        s.call(this);
      } catch (n) {
        return Promise.reject(n);
      }
    }), t.stack.push({ value: e, dispose: r, async: i });
  } else i && t.stack.push({ async: !0 });
  return e;
}, Is = /* @__PURE__ */ (function(t) {
  return function(e) {
    function i(o) {
      e.error = e.hasError ? new t(o, e.error, "An error was suppressed during disposal.") : o, e.hasError = !0;
    }
    var r, s = 0;
    function n() {
      for (; r = e.stack.pop(); )
        try {
          if (!r.async && s === 1) return s = 0, e.stack.push(r), Promise.resolve().then(n);
          if (r.dispose) {
            var o = r.dispose.call(r.value);
            if (r.async) return s |= 2, Promise.resolve(o).then(n, function(a) {
              return i(a), n();
            });
          } else s |= 1;
        } catch (a) {
          i(a);
        }
      if (s === 1) return e.hasError ? Promise.reject(e.error) : Promise.resolve();
      if (e.hasError) throw e.error;
    }
    return n();
  };
})(typeof SuppressedError == "function" ? SuppressedError : function(t, e, i) {
  var r = new Error(i);
  return r.name = "SuppressedError", r.error = t, r.suppressed = e, r;
});
Tr();
let Jt = -1 / 0, ei = -1 / 0, Tt = null;
typeof FinalizationRegistry < "u" && (Tt = new FinalizationRegistry((t) => {
  const e = performance.now();
  t.type === "video" ? (e - Jt >= 1e3 && (k._error("A VideoSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your VideoSamples as soon as you're done using them."), Jt = e), typeof VideoFrame < "u" && t.data instanceof VideoFrame && t.data.close()) : (e - ei >= 1e3 && (k._error("An AudioSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your AudioSamples as soon as you're done using them."), ei = e), typeof AudioData < "u" && t.data instanceof AudioData && t.data.close());
}));
class we {
  constructor() {
    this._referenceCount = 0, this._lastAllocationBuffer = null;
  }
}
const Et = [
  // 4:2:0 Y, U, V
  "I420",
  "I420P10",
  "I420P12",
  // 4:2:0 Y, U, V, A
  "I420A",
  "I420AP10",
  "I420AP12",
  // 4:2:2 Y, U, V
  "I422",
  "I422P10",
  "I422P12",
  // 4:2:2 Y, U, V, A
  "I422A",
  "I422AP10",
  "I422AP12",
  // 4:4:4 Y, U, V
  "I444",
  "I444P10",
  "I444P12",
  // 4:4:4 Y, U, V, A
  "I444A",
  "I444AP10",
  "I444AP12",
  // 4:2:0 Y, UV
  "NV12",
  // 4:4:4 RGBA
  "RGBA",
  // 4:4:4 RGBX (opaque)
  "RGBX",
  // 4:4:4 BGRA
  "BGRA",
  // 4:4:4 BGRX (opaque)
  "BGRX"
], Rs = new Set(Et);
class W {
  /** The width of the frame in pixels. */
  get codedWidth() {
    return this.visibleRect.width;
  }
  /** The height of the frame in pixels. */
  get codedHeight() {
    return this.visibleRect.height;
  }
  /** The display width of the frame in pixels, after aspect ratio adjustment, rotation and flip. */
  get displayWidth() {
    return this.rotation % 180 === 0 ? this.squarePixelWidth : this.squarePixelHeight;
  }
  /** The display height of the frame in pixels, after aspect ratio adjustment, rotation and flip. */
  get displayHeight() {
    return this.rotation % 180 === 0 ? this.squarePixelHeight : this.squarePixelWidth;
  }
  /** The presentation timestamp of the frame in microseconds. */
  get microsecondTimestamp() {
    return Math.trunc(Ce * this.timestamp);
  }
  /** The duration of the frame in microseconds. */
  get microsecondDuration() {
    return Math.trunc(Ce * this.duration);
  }
  /**
   * Whether this sample uses a pixel format that can hold transparency data. Note that this doesn't necessarily mean
   * that the sample is transparent.
   */
  get hasAlpha() {
    return this.format && this.format.includes("A");
  }
  constructor(e, i) {
    if (this._closed = !1, e instanceof ArrayBuffer || typeof SharedArrayBuffer < "u" && e instanceof SharedArrayBuffer || ArrayBuffer.isView(e)) {
      if (!i || typeof i != "object")
        throw new TypeError("init must be an object.");
      if (i.format === void 0 || !Rs.has(i.format))
        throw new TypeError("init.format must be one of: " + Et.join(", "));
      if (!Number.isInteger(i.codedWidth) || i.codedWidth <= 0)
        throw new TypeError("init.codedWidth must be a positive integer.");
      if (!Number.isInteger(i.codedHeight) || i.codedHeight <= 0)
        throw new TypeError("init.codedHeight must be a positive integer.");
      if (i.rotation !== void 0 && ![0, 90, 180, 270].includes(i.rotation))
        throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
      if (i.flip !== void 0 && typeof i.flip != "boolean")
        throw new TypeError("init.flip, when provided, must be a boolean.");
      if (!Number.isFinite(i.timestamp))
        throw new TypeError("init.timestamp must be a number.");
      if (i.duration !== void 0 && (!Number.isFinite(i.duration) || i.duration < 0))
        throw new TypeError("init.duration, when provided, must be a non-negative number.");
      if (i.layout !== void 0) {
        if (!Array.isArray(i.layout))
          throw new TypeError("init.layout, when provided, must be an array.");
        for (const n of i.layout) {
          if (!n || typeof n != "object" || Array.isArray(n))
            throw new TypeError("Each entry in init.layout must be an object.");
          if (!Number.isInteger(n.offset) || n.offset < 0)
            throw new TypeError("plane.offset must be a non-negative integer.");
          if (!Number.isInteger(n.stride) || n.stride < 0)
            throw new TypeError("plane.stride must be a non-negative integer.");
        }
      }
      if (i.visibleRect !== void 0 && it(i.visibleRect, "init.visibleRect"), i.displayWidth !== void 0 && (!Number.isInteger(i.displayWidth) || i.displayWidth <= 0))
        throw new TypeError("init.displayWidth, when provided, must be a positive integer.");
      if (i.displayHeight !== void 0 && (!Number.isInteger(i.displayHeight) || i.displayHeight <= 0))
        throw new TypeError("init.displayHeight, when provided, must be a positive integer.");
      if (i.displayWidth !== void 0 != (i.displayHeight !== void 0))
        throw new TypeError("init.displayWidth and init.displayHeight must be either both provided or both omitted.");
      this.format = i.format, this.rotation = i.rotation ?? 0, this.flip = i.flip ?? !1, this.timestamp = i.timestamp, this.duration = i.duration ?? 0;
      const r = i.layout ?? Os(i.format, i.codedWidth, i.codedHeight);
      let s = i.colorSpace ?? null;
      s === null && (this.format === "RGBA" || this.format === "RGBX" || this.format === "BGRA" || this.format === "BGRX" ? s = {
        primaries: "bt709",
        transfer: "iec61966-2-1",
        matrix: "rgb",
        fullRange: !0
      } : s = {
        primaries: "bt709",
        transfer: "bt709",
        matrix: "bt709",
        fullRange: !1
      }), this.visibleRect = {
        left: i.visibleRect?.left ?? 0,
        top: i.visibleRect?.top ?? 0,
        width: i.visibleRect?.width ?? i.codedWidth,
        height: i.visibleRect?.height ?? i.codedHeight
      }, i.displayWidth !== void 0 ? (this.squarePixelWidth = this.rotation % 180 === 0 ? i.displayWidth : i.displayHeight, this.squarePixelHeight = this.rotation % 180 === 0 ? i.displayHeight : i.displayWidth) : (this.squarePixelWidth = this.visibleRect.width, this.squarePixelHeight = this.visibleRect.height), this._data = i._doNotCopy ? K(e) : K(e).slice(), this._layout = r, this.colorSpace = new nt(s);
    } else if (typeof VideoFrame < "u" && e instanceof VideoFrame) {
      if (i?.rotation !== void 0 && ![0, 90, 180, 270].includes(i.rotation))
        throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
      if (i?.flip !== void 0 && typeof i.flip != "boolean")
        throw new TypeError("init.flip, when provided, must be a boolean.");
      if (i?.timestamp !== void 0 && !Number.isFinite(i?.timestamp))
        throw new TypeError("init.timestamp, when provided, must be a number.");
      if (i?.duration !== void 0 && (!Number.isFinite(i.duration) || i.duration < 0))
        throw new TypeError("init.duration, when provided, must be a non-negative number.");
      i?.visibleRect !== void 0 && it(i.visibleRect, "init.visibleRect"), this._data = e, this._layout = null, this.format = e.format, this.visibleRect = {
        left: e.visibleRect?.x ?? 0,
        top: e.visibleRect?.y ?? 0,
        width: e.visibleRect?.width ?? e.codedWidth,
        height: e.visibleRect?.height ?? e.codedHeight
      }, this.rotation = i?.rotation ?? 0, this.flip = i?.flip ?? !1, this.squarePixelWidth = e.displayWidth, this.squarePixelHeight = e.displayHeight, this.timestamp = i?.timestamp ?? e.timestamp / 1e6, this.duration = i?.duration ?? (e.duration ?? 0) / 1e6, this.colorSpace = new nt(e.colorSpace);
    } else if (typeof HTMLImageElement < "u" && e instanceof HTMLImageElement || typeof SVGImageElement < "u" && e instanceof SVGImageElement || typeof ImageBitmap < "u" && e instanceof ImageBitmap || typeof HTMLVideoElement < "u" && e instanceof HTMLVideoElement || typeof HTMLCanvasElement < "u" && e instanceof HTMLCanvasElement || typeof OffscreenCanvas < "u" && e instanceof OffscreenCanvas) {
      if (!i || typeof i != "object")
        throw new TypeError("init must be an object.");
      if (i.rotation !== void 0 && ![0, 90, 180, 270].includes(i.rotation))
        throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
      if (i.flip !== void 0 && typeof i.flip != "boolean")
        throw new TypeError("init.flip, when provided, must be a boolean.");
      if (!Number.isFinite(i.timestamp))
        throw new TypeError("init.timestamp must be a number.");
      if (i.duration !== void 0 && (!Number.isFinite(i.duration) || i.duration < 0))
        throw new TypeError("init.duration, when provided, must be a non-negative number.");
      if (i.visibleRect !== void 0 && it(i.visibleRect, "init.visibleRect"), typeof VideoFrame < "u")
        return new W(new VideoFrame(e, {
          timestamp: Math.trunc(i.timestamp * Ce),
          // Drag 0 to undefined
          duration: Math.trunc((i.duration ?? 0) * Ce) || void 0,
          // WebCodecs wants DOMRectInit
          visibleRect: i.visibleRect && {
            x: i.visibleRect.left,
            y: i.visibleRect.top,
            width: i.visibleRect.width,
            height: i.visibleRect.height
          }
        }), i);
      let r = 0, s = 0;
      if ("naturalWidth" in e ? (r = e.naturalWidth, s = e.naturalHeight) : "videoWidth" in e ? (r = e.videoWidth, s = e.videoHeight) : "width" in e && (r = Number(e.width), s = Number(e.height)), !r || !s)
        throw new TypeError("Could not determine dimensions.");
      const n = i.visibleRect ?? { left: 0, top: 0, width: r, height: s }, o = new OffscreenCanvas(n.width, n.height), a = o.getContext("2d", {
        alpha: vi(),
        // Firefox has VideoFrame glitches with opaque canvases
        willReadFrequently: !0
      });
      if (!a)
        throw new Error("OffscreenCanvas must have support for the '2d' context in order to create a VideoSample from this data.");
      a.drawImage(e, -n.left, -n.top), this._data = o, this._layout = null, this.format = "RGBX", this.visibleRect = { left: 0, top: 0, width: n.width, height: n.height }, this.squarePixelWidth = n.width, this.squarePixelHeight = n.height, this.rotation = i.rotation ?? 0, this.flip = i.flip ?? !1, this.timestamp = i.timestamp, this.duration = i.duration ?? 0, this.colorSpace = new nt({
        matrix: "rgb",
        primaries: "bt709",
        transfer: "iec61966-2-1",
        fullRange: !0
      });
    } else if (e instanceof we) {
      if (!i || typeof i != "object")
        throw new TypeError("init must be an object.");
      if (i.rotation !== void 0 && ![0, 90, 180, 270].includes(i.rotation))
        throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
      if (i.flip !== void 0 && typeof i.flip != "boolean")
        throw new TypeError("init.flip, when provided, must be a boolean.");
      if (!Number.isFinite(i.timestamp))
        throw new TypeError("init.timestamp must be a number.");
      if (i.duration !== void 0 && (!Number.isFinite(i.duration) || i.duration < 0))
        throw new TypeError("init.duration, when provided, must be a non-negative number.");
      if (this._data = e, e._referenceCount++, this.format = e.getFormat(), this.format !== null && !Et.includes(this.format))
        throw new TypeError("getFormat() must return a VideoSamplePixelFormat or null.");
      if (this.visibleRect = {
        left: 0,
        top: 0,
        width: e.getCodedWidth(),
        height: e.getCodedHeight()
      }, !Number.isInteger(this.visibleRect.width) || this.visibleRect.width <= 0)
        throw new TypeError("getCodedWidth() must return a positive integer.");
      if (!Number.isInteger(this.visibleRect.height) || this.visibleRect.height <= 0)
        throw new TypeError("getCodedHeight() must return a positive integer.");
      if (this.squarePixelWidth = e.getSquarePixelWidth(), !Number.isInteger(this.squarePixelWidth) || this.squarePixelWidth <= 0)
        throw new TypeError("getSquarePixelWidth() must return a positive integer.");
      if (this.squarePixelHeight = e.getSquarePixelHeight(), !Number.isInteger(this.squarePixelHeight) || this.squarePixelHeight <= 0)
        throw new TypeError("getSquarePixelHeight() must return a positive integer.");
      this.rotation = i.rotation ?? 0, this.flip = i.flip ?? !1, this.timestamp = i.timestamp, this.duration = i.duration ?? 0, this.colorSpace = e.getColorSpace();
    } else
      throw new TypeError("Invalid data type: Must be a BufferSource, CanvasImageSource, or VideoSampleResource.");
    this.encodeOptions = i?.encodeOptions ?? {}, this.pixelAspectRatio = xi({
      num: this.squarePixelWidth * this.codedHeight,
      den: this.squarePixelHeight * this.codedWidth
    }), Tt?.register(this, { type: "video", data: this._data }, this);
  }
  /** Clones this video sample. */
  clone() {
    if (this._closed)
      throw new Error("VideoSample is closed.");
    return h(this._data !== null), this._data instanceof we ? new W(this._data, {
      timestamp: this.timestamp,
      duration: this.duration,
      rotation: this.rotation,
      flip: this.flip,
      encodeOptions: this.encodeOptions
    }) : Ae(this._data) ? new W(this._data.clone(), {
      timestamp: this.timestamp,
      duration: this.duration,
      rotation: this.rotation,
      flip: this.flip,
      encodeOptions: this.encodeOptions
    }) : this._data instanceof Uint8Array ? (h(this._layout), new W(this._data, {
      format: this.format,
      layout: this._layout,
      codedWidth: this.codedWidth,
      codedHeight: this.codedHeight,
      timestamp: this.timestamp,
      duration: this.duration,
      colorSpace: this.colorSpace,
      rotation: this.rotation,
      flip: this.flip,
      visibleRect: this.visibleRect,
      displayWidth: this.displayWidth,
      displayHeight: this.displayHeight,
      encodeOptions: this.encodeOptions,
      // It's already been copied, if we copy it again we make the clone unnecessarily expensive
      _doNotCopy: !0
    })) : new W(this._data, {
      format: this.format,
      codedWidth: this.codedWidth,
      codedHeight: this.codedHeight,
      timestamp: this.timestamp,
      duration: this.duration,
      colorSpace: this.colorSpace,
      rotation: this.rotation,
      flip: this.flip,
      visibleRect: this.visibleRect,
      displayWidth: this.displayWidth,
      displayHeight: this.displayHeight,
      encodeOptions: this.encodeOptions
    });
  }
  /**
   * Closes this video sample, releasing held resources. Video samples should be closed as soon as they are not
   * needed anymore.
   */
  close() {
    this._closed || (Tt?.unregister(this), this._data instanceof we ? (this._data._referenceCount--, this._data._referenceCount === 0 && this._data.close()) : Ae(this._data) ? this._data.close() : this._data = null, this._closed = !0);
  }
  /**
   * Returns the number of bytes required to hold this video sample's pixel data.
   */
  allocationSize(e = {}) {
    if (si(e), this._closed)
      throw new Error("VideoSample is closed.");
    if ((e.format ?? this.format) == null)
      throw new Error("Cannot get allocation size when format is null.");
    return Ae(this._data) ? this._data.allocationSize(e) : ni(this, e).allocationSize;
  }
  /**
   * Copies this video sample's pixel data to an ArrayBuffer or ArrayBufferView.
   * @returns The byte layout of the planes of the copied data.
   */
  async copyTo(e, i = {}) {
    if (!Ct(e))
      throw new TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");
    if (si(i), this._closed)
      throw new Error("VideoSample is closed.");
    if ((i.format ?? this.format) == null)
      throw new Error("Cannot copy video sample data when format is null.");
    if (h(this._data !== null), Ae(this._data))
      return this._data.copyTo(e, i);
    if (i.format && !["RGBA", "RGBX", "BGRA", "BGRX"].includes(this.format) && ["RGBA", "RGBX", "BGRA", "BGRX"].includes(i.format))
      if (this._data instanceof we) {
        const c = { stack: [], error: void 0, hasError: !1 };
        try {
          const d = As(c, await this._data.toRgbSample({
            timestamp: this.timestamp,
            duration: this.duration,
            rotation: this.rotation,
            flip: this.flip
          }, i.colorSpace ?? "srgb"), !1);
          if (!(d instanceof W))
            throw new TypeError("toRgbSample() must return a VideoSample.");
          if (!["RGBA", "RGBX", "BGRA", "BGRX"].includes(d.format))
            throw new Error(`Sample returned by toRgbSample was expected to have an RGB format, got '${d.format}' instead.`);
          return await d.copyTo(e, i);
        } catch (d) {
          c.error = d, c.hasError = !0;
        } finally {
          Is(c);
        }
      } else {
        if (typeof VideoFrame > "u")
          throw new Error("For this sample, converting from a non-RGB to an RGB format requires VideoFrame to be defined.");
        const c = this.toVideoFrame(), d = await c.copyTo(e, i);
        return c.close(), d;
      }
    const r = ni(this, i);
    h(this.format);
    const s = K(e);
    if (s.byteLength < r.allocationSize)
      throw new TypeError(`Destination buffer too small. Required: ${r.allocationSize}, Available: ${s.byteLength}`);
    const n = Ze(this.format);
    let o;
    if (this._data instanceof we) {
      let c = this._data.getDataPlanes();
      if (be(c) && (c = await c), !Array.isArray(c) || c.some((d) => !(d.data instanceof Uint8Array) || !Number.isInteger(d.stride) || d.stride < 0))
        throw new TypeError('getDataPlanes() must return an array of objects with a Uint8Array "data" property and a non-negative integer "stride" property.');
      o = c;
    } else if (this._data instanceof Uint8Array)
      h(this._layout), h(this._layout.length === n.length), o = this._layout.map((c, d) => {
        const u = Math.ceil(this.codedHeight / n[d].heightDivisor);
        return {
          data: this._data.subarray(c.offset, c.offset + c.stride * u),
          stride: c.stride
        };
      });
    else {
      const d = this._data.getContext("2d");
      h(d);
      const u = d.getImageData(0, 0, this.codedWidth, this.codedHeight);
      o = [{
        data: K(u.data),
        stride: 4 * this.codedWidth
      }];
    }
    const a = [], l = n.length;
    for (let c = 0; c < l; c++) {
      const d = r.computedLayouts[c], u = o[c].stride, f = o[c].data;
      let m = d.sourceTop * u;
      m += d.sourceLeftBytes;
      let g = d.destinationOffset;
      const y = d.sourceWidthBytes, E = {
        offset: g,
        stride: d.destinationStride
      };
      for (let _ = 0; _ < d.sourceHeight; _++) {
        if (m + y > f.byteLength)
          throw new Error("Source buffer OOB read.");
        if (g + y > s.byteLength)
          throw new Error("Destination buffer OOB write.");
        const x = f.subarray(m, m + y);
        s.set(x, g), m += u, g += d.destinationStride;
      }
      a.push(E);
    }
    if (i.format !== void 0) {
      const c = this.format.startsWith("RGB") !== i.format.startsWith("RGB"), d = this.format.includes("X") && i.format.includes("A");
      if (c || d)
        for (let u = 0; u < r.allocationSize; u += 4) {
          if (c) {
            const f = s[u], m = s[u + 2];
            s[u] = m, s[u + 2] = f;
          }
          d && (s[u + 3] = 255);
        }
    }
    return a;
  }
  /**
   * Converts this video sample to a VideoFrame for use with the WebCodecs API. The VideoFrame returned by this
   * method *must* be closed separately from this video sample.
   */
  toVideoFrame() {
    if (this._closed)
      throw new Error("VideoSample is closed.");
    if (h(this._data !== null), this._data instanceof we) {
      if (this.format === null)
        throw new Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if format is null.");
      const e = this._data.getDataPlanes();
      if (be(e))
        throw new Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if getDataPlanes() returns a promise.");
      const i = e.reduce((o, a) => o + a.data.byteLength, 0), r = new Uint8Array(i);
      let s = 0;
      const n = [];
      for (const o of e)
        r.set(o.data, s), n.push(s), s += o.data.byteLength;
      return new VideoFrame(r, {
        format: this.format,
        layout: e.map((o, a) => ({
          offset: n[a],
          stride: o.stride
        })),
        codedWidth: this.codedWidth,
        codedHeight: this.codedHeight,
        timestamp: this.microsecondTimestamp,
        duration: this.microsecondDuration,
        colorSpace: this.colorSpace,
        visibleRect: this.visibleRect,
        displayWidth: this.squarePixelWidth,
        // Not display* since we're not passing rotation
        displayHeight: this.squarePixelHeight
      });
    } else return Ae(this._data) ? new VideoFrame(this._data, {
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration || void 0
      // Drag 0 duration to undefined, glitches some codecs
    }) : this._data instanceof Uint8Array ? (h(this._layout), new VideoFrame(this._data, {
      format: this.format,
      codedWidth: this.codedWidth,
      // This is technically wrong! codedWidth is a lie technically. But, since
      codedHeight: this.codedHeight,
      // we pass the layout (which contains the true coded width), we're good.
      layout: this._layout,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration || void 0,
      colorSpace: this.colorSpace,
      visibleRect: this.visibleRect,
      displayWidth: this.squarePixelWidth,
      // Not display* since we're not passing rotation
      displayHeight: this.squarePixelHeight
    })) : new VideoFrame(this._data, {
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration || void 0
    });
  }
  draw(e, i, r, s, n, o, a, l, c) {
    let d = 0, u = 0, f = this.displayWidth, m = this.displayHeight, g = 0, y = 0, E = this.displayWidth, _ = this.displayHeight;
    if (o !== void 0 ? (d = i, u = r, f = s, m = n, g = o, y = a, l !== void 0 ? (E = l, _ = c) : (E = f, _ = m)) : (g = i, y = r, s !== void 0 && (E = s, _ = n)), !(typeof CanvasRenderingContext2D < "u" && e instanceof CanvasRenderingContext2D || typeof OffscreenCanvasRenderingContext2D < "u" && e instanceof OffscreenCanvasRenderingContext2D))
      throw new TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
    if (!Number.isFinite(d))
      throw new TypeError("sx must be a number.");
    if (!Number.isFinite(u))
      throw new TypeError("sy must be a number.");
    if (!Number.isFinite(f) || f < 0)
      throw new TypeError("sWidth must be a non-negative number.");
    if (!Number.isFinite(m) || m < 0)
      throw new TypeError("sHeight must be a non-negative number.");
    if (!Number.isFinite(g))
      throw new TypeError("dx must be a number.");
    if (!Number.isFinite(y))
      throw new TypeError("dy must be a number.");
    if (!Number.isFinite(E) || E < 0)
      throw new TypeError("dWidth must be a non-negative number.");
    if (!Number.isFinite(_) || _ < 0)
      throw new TypeError("dHeight must be a non-negative number.");
    if (this._closed)
      throw new Error("VideoSample is closed.");
    ({ sx: d, sy: u, sWidth: f, sHeight: m } = this._unmapSourceRegion(d, u, f, m, this.rotation, this.flip));
    const x = this.toCanvasImageSource();
    e.save();
    const R = g + E / 2, M = y + _ / 2;
    e.translate(R, M), this.flip && e.scale(-1, 1), e.rotate(this.rotation * Math.PI / 180);
    const V = this.rotation % 180 === 0 ? 1 : E / _;
    e.scale(1 / V, V), e.drawImage(x, d, u, f, m, -E / 2, -_ / 2, E, _), e.restore();
  }
  /**
   * Draws the sample in the middle of the canvas corresponding to the context with the specified fit behavior.
   */
  drawWithFit(e, i) {
    if (!(typeof CanvasRenderingContext2D < "u" && e instanceof CanvasRenderingContext2D || typeof OffscreenCanvasRenderingContext2D < "u" && e instanceof OffscreenCanvasRenderingContext2D))
      throw new TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
    if (!i || typeof i != "object")
      throw new TypeError("options must be an object.");
    if (!["fill", "contain", "cover"].includes(i.fit))
      throw new TypeError("options.fit must be 'fill', 'contain', or 'cover'.");
    if (i.rotation !== void 0 && ![0, 90, 180, 270].includes(i.rotation))
      throw new TypeError("options.rotation, when provided, must be 0, 90, 180, or 270.");
    if (i.flip !== void 0 && typeof i.flip != "boolean")
      throw new TypeError("options.flip, when provided, must be a boolean.");
    i.crop !== void 0 && _t(i.crop, "options.");
    const r = e.canvas.width, s = e.canvas.height, n = i.rotation ?? this.rotation, o = i.flip ?? this.flip, [a, l] = n % 180 === 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth];
    let c = i.crop;
    c && (c = ri(c, a, l));
    let d, u, f, m;
    const { sx: g, sy: y, sWidth: E, sHeight: _ } = this._unmapSourceRegion(i.crop?.left ?? 0, i.crop?.top ?? 0, i.crop?.width ?? a, i.crop?.height ?? l, n, o);
    if (i.fit === "fill")
      d = 0, u = 0, f = r, m = s;
    else {
      const [R, M] = i.crop ? [i.crop.width, i.crop.height] : [a, l], V = i.fit === "contain" ? Math.min(r / R, s / M) : Math.max(r / R, s / M);
      f = R * V, m = M * V, d = (r - f) / 2, u = (s - m) / 2;
    }
    e.save();
    const x = n % 180 === 0 ? 1 : f / m;
    e.translate(r / 2, s / 2), o && e.scale(-1, 1), e.rotate(n * Math.PI / 180), e.scale(1 / x, x), e.translate(-r / 2, -s / 2), e.drawImage(this.toCanvasImageSource(), g, y, E, _, d, u, f, m), e.restore();
  }
  /** @internal */
  _unmapSourceRegion(e, i, r, s, n, o) {
    return o && (e = (n % 180 === 0 ? this.squarePixelWidth : this.squarePixelHeight) - e - r), n === 90 ? [e, i, r, s] = [
      i,
      this.squarePixelHeight - e - r,
      s,
      r
    ] : n === 180 ? [e, i] = [
      this.squarePixelWidth - e - r,
      this.squarePixelHeight - i - s
    ] : n === 270 && ([e, i, r, s] = [
      this.squarePixelWidth - i - s,
      e,
      s,
      r
    ]), { sx: e, sy: i, sWidth: r, sHeight: s };
  }
  /**
   * Draws the sample onto the target canvas with fit behavior, manually mipmapping on strong downscales for quality.
   * @internal
   */
  _drawWithFitAndMipmapping(e, i, r) {
    const s = e.width, n = e.height, [o, a] = r.rotation % 180 === 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth], l = r.crop ? r.crop.width : o, c = r.crop ? r.crop.height : a;
    let d = 0;
    2 * s < l && 2 * n < c && (d = Math.floor(Math.log2(Math.min(l / s, c / n))));
    const u = s * 2 ** d, f = n * 2 ** d, { canvas: m, context: g, isNew: y } = d > 0 ? ii(u, f) : { canvas: e, context: i, isNew: r.targetIsFresh };
    g.imageSmoothingQuality = "high", r.fillBlack ? (g.fillStyle = "black", g.fillRect(0, 0, u, f)) : y || g.clearRect(0, 0, u, f), this.drawWithFit(g, {
      fit: r.fit,
      rotation: r.rotation,
      flip: r.flip,
      crop: r.crop
    }), g.globalCompositeOperation = "copy";
    for (let E = d; E > 1; E--) {
      const _ = s * 2 ** E, x = n * 2 ** E;
      g.drawImage(m, 0, 0, _, x, 0, 0, _ / 2, x / 2);
    }
    g.globalCompositeOperation = "source-over", d > 0 && (i.imageSmoothingQuality = "high", i.globalCompositeOperation = "copy", i.drawImage(m, 0, 0, 2 * s, 2 * n, 0, 0, s, n), i.globalCompositeOperation = "source-over");
  }
  /**
   * Converts this video sample to a
   * [`CanvasImageSource`](https://udn.realityripple.com/docs/Web/API/CanvasImageSource) for drawing to a canvas.
   *
   * You must use the value returned by this method immediately, as any VideoFrame created internally may
   * automatically be closed in the next microtask.
   */
  toCanvasImageSource() {
    if (this._closed)
      throw new Error("VideoSample is closed.");
    if (h(this._data !== null), this._data instanceof we || this._data instanceof Uint8Array) {
      const e = this.toVideoFrame();
      return queueMicrotask(() => e.close()), e;
    } else
      return this._data;
  }
  /**
   * Transform this video sample to a new video sample given the options. Can be used to resize, rotate, flip, and
   * crop the sample.
   *
   * In non-browser environments, this method will not work by default. To make it work, register a custom
   * transformer function via {@link registerVideoSampleTransformer}.
   */
  async transform(e) {
    if (!e || typeof e != "object")
      throw new TypeError("options must be an object.");
    if (e.width !== void 0 && (!Number.isInteger(e.width) || e.width <= 0))
      throw new TypeError("options.width, when provided, must be a positive integer.");
    if (e.height !== void 0 && (!Number.isInteger(e.height) || e.height <= 0))
      throw new TypeError("options.height, when provided, must be a positive integer.");
    if (e.roundDimensionsTo !== void 0 && (!Number.isInteger(e.roundDimensionsTo) || e.roundDimensionsTo <= 0))
      throw new TypeError("options.roundDimensionsTo, when provided, must be a positive integer.");
    if (e.fit !== void 0 && !["fill", "contain", "cover"].includes(e.fit))
      throw new TypeError('options.fit, when provided, must be one of "fill", "contain", or "cover".');
    if (e.width !== void 0 && e.height !== void 0 && e.fit === void 0)
      throw new TypeError("When both options.width and options.height are provided, options.fit must also be provided.");
    if (e.rotate !== void 0 && ![0, 90, 180, 270].includes(e.rotate))
      throw new TypeError("options.rotate, when provided, must be 0, 90, 180 or 270.");
    if (e.flip !== void 0 && typeof e.flip != "boolean")
      throw new TypeError("options.flip, when provided, must be a boolean.");
    if (e.crop !== void 0 && _t(e.crop, "options."), e.alpha !== void 0 && !["keep", "discard"].includes(e.alpha))
      throw new TypeError("options.alpha, when provided, must be 'keep' or 'discard'.");
    const { rotation: i, flip: r } = ir(this.rotation, this.flip, e.rotate ?? 0, e.flip ?? !1), [s, n] = i % 180 === 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth];
    let o = e.crop;
    o && (o = ri(o, s, n));
    const a = o ? o.width : s, l = o ? o.height : n, c = a / l;
    let d, u;
    e.width !== void 0 && e.height === void 0 ? (d = e.width, u = d / c) : e.width === void 0 && e.height !== void 0 ? (u = e.height, d = u * c) : e.width !== void 0 && e.height !== void 0 ? (d = e.width, u = e.height) : (d = a, u = l), d = Wt(d, e.roundDimensionsTo ?? 1), u = Wt(u, e.roundDimensionsTo ?? 1);
    const f = {
      width: d,
      height: u,
      fit: e.fit ?? "fill",
      rotation: i,
      flip: r,
      crop: o ?? {
        left: 0,
        top: 0,
        width: s,
        height: n
      },
      alpha: e.alpha ?? "keep"
    };
    for (const E of Ms) {
      let _ = E(this, f);
      if (be(_) && (_ = await _), _ !== null)
        return _;
    }
    const { canvas: m, context: g, isNew: y } = ii(f.width, f.height);
    return this._drawWithFitAndMipmapping(m, g, {
      fit: f.fit,
      rotation: f.rotation,
      flip: f.flip,
      crop: f.crop,
      targetIsFresh: y,
      fillBlack: f.alpha === "discard"
    }), new W(m, {
      timestamp: this.timestamp,
      duration: this.duration,
      // Any previous rotation and flip are now baked in
      rotation: 0,
      flip: !1
    });
  }
  /** Sets the rotation metadata of this video sample. */
  setRotation(e) {
    if (![0, 90, 180, 270].includes(e))
      throw new TypeError("newRotation must be 0, 90, 180, or 270.");
    this.rotation = e;
  }
  /** Sets the flip metadata of this video sample. */
  setFlip(e) {
    if (typeof e != "boolean")
      throw new TypeError("newFlip must be a boolean.");
    this.flip = e;
  }
  /** Sets the presentation timestamp of this video sample, in seconds. */
  setTimestamp(e) {
    if (!Number.isFinite(e))
      throw new TypeError("newTimestamp must be a number.");
    this.timestamp = e;
  }
  /** Sets the duration of this video sample, in seconds. */
  setDuration(e) {
    if (!Number.isFinite(e) || e < 0)
      throw new TypeError("newDuration must be a non-negative number.");
    this.duration = e;
  }
  /** Sets the encode options used when this sample is passed to an encoder. */
  setEncodeOptions(e) {
    if (!e || typeof e != "object")
      throw new TypeError("newEncodeOptions must be an object.");
    this.encodeOptions = e;
  }
  /** Calls `.close()`. */
  [Symbol.dispose]() {
    this.close();
  }
}
const Ms = [], Fs = 3, ke = [];
let ti = 0;
const ii = (t, e) => {
  for (const s of ke)
    if (s.canvas.width === t && s.canvas.height === e)
      return s.age = ti++, { canvas: s.canvas, context: s.context, isNew: !1 };
  let i;
  if (typeof OffscreenCanvas < "u")
    i = new OffscreenCanvas(t, e);
  else {
    if (typeof window > "u" || typeof document > "u")
      throw new Error("Cannot transform VideoSamples in this environment. Either run in an environment with OffscreenCanvas or HTMLCanvasElement, or supply a custom VideoSample transformer using registerVideoSampleTransformer().");
    i = document.createElement("canvas"), i.width = t, i.height = e;
  }
  const r = i.getContext("2d", {
    alpha: !0,
    willReadFrequently: !1
  });
  if (!r)
    throw new Error("The '2d' canvas context is required to transform VideoSamples. Register a custom transformer using registerVideoSampleTransformer to work around this limitation.");
  return ke.length >= Fs && ke.splice(_r(ke, (s) => s.age), 1), ke.push({
    canvas: i,
    context: r,
    age: ti++
  }), { canvas: i, context: r, isNew: !0 };
};
class nt {
  /** Creates a new VideoSampleColorSpace. */
  constructor(e) {
    if (e !== void 0) {
      if (!e || typeof e != "object")
        throw new TypeError("init.colorSpace, when provided, must be an object.");
      const i = Object.keys(Qe);
      if (e.primaries != null && !i.includes(e.primaries))
        throw new TypeError(`init.colorSpace.primaries, when provided, must be one of ${i.join(", ")}.`);
      const r = Object.keys(Xe);
      if (e.transfer != null && !r.includes(e.transfer))
        throw new TypeError(`init.colorSpace.transfer, when provided, must be one of ${r.join(", ")}.`);
      const s = Object.keys(Ke);
      if (e.matrix != null && !s.includes(e.matrix))
        throw new TypeError(`init.colorSpace.matrix, when provided, must be one of ${s.join(", ")}.`);
      if (e.fullRange != null && typeof e.fullRange != "boolean")
        throw new TypeError("init.colorSpace.fullRange, when provided, must be a boolean.");
    }
    this.primaries = e?.primaries ?? null, this.transfer = e?.transfer ?? null, this.matrix = e?.matrix ?? null, this.fullRange = e?.fullRange ?? null;
  }
  /** Serializes the color space to a JSON object. */
  toJSON() {
    return {
      primaries: this.primaries,
      transfer: this.transfer,
      matrix: this.matrix,
      fullRange: this.fullRange
    };
  }
}
const Ae = (t) => typeof VideoFrame < "u" && t instanceof VideoFrame, ri = (t, e, i) => {
  const r = Math.min(t.left, e), s = Math.min(t.top, i), n = Math.min(t.width, e - r), o = Math.min(t.height, i - s);
  return h(n >= 0), h(o >= 0), { left: r, top: s, width: n, height: o };
}, _t = (t, e) => {
  if (!t || typeof t != "object")
    throw new TypeError(e + "crop, when provided, must be an object.");
  if (!Number.isInteger(t.left) || t.left < 0)
    throw new TypeError(e + "crop.left must be a non-negative integer.");
  if (!Number.isInteger(t.top) || t.top < 0)
    throw new TypeError(e + "crop.top must be a non-negative integer.");
  if (!Number.isInteger(t.width) || t.width < 0)
    throw new TypeError(e + "crop.width must be a non-negative integer.");
  if (!Number.isInteger(t.height) || t.height < 0)
    throw new TypeError(e + "crop.height must be a non-negative integer.");
}, si = (t) => {
  if (!t || typeof t != "object")
    throw new TypeError("options must be an object.");
  if (t.colorSpace !== void 0 && !["display-p3", "srgb"].includes(t.colorSpace))
    throw new TypeError("options.colorSpace, when provided, must be 'display-p3' or 'srgb'.");
  if (t.format !== void 0 && typeof t.format != "string")
    throw new TypeError("options.format, when provided, must be a string.");
  if (t.layout !== void 0) {
    if (!Array.isArray(t.layout))
      throw new TypeError("options.layout, when provided, must be an array.");
    for (const e of t.layout) {
      if (!e || typeof e != "object")
        throw new TypeError("Each entry in options.layout must be an object.");
      if (!Number.isInteger(e.offset) || e.offset < 0)
        throw new TypeError("plane.offset must be a non-negative integer.");
      if (!Number.isInteger(e.stride) || e.stride < 0)
        throw new TypeError("plane.stride must be a non-negative integer.");
    }
  }
  if (t.rect !== void 0) {
    if (!t.rect || typeof t.rect != "object")
      throw new TypeError("options.rect, when provided, must be an object.");
    if (t.rect.x !== void 0 && (!Number.isInteger(t.rect.x) || t.rect.x < 0))
      throw new TypeError("options.rect.x, when provided, must be a non-negative integer.");
    if (t.rect.y !== void 0 && (!Number.isInteger(t.rect.y) || t.rect.y < 0))
      throw new TypeError("options.rect.y, when provided, must be a non-negative integer.");
    if (t.rect.width !== void 0 && (!Number.isInteger(t.rect.width) || t.rect.width < 0))
      throw new TypeError("options.rect.width, when provided, must be a non-negative integer.");
    if (t.rect.height !== void 0 && (!Number.isInteger(t.rect.height) || t.rect.height < 0))
      throw new TypeError("options.rect.height, when provided, must be a non-negative integer.");
  }
}, Os = (t, e, i) => {
  const r = Ze(t), s = [];
  let n = 0;
  for (const o of r) {
    const a = Math.ceil(e / o.widthDivisor), l = Math.ceil(i / o.heightDivisor), c = a * o.sampleBytes, d = c * l;
    s.push({
      offset: n,
      stride: c
    }), n += d;
  }
  return s;
}, Ze = (t) => {
  const e = (i, r, s, n, o) => {
    const a = [
      { sampleBytes: i, widthDivisor: 1, heightDivisor: 1 },
      { sampleBytes: r, widthDivisor: s, heightDivisor: n },
      { sampleBytes: r, widthDivisor: s, heightDivisor: n }
    ];
    return o && a.push({ sampleBytes: i, widthDivisor: 1, heightDivisor: 1 }), a;
  };
  switch (t) {
    case "I420":
      return e(1, 1, 2, 2, !1);
    case "I420P10":
    case "I420P12":
      return e(2, 2, 2, 2, !1);
    case "I420A":
      return e(1, 1, 2, 2, !0);
    case "I420AP10":
    case "I420AP12":
      return e(2, 2, 2, 2, !0);
    case "I422":
      return e(1, 1, 2, 1, !1);
    case "I422P10":
    case "I422P12":
      return e(2, 2, 2, 1, !1);
    case "I422A":
      return e(1, 1, 2, 1, !0);
    case "I422AP10":
    case "I422AP12":
      return e(2, 2, 2, 1, !0);
    case "I444":
      return e(1, 1, 1, 1, !1);
    case "I444P10":
    case "I444P12":
      return e(2, 2, 1, 1, !1);
    case "I444A":
      return e(1, 1, 1, 1, !0);
    case "I444AP10":
    case "I444AP12":
      return e(2, 2, 1, 1, !0);
    case "NV12":
      return [
        { sampleBytes: 1, widthDivisor: 1, heightDivisor: 1 },
        { sampleBytes: 2, widthDivisor: 2, heightDivisor: 2 }
        // Interleaved U and V
      ];
    case "RGBA":
    case "RGBX":
    case "BGRA":
    case "BGRX":
      return [
        { sampleBytes: 4, widthDivisor: 1, heightDivisor: 1 }
      ];
    default:
      Be(t), h(!1);
  }
}, ni = (t, e) => {
  const i = {
    left: 0,
    top: 0,
    width: t.codedWidth,
    height: t.codedHeight
  }, r = e.rect, s = Ws(i, r, t.codedWidth, t.codedHeight, t.format), n = e.layout;
  let o;
  if (!e.format || e.format === t.format)
    o = t.format;
  else if (["RGBA", "RGBX", "BGRA", "BGRX"].includes(e.format))
    o = e.format;
  else
    throw new Error("NotSupportedError: Invalid destination format.");
  return Vs(s, o, n);
}, Ws = (t, e, i, r, s) => {
  const n = { ...t };
  if (e !== void 0) {
    if (e.width === 0 || e.height === 0)
      throw new TypeError("visibleRect dimensions cannot be zero.");
    if ((e.x || 0) + (e.width || 0) > i)
      throw new TypeError("visibleRect exceeds codedWidth.");
    if ((e.y || 0) + (e.height || 0) > r)
      throw new TypeError("visibleRect exceeds codedHeight.");
    n.x = e.x || 0, n.y = e.y || 0, n.width = e.width || 0, n.height = e.height || 0;
  }
  if (!zs(s, n))
    throw new TypeError("visibleRect alignment is invalid for the format.");
  return n;
}, zs = (t, e) => {
  if (t === null)
    return !0;
  const i = Ze(t);
  for (let r = 0; r < i.length; r++) {
    const s = i[r], n = s.widthDivisor, o = s.heightDivisor;
    if ((e.x || 0) % n !== 0 || (e.y || 0) % o !== 0)
      return !1;
  }
  return !0;
}, Vs = (t, e, i) => {
  const r = Ze(e), s = r.length;
  if (i !== void 0 && i.length !== s)
    throw new TypeError(`Layout must have ${s} planes.`);
  let n = 0;
  const o = [], a = [];
  for (let l = 0; l < s; l++) {
    const c = r[l], d = c.sampleBytes, u = c.widthDivisor, f = c.heightDivisor, m = {
      destinationOffset: 0,
      destinationStride: 0,
      sourceTop: 0,
      sourceHeight: 0,
      sourceLeftBytes: 0,
      sourceWidthBytes: 0
    };
    if (m.sourceTop = Math.ceil(Math.trunc(t.y || 0) / f), m.sourceHeight = Math.ceil(Math.trunc(t.height || 0) / f), m.sourceLeftBytes = Math.floor(Math.trunc(t.x || 0) / u) * d, m.sourceWidthBytes = Math.floor(Math.trunc(t.width || 0) / u) * d, i !== void 0) {
      const E = i[l];
      if (E.stride < m.sourceWidthBytes)
        throw new TypeError(`Stride for plane ${l} is too small.`);
      m.destinationOffset = E.offset, m.destinationStride = E.stride;
    } else
      m.destinationOffset = n, m.destinationStride = m.sourceWidthBytes;
    const y = m.destinationStride * m.sourceHeight + m.destinationOffset;
    if (y > 4294967295)
      throw new TypeError("Allocation size exceeds limit.");
    a.push(y), n = Math.max(n, y);
    for (let E = 0; E < l; E++) {
      const _ = o[E];
      if (!(a[l] <= _.destinationOffset || a[E] <= m.destinationOffset))
        throw new TypeError("Planes overlap.");
    }
    o.push(m);
  }
  return {
    allocationSize: n,
    computedLayouts: o
  };
};
const oi = /* @__PURE__ */ new Map(), Ls = (t) => {
  if (!t || typeof t != "object")
    throw new TypeError("Encoding config must be an object.");
  if (!le.includes(t.codec))
    throw new TypeError(`Invalid video codec '${t.codec}'. Must be one of: ${le.join(", ")}.`);
  const e = t.bitrate;
  if (t.quality === void 0 && e === void 0)
    throw new TypeError("config.quality must be provided.");
  if (t.quality !== void 0 && e !== void 0)
    throw new TypeError("config.quality and config.bitrate cannot both be provided.");
  if (t.quality !== void 0 && !(t.quality instanceof he))
    throw new TypeError("config.quality, when provided, must be a Quality.");
  if (e !== void 0 && !(e instanceof he) && (!Number.isInteger(e) || e <= 0))
    throw new TypeError("config.bitrate, when provided, must be a positive integer or a quality.");
  if (t.keyFrameInterval !== void 0 && (!Number.isFinite(t.keyFrameInterval) || t.keyFrameInterval < 0))
    throw new TypeError("config.keyFrameInterval, when provided, must be a non-negative number.");
  if (t.sizeChangeBehavior !== void 0 && !["deny", "passThrough", "fill", "contain", "cover"].includes(t.sizeChangeBehavior))
    throw new TypeError("config.sizeChangeBehavior, when provided, must be 'deny', 'passThrough', 'fill', 'contain' or 'cover'.");
  if (t.transform !== void 0) {
    if (typeof t.transform != "object" || !t.transform)
      throw new TypeError("config.transform, when provided, must be an object.");
    if (t.transform.width !== void 0 && (!Number.isInteger(t.transform.width) || t.transform.width <= 0))
      throw new TypeError("config.transform.width, when provided, must be a positive integer.");
    if (t.transform.height !== void 0 && (!Number.isInteger(t.transform.height) || t.transform.height <= 0))
      throw new TypeError("config.transform.height, when provided, must be a positive integer.");
    if (t.transform.fit !== void 0 && !["fill", "contain", "cover"].includes(t.transform.fit))
      throw new TypeError('config.transform.fit, when provided, must be one of "fill", "contain", or "cover".');
    if (t.transform.width !== void 0 && t.transform.height !== void 0 && t.transform.fit === void 0 && !["fill", "contain", "cover"].includes(t.sizeChangeBehavior))
      throw new TypeError("When both config.transform.width and config.transform.height are provided, config.transform.fit must also be provided.");
    if (t.transform.fit !== void 0 && ["fill", "contain", "cover"].includes(t.sizeChangeBehavior) && t.transform.fit !== t.sizeChangeBehavior)
      throw new TypeError("config.transform.fit, when provided, cannot differ from config.sizeChangeBehavior when config.sizeChangeBehavior is 'fill', 'contain' or 'cover', as sizeChangeBehavior already determines the fitting algorithm.");
    if (t.transform.rotate !== void 0 && ![0, 90, 180, 270].includes(t.transform.rotate))
      throw new TypeError("config.transform.rotate, when provided, must be 0, 90, 180 or 270.");
    if (t.transform.flip !== void 0 && typeof t.transform.flip != "boolean")
      throw new TypeError("config.transform.flip, when provided, must be a boolean.");
    if (t.transform.crop !== void 0 && _t(t.transform.crop, "config.transform."), t.transform.process !== void 0 && typeof t.transform.process != "function")
      throw new TypeError("config.transform.process, when provided, must be a function.");
    if (t.transform.frameRate !== void 0 && (!Number.isFinite(t.transform.frameRate) || t.transform.frameRate <= 0))
      throw new TypeError("config.transform.frameRate, when provided, must be a finite positive number.");
    if (t.transform.force !== void 0 && typeof t.transform.force != "boolean")
      throw new TypeError("config.transform.force, when provided, must be a boolean.");
  }
  if (t.onEncodedPacket !== void 0 && typeof t.onEncodedPacket != "function")
    throw new TypeError("config.onEncodedPacket, when provided, must be a function.");
  if (t.onEncoderConfig !== void 0 && typeof t.onEncoderConfig != "function")
    throw new TypeError("config.onEncoderConfig, when provided, must be a function.");
  if (t.onEncodedSample !== void 0 && typeof t.onEncodedSample != "function")
    throw new TypeError("config.onEncodedSample, when provided, must be a function.");
  Oi(t.codec, t);
}, Oi = (t, e) => {
  if (!e || typeof e != "object")
    throw new TypeError("Encoding options must be an object.");
  if (e.alpha !== void 0 && !["discard", "keep"].includes(e.alpha))
    throw new TypeError("options.alpha, when provided, must be 'discard' or 'keep'.");
  const i = e.bitrateMode;
  if (i !== void 0 && !["constant", "variable"].includes(i))
    throw new TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");
  if (e.latencyMode !== void 0 && !["quality", "realtime"].includes(e.latencyMode))
    throw new TypeError("latencyMode, when provided, must be 'quality' or 'realtime'.");
  if (e.fullCodecString !== void 0 && typeof e.fullCodecString != "string")
    throw new TypeError("fullCodecString, when provided, must be a string.");
  if (e.fullCodecString !== void 0 && Bt(e.fullCodecString) !== t)
    throw new TypeError(`fullCodecString, when provided, must be a string that matches the specified codec (${t}).`);
  if (e.hardwareAcceleration !== void 0 && !["no-preference", "prefer-hardware", "prefer-software"].includes(e.hardwareAcceleration))
    throw new TypeError("hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");
  if (e.scalabilityMode !== void 0 && typeof e.scalabilityMode != "string")
    throw new TypeError("scalabilityMode, when provided, must be a string.");
  if (e.contentHint !== void 0 && typeof e.contentHint != "string")
    throw new TypeError("contentHint, when provided, must be a string.");
}, Wi = (t) => {
  const e = t.bitrateMode, i = t.quality._toVideoRateControl(t.codec, t.width, t.height, e), r = (n, o, a) => ({
    codec: t.fullCodecString ?? ws(t.codec, t.width, t.height, a, t.alpha === "keep"),
    width: t.width,
    height: t.height,
    displayWidth: t.squarePixelWidth,
    displayHeight: t.squarePixelHeight,
    bitrate: n,
    bitrateMode: o,
    alpha: t.alpha ?? "discard",
    framerate: t.framerate,
    latencyMode: t.latencyMode,
    hardwareAcceleration: t.hardwareAcceleration,
    scalabilityMode: t.scalabilityMode,
    contentHint: t.contentHint,
    ...bs(t.codec)
  }), s = [];
  return i.quantizer !== null && s.push({
    config: r(void 0, "quantizer", i.bitrate),
    quantizer: i.quantizer
  }), i.bitrateMode !== "quantizer" && s.push({
    config: r(i.bitrate, i.bitrateMode, i.bitrate),
    quantizer: null
  }), h(s.length > 0), s;
};
class he {
  constructor(e) {
    if ((typeof e == "number" || typeof e == "string") && (e = { quality: e }), !e || typeof e != "object")
      throw new TypeError("options must be an object.");
    if (e.bitrateMode !== void 0 && !["constant", "variable"].includes(e.bitrateMode))
      throw new TypeError("options.bitrateMode, when provided, must be 'constant' or 'variable'.");
    if ("quality" in e) {
      if (typeof e.quality == "string" ? !(e.quality in ai) : typeof e.quality != "number" || Number.isNaN(e.quality))
        throw new TypeError("options.quality must be a number, or one of 'very-low', 'low', 'medium', 'high' or 'very-high'.");
      if (e.preferBitrate !== void 0 && typeof e.preferBitrate != "boolean")
        throw new TypeError("options.preferBitrate, when provided, must be a boolean.");
      if ("bitrate" in e || "quantizer" in e)
        throw new TypeError("options.quality cannot be combined with options.bitrate or options.quantizer.");
      this._quality = typeof e.quality == "string" ? ai[e.quality] : e.quality, this._preferBitrate = e.preferBitrate ?? !1, this._bitrate = void 0, this._quantizer = void 0;
    } else {
      if (e.bitrate !== void 0 && (!Number.isInteger(e.bitrate) || e.bitrate <= 0))
        throw new TypeError("options.bitrate, when provided, must be a positive integer.");
      if (e.quantizer !== void 0 && (!Number.isInteger(e.quantizer) || e.quantizer < 0))
        throw new TypeError("options.quantizer, when provided, must be a non-negative integer.");
      if (e.bitrate === void 0 && e.quantizer === void 0)
        throw new TypeError("At least one of options.bitrate or options.quantizer must be set.");
      if ("preferBitrate" in e)
        throw new TypeError("options.preferBitrate can only be combined with options.quality.");
      this._quality = void 0, this._preferBitrate = !1, this._bitrate = e.bitrate, this._quantizer = e.quantizer;
    }
    this._bitrateMode = e.bitrateMode;
  }
  /**
   * Determines the rate control methods usable for the given codec.
   * @internal
   */
  _toVideoRateControl(e, i, r, s) {
    const n = Ns[e];
    let o = null, a = this._bitrateMode ?? s ?? "variable";
    if (this._quantizer !== void 0) {
      if (n)
        if (this._quantizer < n.min || this._quantizer > n.max) {
          if (this._bitrate === void 0)
            throw new Error(`Quantizer ${this._quantizer} is out of range for codec '${e}'; must be between ${n.min} and ${n.max}.`);
        } else
          o = this._quantizer, this._bitrate === void 0 && (a = "quantizer");
      else if (this._bitrate === void 0)
        throw new Error(`Codec '${e}' does not support quantizer-based encoding. Provide a bitrate in the Quality to define a fallback.`);
    } else this._bitrate === void 0 && n && !this._preferBitrate && (h(this._quality !== void 0), o = Ot(Math.round(cr(n.worst, n.best, this._quality)), n.min, n.max));
    let l;
    if (this._bitrate !== void 0)
      l = this._bitrate;
    else {
      let c = this._quality;
      c === void 0 && (h(o !== null && n), c = Ot((o - n.worst) / (n.best - n.worst), 0, 1)), l = ci(e, i, r, ot(c));
    }
    return { quantizer: o, bitrate: l, bitrateMode: a };
  }
  /** @internal */
  _toVideoBitrate(e, i, r) {
    return this._bitrate !== void 0 ? this._bitrate : (h(this._quality !== void 0), ci(e, i, r, ot(this._quality)));
  }
  /** @internal */
  _toAudioBitrate(e) {
    if (Te.includes(e) || e === "flac")
      return;
    if (this._bitrate !== void 0)
      return this._bitrate;
    if (this._quality === void 0)
      throw new Error("This Quality defines neither a quality level nor a bitrate and therefore cannot be used for audio encoding.");
    const i = ot(this._quality), s = {
      aac: 128e3,
      // 128kbps base for AAC
      opus: 64e3,
      // 64kbps base for Opus
      mp3: 16e4,
      // 160kbps base for MP3
      vorbis: 64e3,
      // 64kbps base for Vorbis
      ac3: 384e3,
      // 384kbps base for AC-3
      eac3: 192e3,
      // 192kbps base for E-AC-3
      dts: 768e3
      // 768kbps base for DTS
    }[e];
    if (!s)
      throw new Error(`Unhandled codec: ${e}`);
    let n = s * i;
    return e === "aac" ? n = [96e3, 128e3, 16e4, 192e3].reduce((a, l) => Math.abs(l - n) < Math.abs(a - n) ? l : a) : e === "opus" || e === "vorbis" ? n = Math.max(6e3, n) : e === "mp3" && (n = [
      8e3,
      16e3,
      24e3,
      32e3,
      4e4,
      48e3,
      64e3,
      8e4,
      96e3,
      112e3,
      128e3,
      16e4,
      192e3,
      224e3,
      256e3,
      32e4
    ].reduce((a, l) => Math.abs(l - n) < Math.abs(a - n) ? l : a)), Math.round(n / 1e3) * 1e3;
  }
}
const ai = {
  "very-low": 0,
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  "very-high": 1
}, Ns = {
  avc: { min: 0, max: 51, worst: 41, best: 16 },
  hevc: { min: 0, max: 51, worst: 41, best: 16 },
  vp9: { min: 0, max: 63, worst: 52, best: 20 },
  av1: { min: 0, max: 255, worst: 208, best: 80 }
}, ot = (t) => 0.3 * Math.exp(2.5538 * t), ci = (t, e, i, r) => {
  const s = e * i, n = 1920 * 1080, o = 3e6, a = Math.pow(s / n, 0.95), l = o * a, c = {
    avc: 1,
    // H.264/AVC (baseline)
    hevc: 0.6,
    // H.265/HEVC (~40% more efficient than AVC)
    vp9: 0.6,
    // Similar to HEVC
    av1: 0.4,
    // ~60% more efficient than AVC
    vp8: 1.2,
    // Slightly less efficient than AVC
    prores: 22e7 / o
    // Apple ProRes white paper claims 220 Mbps for 1080p 422 HQ @30Hz
  }, u = l * c[t] * r;
  return Math.ceil(u / 1e3) * 1e3;
}, zi = (t, e) => {
  if (t === "avc")
    return { avc: { quantizer: e } };
  if (t === "hevc")
    return { hevc: { quantizer: e } };
  if (t === "vp9")
    return { vp9: { quantizer: e } };
  if (t === "av1")
    return { av1: { quantizer: e } };
  h(!1);
}, Hs = async (t, e = {}) => {
  const {
    width: i = 1280,
    height: r = 720,
    quality: s,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    bitrate: n,
    frameRate: o,
    ...a
  } = e;
  if (!le.includes(t))
    return !1;
  if (!Number.isInteger(i) || i <= 0)
    throw new TypeError("width must be a positive integer.");
  if (!Number.isInteger(r) || r <= 0)
    throw new TypeError("height must be a positive integer.");
  if (s !== void 0 && !(s instanceof he))
    throw new TypeError("quality, when provided, must be a Quality.");
  if (s !== void 0 && n !== void 0)
    throw new TypeError("quality and bitrate cannot both be provided.");
  if (n !== void 0 && !(n instanceof he) && (!Number.isInteger(n) || n <= 0))
    throw new TypeError("bitrate must be a positive integer or a quality.");
  if (o !== void 0 && (!Number.isFinite(o) || o <= 0))
    throw new TypeError("frameRate, when provided, must be a finite positive number.");
  Oi(t, a);
  const l = Vi(s, n) ?? new he("medium");
  let c;
  try {
    c = Wi({
      codec: t,
      width: i,
      height: r,
      quality: l,
      framerate: o,
      ...a,
      alpha: "discard"
      // Since we handle alpha ourselves
    });
  } catch {
    return !1;
  }
  const d = JSON.stringify(c), u = oi.get(d);
  if (u)
    return u;
  const f = (async () => {
    for (const { config: g } of c)
      if (Li.some((y) => y.supports(t, g)))
        return !0;
    if (typeof VideoEncoder > "u" || (i % 2 === 1 || r % 2 === 1) && t === "avc")
      return !1;
    for (const { config: g, quantizer: y } of c) {
      try {
        if (!(await VideoEncoder.isConfigSupported(g)).supported)
          continue;
      } catch {
        continue;
      }
      if (!vi() || await new Promise(async (_) => {
        try {
          const x = new VideoEncoder({
            output: () => {
            },
            error: () => _(!1)
          });
          x.configure(g);
          const R = new Uint8Array(i * r * 4), M = new VideoFrame(R, {
            format: "RGBA",
            codedWidth: i,
            codedHeight: r,
            timestamp: 0
          });
          x.encode(M, y !== null ? zi(t, y) : void 0), M.close(), await x.flush(), _(!0);
        } catch {
          _(!1);
        }
      }))
        return !0;
    }
    return !1;
  })();
  return oi.set(d, f), f;
}, Vi = (t, e) => {
  if (t !== void 0)
    return t;
  if (e !== void 0)
    return e instanceof he ? e : new he({ bitrate: e });
};
const Li = [];
class We {
  constructor(e, i, r, s, n) {
    this.bytes = e, this.view = i, this.offset = r, this.start = s, this.end = n, this.bufferPos = s - r;
  }
  static tempFromBytes(e) {
    return new We(e, Ge(e), 0, 0, e.length);
  }
  get length() {
    return this.end - this.start;
  }
  get filePos() {
    return this.offset + this.bufferPos;
  }
  set filePos(e) {
    this.bufferPos = e - this.offset;
  }
  /** The number of bytes left from the current pos to the end of the slice. */
  get remainingLength() {
    return Math.max(this.end - this.filePos, 0);
  }
  skip(e) {
    this.bufferPos += e;
  }
  /** Creates a new subslice of this slice whose byte range must be contained within this slice. */
  slice(e, i = this.end - e) {
    if (e < this.start || e + i > this.end)
      throw new RangeError("Slicing outside of original slice.");
    return new We(this.bytes, this.view, this.offset, e, e + i);
  }
}
const Us = (t, e) => {
  if (t.filePos < t.start || t.filePos + e > t.end)
    throw new RangeError(`Tried reading [${t.filePos}, ${t.filePos + e}), but slice is [${t.start}, ${t.end}). This is likely an internal error, please report it alongside the file that caused it.`);
}, qs = (t, e) => {
  Us(t, e);
  const i = t.bytes.subarray(t.bufferPos, t.bufferPos + e);
  return t.bufferPos += e, i;
};
class js {
  constructor(e) {
    this.mutex = new Ei(), this.trackTimestampInfo = /* @__PURE__ */ new WeakMap(), this.output = e;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTrackClose(e) {
  }
  validateTimestamp(e, i, r) {
    let s = this.trackTimestampInfo.get(e);
    if (s) {
      if (r && (s.maxTimestampBeforeLastKeyPacket = s.maxTimestamp), s.maxTimestampBeforeLastKeyPacket !== null && i < s.maxTimestampBeforeLastKeyPacket)
        throw new Error(`Timestamps cannot be smaller than the largest timestamp of the previous GOP (a GOP begins with a key packet and ends right before the next key packet). Got ${i}s, but largest timestamp is ${s.maxTimestampBeforeLastKeyPacket}s.`);
      s.maxTimestamp = Math.max(s.maxTimestamp, i);
    } else {
      if (!r)
        throw new Error("First packet must be a key packet.");
      s = {
        maxTimestamp: i,
        maxTimestampBeforeLastKeyPacket: null
      }, this.trackTimestampInfo.set(e, s);
    }
  }
}
const di = /<(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})>/g, $s = (t) => {
  const e = Math.floor(t / 36e5), i = Math.floor(t % (3600 * 1e3) / (60 * 1e3)), r = Math.floor(t % (60 * 1e3) / 1e3), s = t % 1e3;
  return e.toString().padStart(2, "0") + ":" + i.toString().padStart(2, "0") + ":" + r.toString().padStart(2, "0") + "." + s.toString().padStart(3, "0");
};
class He {
  constructor(e) {
    this.writer = e, this.helper = new Uint8Array(8), this.helperView = new DataView(this.helper.buffer), this.offsets = /* @__PURE__ */ new WeakMap();
  }
  writeU32(e) {
    this.helperView.setUint32(0, e, !1), this.writer.write(this.helper.subarray(0, 4));
  }
  writeU64(e) {
    this.helperView.setUint32(0, Math.floor(e / 2 ** 32), !1), this.helperView.setUint32(4, e, !1), this.writer.write(this.helper.subarray(0, 8));
  }
  writeAscii(e) {
    for (let i = 0; i < e.length; i++)
      this.helperView.setUint8(i % 8, e.charCodeAt(i)), i % 8 === 7 && this.writer.write(this.helper);
    e.length % 8 !== 0 && this.writer.write(this.helper.subarray(0, e.length % 8));
  }
  writeBox(e) {
    if (this.offsets.set(e, this.writer.getPos()), e.contents && !e.children)
      this.writeBoxHeader(e, e.size ?? e.contents.byteLength + 8), this.writer.write(e.contents);
    else {
      const i = this.writer.getPos();
      if (this.writeBoxHeader(e, 0), e.contents && this.writer.write(e.contents), e.children)
        for (const n of e.children)
          n && this.writeBox(n);
      const r = this.writer.getPos(), s = e.size ?? r - i;
      this.writer.seek(i), this.writeBoxHeader(e, s), this.writer.seek(r);
    }
  }
  writeBoxHeader(e, i) {
    this.writeU32(e.largeSize ? 1 : i), this.writeAscii(e.type), e.largeSize && this.writeU64(i);
  }
  measureBoxHeader(e) {
    return 8 + (e.largeSize ? 8 : 0);
  }
  patchBox(e) {
    const i = this.offsets.get(e);
    h(i !== void 0);
    const r = this.writer.getPos();
    this.writer.seek(i), this.writeBox(e), this.writer.seek(r);
  }
  measureBox(e) {
    if (e.contents && !e.children)
      return this.measureBoxHeader(e) + e.contents.byteLength;
    {
      let i = this.measureBoxHeader(e);
      if (e.contents && (i += e.contents.byteLength), e.children)
        for (const r of e.children)
          r && (i += this.measureBox(r));
      return i;
    }
  }
}
const v = /* @__PURE__ */ new Uint8Array(8), H = /* @__PURE__ */ new DataView(v.buffer), P = (t) => [(t % 256 + 256) % 256], T = (t) => (H.setUint16(0, t, !1), [v[0], v[1]]), Pt = (t) => (H.setInt16(0, t, !1), [v[0], v[1]]), Ni = (t) => (H.setUint32(0, t, !1), [v[1], v[2], v[3]]), p = (t) => (H.setUint32(0, t, !1), [v[0], v[1], v[2], v[3]]), ie = (t) => (H.setInt32(0, t, !1), [v[0], v[1], v[2], v[3]]), Y = (t) => (H.setUint32(0, Math.floor(t / 2 ** 32), !1), H.setUint32(4, t, !1), [v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7]]), li = (t) => (H.setInt32(0, Math.floor(t / 2 ** 32), !1), H.setUint32(4, t, !1), [v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7]]), Hi = (t) => (H.setInt16(0, 2 ** 8 * t, !1), [v[0], v[1]]), N = (t) => (H.setInt32(0, 2 ** 16 * t, !1), [v[0], v[1], v[2], v[3]]), at = (t) => (H.setInt32(0, 2 ** 30 * t, !1), [v[0], v[1], v[2], v[3]]), ct = (t, e) => {
  const i = [];
  let r = t;
  do {
    let s = r & 127;
    r >>= 7, i.length > 0 && (s |= 128), i.push(s);
  } while (r > 0 || e);
  return i.reverse();
}, S = (t, e = !1) => {
  const i = Array(t.length).fill(null).map((r, s) => t.charCodeAt(s));
  return e && i.push(0), i;
}, Ui = (t) => [
  N(t[0]),
  N(t[1]),
  at(t[2]),
  N(t[3]),
  N(t[4]),
  at(t[5]),
  N(t[6]),
  N(t[7]),
  at(t[8])
], b = (t, e, i) => ({
  type: t,
  contents: e && new Uint8Array(e.flat(10)),
  children: i
}), C = (t, e, i, r, s) => b(t, [P(e), Ni(i), r ?? []], s), Ds = (t) => t.isQuickTime ? b("ftyp", [
  S("qt  "),
  // Major brand
  p(512),
  // Minor version
  // Compatible brands
  S("qt  ")
]) : t.fragmented ? t.cmaf ? b("ftyp", [
  S("iso5"),
  // Major brand
  p(512),
  // Minor version
  // Compatible brands
  S("iso5"),
  S("iso6"),
  S("mp41"),
  S("cmfc"),
  S("dash")
]) : b("ftyp", [
  S("iso5"),
  // Major brand
  p(512),
  // Minor version
  // Compatible brands
  S("iso5"),
  S("iso6"),
  S("mp41")
]) : b("ftyp", [
  S("isom"),
  // Major brand
  p(512),
  // Minor version
  // Compatible brands
  S("isom"),
  t.holdsAvc ? S("avc1") : [],
  S("mp41")
]), ui = () => b("styp", [
  S("iso5"),
  // Major brand
  p(0),
  // Minor version
  // Compatible brands
  S("iso5"),
  S("iso6"),
  S("mp41"),
  S("cmfc"),
  S("dash")
]), fi = (t, e) => {
  const i = Math.max(0, t.minWrittenTimestamp);
  let r = Math.max(0, t.maxWrittenEndTimestamp - i);
  return Number.isFinite(r) || (r = 0), C("sidx", 1, 0, [
    p(1),
    // Reference ID
    p(z),
    // Timescale
    Y(B(i, z)),
    // Earliest presentation time
    Y(0),
    // First offset
    T(0),
    // Reserved
    T(1),
    // Reference count
    p(e & 2147483647),
    // Reference type (0) + referenced size
    p(B(r, z)),
    // Subsegment duration
    p(0)
    // Starts with SAP + SAP type + SAP delta time (no information provided)
  ]);
}, Ue = (t) => ({ type: "mdat", largeSize: t }), Gs = (t) => ({ type: "free", size: t }), Ie = (t) => b("moov", void 0, [
  Qs(t.creationTime, t.trackDatas),
  ...t.trackDatas.map((e) => Xs(e, t.creationTime)),
  t.isFragmented ? Wn(t.trackDatas) : null,
  Xn(t)
]), Qs = (t, e) => {
  const i = Math.max(0, ...e.map((o) => (
    // Round separately to match the edit list
    Math.max(0, B(Se(o), z) + B(o.startTimestampOffset ?? 0, z))
  ))), r = Math.max(0, ...e.map((o) => o.track.id)) + 1, s = !de(t) || !de(i), n = s ? Y : p;
  return C("mvhd", +s, 0, [
    n(t),
    // Creation time
    n(t),
    // Modification time
    p(z),
    // Timescale
    n(i),
    // Duration
    N(1),
    // Preferred rate
    Hi(1),
    // Preferred volume
    Array(10).fill(0),
    // Reserved
    Ui(Ti),
    // Matrix
    Array(24).fill(0),
    // Pre-defined
    p(r)
    // Next track ID
  ]);
}, Xs = (t, e) => {
  const i = uo(t), r = t.startTimestampOffset !== null && t.startTimestampOffset !== 0;
  return b("trak", void 0, [
    Ks(t, e),
    r ? Ys(t) : null,
    Zs(t, e),
    i.name !== void 0 ? b("udta", void 0, [
      b("name", [
        ...se.encode(i.name)
      ])
    ]) : null
  ]);
}, Ks = (t, e) => {
  const i = Math.max(0, B(Se(t), z) + B(t.startTimestampOffset ?? 0, z)), r = !de(e) || !de(i), s = r ? Y : p;
  let n;
  if (t.type === "video" && t.track.metadata.transformationMatrix)
    n = t.track.metadata.transformationMatrix;
  else if (t.type === "video") {
    const { rotation: l, flip: c } = t.track.metadata, d = gt(er(l ?? 0), tr(c ? -1 : 1, 1));
    n = Ji(d, t.info.width, t.info.height);
  } else
    n = Ti;
  let o = 2;
  t.track.metadata.disposition?.default !== !1 && (o |= 1);
  const a = t.type === "video" ? 0 : t.type === "audio" ? 1 : t.type === "subtitle" ? 2 : Be(t);
  return C("tkhd", +r, o, [
    s(e),
    // Creation time
    s(e),
    // Modification time
    p(t.track.id),
    // Track ID
    p(0),
    // Reserved
    s(i),
    // Duration
    Array(8).fill(0),
    // Reserved
    T(0),
    // Layer
    T(a),
    // Alternate group
    Hi(t.type === "audio" ? 1 : 0),
    // Volume
    T(0),
    // Reserved
    Ui(n),
    // Matrix
    N(t.type === "video" ? t.info.width : 0),
    // Track width
    N(t.type === "video" ? t.info.height : 0)
    // Track height
  ]);
}, Ys = (t) => {
  const e = t.startTimestampOffset;
  if (h(e !== null), e > 0) {
    const i = B(e, z), r = B(Se(t), z), s = !de(i) || !de(r), n = s ? Y : p, o = s ? li : ie;
    return b("edts", void 0, [
      C("elst", s ? 1 : 0, 0, [
        p(2),
        // Entry count
        // #1
        n(i),
        // Segment duration
        o(-1),
        // Media time
        N(1),
        // Media rate
        // #2
        n(r),
        // Segment duration
        o(0),
        // Media time
        N(1)
        // Media rate
      ])
    ]);
  } else {
    const i = B(-e, t.timescale), r = Math.max(0, B(Se(t), z) + B(e, z)), s = !rr(i) || !de(r), n = s ? Y : p, o = s ? li : ie;
    return b("edts", void 0, [
      C("elst", s ? 1 : 0, 0, [
        p(1),
        // Entry count
        // #1
        n(r),
        // Segment duration
        o(i),
        // Media time
        N(1)
        // Media rate
      ])
    ]);
  }
}, Zs = (t, e) => b("mdia", void 0, [
  Js(t, e),
  kt(!0, en[t.type], tn[t.type]),
  rn(t)
]), Js = (t, e) => {
  const i = B(Se(t), t.timescale), r = !de(e) || !de(i), s = r ? Y : p;
  return C("mdhd", +r, 0, [
    s(e),
    // Creation time
    s(e),
    // Modification time
    p(t.timescale),
    // Timescale
    s(i),
    // Duration
    T(Di(t.track.metadata.languageCode ?? dr)),
    // Language
    T(0)
    // Quality
  ]);
}, en = {
  video: "vide",
  audio: "soun",
  subtitle: "text"
}, tn = {
  video: "MediabunnyVideoHandler",
  audio: "MediabunnySoundHandler",
  subtitle: "MediabunnyTextHandler"
}, kt = (t, e, i, r = "\0\0\0\0") => C("hdlr", 0, 0, [
  t ? S("mhlr") : p(0),
  // Component type
  S(e),
  // Component subtype
  S(r),
  // Component manufacturer
  p(0),
  // Component flags
  p(0),
  // Component flags mask
  S(i, !0)
  // Component name
]), rn = (t) => b("minf", void 0, [
  an[t.type](),
  cn(),
  un(t)
]), sn = () => C("vmhd", 0, 1, [
  T(0),
  // Graphics mode
  T(0),
  // Opcolor R
  T(0),
  // Opcolor G
  T(0)
  // Opcolor B
]), nn = () => C("smhd", 0, 0, [
  T(0),
  // Balance
  T(0)
  // Reserved
]), on = () => C("nmhd", 0, 0), an = {
  video: sn,
  audio: nn,
  subtitle: on
}, cn = () => b("dinf", void 0, [
  dn()
]), dn = () => C("dref", 0, 0, [
  p(1)
  // Entry count
], [
  ln()
]), ln = () => C("url ", 0, 1), un = (t) => {
  const e = t.compositionTimeOffsetTable.length > 1 || t.compositionTimeOffsetTable.some((i) => i.sampleCompositionTimeOffset !== 0);
  return b("stbl", void 0, [
    fn(t),
    kn(t),
    e ? Fn(t) : null,
    e ? On(t) : null,
    In(t),
    Rn(t),
    Mn(t),
    An(t)
  ]);
}, fn = (t) => {
  let e;
  if (t.type === "video")
    e = hn(Jn(t.track.source._codec, t.info.decoderConfig.codec), t);
  else if (t.type === "audio") {
    const i = $i(t.track.source._codec, t.info.decoderConfig.codec, t.muxer.isQuickTime);
    h(i), e = bn(i, t);
  } else t.type === "subtitle" && (e = Bn(io[t.track.source._codec], t));
  return h(e), C("stsd", 0, 0, [
    p(1)
    // Entry count
  ], [
    e
  ]);
}, hn = (t, e) => b(t, [
  Array(6).fill(0),
  // Reserved
  T(1),
  // Data reference index
  T(0),
  // Pre-defined
  T(0),
  // Reserved
  Array(12).fill(0),
  // Pre-defined
  T(e.info.width),
  // Width
  T(e.info.height),
  // Height
  p(4718592),
  // Horizontal resolution
  p(4718592),
  // Vertical resolution
  p(0),
  // Reserved
  T(1),
  // Frame count
  // Compressor name
  P(rt.length),
  // Weird Pascal-style string
  S(rt),
  Array(31 - rt.length).fill(0),
  T(e.info.hasAlphaChannel ? 32 : 24),
  // Depth
  Pt(65535)
  // Pre-defined
], [
  eo[e.track.source._codec]?.(e) ?? null,
  mn(e),
  nr(e.info.decoderConfig.colorSpace) ? null : pn(e),
  At(e)
]), At = (t) => t.avgBitrate === 0 && t.maxBitrate === 0 ? null : b("btrt", [
  p(0),
  // Decoding buffer size (unknown)
  p(t.maxBitrate),
  // Max bitrate
  p(t.avgBitrate)
  // Average bitrate
]), mn = (t) => t.info.pixelAspectRatio.num === t.info.pixelAspectRatio.den ? null : b("pasp", [
  p(t.info.pixelAspectRatio.num),
  p(t.info.pixelAspectRatio.den)
]), pn = (t) => {
  const e = t.info.decoderConfig.colorSpace;
  return b("colr", [
    // Colour type
    S(t.muxer.isQuickTime ? "nclc" : "nclx"),
    // Colour primaries
    T(e?.primaries != null ? Qe[e.primaries] : 2),
    // Transfer characteristics
    T(e?.transfer != null ? Xe[e.transfer] : 2),
    // Matrix coefficients
    T(e?.matrix != null ? Ke[e.matrix] : 2),
    // Full range flag
    t.muxer.isQuickTime ? [] : P((e?.fullRange ? 1 : 0) << 7)
  ]);
}, gn = (t) => t.info.decoderConfig && b("avcC", [
  // For AVC, description is an AVCDecoderConfigurationRecord, so nothing else to do here
  ...K(t.info.decoderConfig.description)
]), wn = (t) => t.info.decoderConfig && b("hvcC", [
  // For HEVC, description is an HEVCDecoderConfigurationRecord, so nothing else to do here
  ...K(t.info.decoderConfig.description)
]), hi = (t) => {
  if (!t.info.decoderConfig)
    return null;
  const e = t.info.decoderConfig, i = e.codec.split("."), r = Number(i[1]), s = Number(i[2]), n = Number(i[3]), o = i[4] ? Number(i[4]) : 1, a = i[8] ? Number(i[8]) : Number(e.colorSpace?.fullRange ?? 0), l = (n << 4) + (o << 1) + a, c = i[5] ? Number(i[5]) : e.colorSpace?.primaries ? Qe[e.colorSpace.primaries] : 1, d = i[6] ? Number(i[6]) : e.colorSpace?.transfer ? Xe[e.colorSpace.transfer] : 1, u = i[7] ? Number(i[7]) : e.colorSpace?.matrix ? Ke[e.colorSpace.matrix] : 1;
  return C("vpcC", 1, 0, [
    P(r),
    // Profile
    P(s),
    // Level
    P(l),
    // Bit depth, chroma subsampling, full range
    P(c),
    // Colour primaries
    P(d),
    // Transfer characteristics
    P(u),
    // Matrix coefficients
    T(0)
    // Codec initialization data size
  ]);
}, yn = (t) => b("av1C", ys(t.info.decoderConfig.codec)), bn = (t, e) => {
  let i = 0, r, s = 16;
  const n = Te.includes(e.track.source._codec);
  if (n) {
    const o = e.track.source._codec, { sampleSize: a } = xe(o);
    s = 8 * a, s > 16 && (i = 1);
  }
  if (e.muxer.isQuickTime && (i = 1), i === 0)
    r = [
      Array(6).fill(0),
      // Reserved
      T(1),
      // Data reference index
      T(i),
      // Version
      T(0),
      // Revision level
      p(0),
      // Vendor
      T(e.info.numberOfChannels),
      // Number of channels
      T(s),
      // Sample size (bits)
      T(0),
      // Compression ID
      T(0),
      // Packet size
      T(e.info.sampleRate < 2 ** 16 ? e.info.sampleRate : 0),
      // Sample rate (upper)
      T(0)
      // Sample rate (lower)
    ];
  else {
    const o = n ? 0 : -2;
    r = [
      Array(6).fill(0),
      // Reserved
      T(1),
      // Data reference index
      T(i),
      // Version
      T(0),
      // Revision level
      p(0),
      // Vendor
      T(e.info.numberOfChannels),
      // Number of channels
      T(Math.min(s, 16)),
      // Sample size (bits)
      Pt(o),
      // Compression ID
      T(0),
      // Packet size
      T(e.info.sampleRate < 2 ** 16 ? e.info.sampleRate : 0),
      // Sample rate (upper)
      T(0),
      // Sample rate (lower)
      n ? [
        p(1),
        // Samples per packet (must be 1 for uncompressed formats)
        p(s / 8),
        // Bytes per packet
        p(e.info.numberOfChannels * s / 8)
        // Bytes per frame
      ] : [
        p(0),
        // Samples per packet (don't bother, still works with 0)
        p(0),
        // Bytes per packet (variable)
        p(0)
        // Bytes per frame (variable)
      ],
      p(2)
      // Bytes per sample (constant in FFmpeg)
    ];
  }
  return b(t, r, [
    to(e.track.source._codec, e.muxer.isQuickTime)?.(e) ?? null,
    At(e)
  ]);
}, dt = (t) => {
  let e;
  switch (t.track.source._codec) {
    case "aac":
      e = 64;
      break;
    case "mp3":
      e = 107;
      break;
    case "vorbis":
      e = 221;
      break;
    default:
      throw new Error(`Unhandled audio codec: ${t.track.source._codec}`);
  }
  let i = [
    ...P(e),
    // Object type indication
    ...P(21),
    // stream type(6bits)=5 audio, flags(2bits)=1
    ...Ni(0),
    // 24bit buffer size
    ...p(t.maxBitrate),
    // max bitrate
    ...p(t.avgBitrate)
    // avg bitrate
  ];
  if (t.info.decoderConfig.description) {
    const r = K(t.info.decoderConfig.description);
    i = [
      ...i,
      ...P(5),
      // TAG(5) = DecoderSpecificInfo
      ...ct(r.byteLength),
      ...r
    ];
  }
  return i = [
    ...T(1),
    // ES_ID = 1
    ...P(0),
    // flags etc = 0
    ...P(4),
    // TAG(4) = ES Descriptor
    ...ct(i.length),
    ...i,
    ...P(6),
    // TAG(6)
    ...P(1),
    // length
    ...P(2)
    // data
  ], i = [
    ...P(3),
    // TAG(3) = Object Descriptor
    ...ct(i.length),
    ...i
  ], C("esds", 0, 0, i);
}, fe = (t) => b("wave", void 0, [
  Tn(t),
  En(t),
  b("\0\0\0\0")
  // NULL tag at the end
]), Tn = (t) => b("frma", [
  S($i(t.track.source._codec, t.info.decoderConfig.codec, t.muxer.isQuickTime))
]), En = (t) => {
  const { littleEndian: e } = xe(t.track.source._codec);
  return b("enda", [
    T(+e)
  ]);
}, _n = (t) => {
  let e = t.info.numberOfChannels, i = 3840, r = t.info.sampleRate, s = 0, n = 0, o = new Uint8Array(0);
  const a = t.info.decoderConfig?.description;
  if (a) {
    h(a.byteLength >= 18);
    const l = K(a), c = Qr(l);
    e = c.outputChannelCount, i = c.preSkip, r = c.inputSampleRate, s = c.outputGain, n = c.channelMappingFamily, c.channelMappingTable && (o = c.channelMappingTable);
  }
  return b("dOps", [
    P(0),
    // Version
    P(e),
    // OutputChannelCount
    T(i),
    // PreSkip
    p(r),
    // InputSampleRate
    Pt(s),
    // OutputGain
    P(n),
    // ChannelMappingFamily
    ...o
  ]);
}, vn = (t) => {
  const e = t.info.decoderConfig?.description;
  h(e);
  const i = K(e);
  return C("dfLa", 0, 0, [
    ...i.subarray(4)
  ]);
}, J = (t) => {
  const { littleEndian: e, sampleSize: i } = xe(t.track.source._codec), r = +e;
  return C("pcmC", 0, 0, [
    P(r),
    P(8 * i)
  ]);
}, Cn = (t) => {
  h(t.info.primingPacket);
  const e = Kr(t.info.primingPacket.data);
  if (!e)
    throw new Error("Couldn't extract AC-3 frame info from the audio packet. Ensure the packets contain valid AC-3 sync frames (as specified in ETSI TS 102 366).");
  const i = new Uint8Array(3), r = new I(i);
  return r.writeBits(2, e.fscod), r.writeBits(5, e.bsid), r.writeBits(3, e.bsmod), r.writeBits(3, e.acmod), r.writeBits(1, e.lfeon), r.writeBits(5, e.bitRateCode), r.writeBits(5, 0), b("dac3", [...i]);
}, xn = (t) => {
  h(t.info.primingPacket);
  const e = Zr(t.info.primingPacket.data);
  if (!e)
    throw new Error("Couldn't extract E-AC-3 frame info from the audio packet. Ensure the packets contain valid E-AC-3 sync frames (as specified in ETSI TS 102 366).");
  let i = 16;
  for (const o of e.substreams)
    i += 23, o.numDepSub > 0 ? i += 9 : i += 1;
  const r = Math.ceil(i / 8), s = new Uint8Array(r), n = new I(s);
  n.writeBits(13, e.dataRate), n.writeBits(3, e.substreams.length - 1);
  for (const o of e.substreams)
    n.writeBits(2, o.fscod), n.writeBits(5, o.bsid), n.writeBits(1, 0), n.writeBits(1, 0), n.writeBits(3, o.bsmod), n.writeBits(3, o.acmod), n.writeBits(1, o.lfeon), n.writeBits(3, 0), n.writeBits(4, o.numDepSub), o.numDepSub > 0 ? n.writeBits(9, o.chanLoc) : n.writeBits(1, 0);
  return b("dec3", [...s]);
}, Sn = (t) => {
  h(t.info.primingPacket);
  const e = fs(t.info.primingPacket.data);
  if (!e)
    throw new Error("Couldn't extract DTS frame info from the audio packet. Ensure the packets contain valid DTS frames as specified in ETSI TS 102 114.");
  return b("ddts", [...ps(e)]);
}, Bn = (t, e) => b(t, [
  Array(6).fill(0),
  // Reserved
  T(1)
  // Data reference index
], [
  ro[e.track.source._codec](e),
  At(e)
]), Pn = (t) => b("vttC", [
  ...se.encode(t.info.config.description)
]), kn = (t) => C("stts", 0, 0, [
  p(t.timeToSampleTable.length),
  // Number of entries
  t.timeToSampleTable.map((e) => [
    p(e.sampleCount),
    // Sample count
    p(e.sampleDelta)
    // Sample duration
  ])
]), An = (t) => {
  if (t.samples.every((i) => i.type === "key"))
    return null;
  const e = [...t.samples.entries()].filter(([, i]) => i.type === "key");
  return C("stss", 0, 0, [
    p(e.length),
    // Number of entries
    e.map(([i]) => p(i + 1))
    // Sync sample table
  ]);
}, In = (t) => C("stsc", 0, 0, [
  p(t.compactlyCodedChunkTable.length),
  // Number of entries
  t.compactlyCodedChunkTable.map((e) => [
    p(e.firstChunk),
    // First chunk
    p(e.samplesPerChunk),
    // Samples per chunk
    p(1)
    // Sample description index
  ])
]), Rn = (t) => {
  if (t.type === "audio" && t.info.requiresPcmTransformation) {
    const { sampleSize: e } = xe(t.track.source._codec);
    return C("stsz", 0, 0, [
      p(e * t.info.numberOfChannels),
      // Sample size
      p(t.samples.reduce((i, r) => i + B(r.duration, t.timescale), 0))
    ]);
  }
  return C("stsz", 0, 0, [
    p(0),
    // Sample size (0 means non-constant size)
    p(t.samples.length),
    // Number of entries
    t.samples.map((e) => p(e.size))
    // Sample size table
  ]);
}, Mn = (t) => t.finalizedChunks.length > 0 && re(t.finalizedChunks).offset >= 2 ** 32 ? C("co64", 0, 0, [
  p(t.finalizedChunks.length),
  // Number of entries
  t.finalizedChunks.map((e) => Y(e.offset))
  // Chunk offset table
]) : C("stco", 0, 0, [
  p(t.finalizedChunks.length),
  // Number of entries
  t.finalizedChunks.map((e) => p(e.offset))
  // Chunk offset table
]), Fn = (t) => C("ctts", 1, 0, [
  p(t.compositionTimeOffsetTable.length),
  // Number of entries
  t.compositionTimeOffsetTable.map((e) => [
    p(e.sampleCount),
    // Sample count
    ie(e.sampleCompositionTimeOffset)
    // Sample offset
  ])
]), On = (t) => {
  let e = 1 / 0, i = -1 / 0, r = 1 / 0, s = -1 / 0;
  h(t.compositionTimeOffsetTable.length > 0), h(t.samples.length > 0);
  for (let o = 0; o < t.compositionTimeOffsetTable.length; o++) {
    const a = t.compositionTimeOffsetTable[o];
    e = Math.min(e, a.sampleCompositionTimeOffset), i = Math.max(i, a.sampleCompositionTimeOffset);
  }
  for (let o = 0; o < t.samples.length; o++) {
    const a = t.samples[o];
    r = Math.min(r, B(a.timestamp, t.timescale)), s = Math.max(s, B(a.timestamp + a.duration, t.timescale));
  }
  const n = Math.max(-e, 0);
  return s >= 2 ** 31 ? null : C("cslg", 0, 0, [
    ie(n),
    // Composition to DTS shift
    ie(e),
    // Least decode to display delta
    ie(i),
    // Greatest decode to display delta
    ie(r),
    // Composition start time
    ie(s)
    // Composition end time
  ]);
}, Wn = (t) => b("mvex", void 0, t.map(zn)), zn = (t) => C("trex", 0, 0, [
  p(t.track.id),
  // Track ID
  p(1),
  // Default sample description index
  p(0),
  // Default sample duration
  p(0),
  // Default sample size
  p(0)
  // Default sample flags
]), mi = (t, e) => b("moof", void 0, [
  Vn(t),
  ...e.map(Ln)
]), Vn = (t) => C("mfhd", 0, 0, [
  p(t)
  // Sequence number
]), qi = (t) => {
  let e = 0, i = 0;
  const r = 0, s = 0, n = t.type === "delta";
  return i |= +n, n ? e |= 1 : e |= 2, e << 24 | i << 16 | r << 8 | s;
}, Ln = (t) => b("traf", void 0, [
  Nn(t),
  Hn(t),
  Un(t)
]), Nn = (t) => {
  h(t.currentChunk);
  let e = 0;
  e |= 8, e |= 16, e |= 32, e |= 131072;
  const i = t.currentChunk.samples[1] ?? t.currentChunk.samples[0], r = {
    duration: i.timescaleUnitsToNextSample,
    size: i.size,
    flags: qi(i)
  };
  return C("tfhd", 0, e, [
    p(t.track.id),
    // Track ID
    p(r.duration),
    // Default sample duration
    p(r.size),
    // Default sample size
    p(r.flags)
    // Default sample flags
  ]);
}, Hn = (t) => (h(t.currentChunk), C("tfdt", 1, 0, [
  Y(B(t.currentChunk.startTimestamp, t.timescale))
  // Base Media Decode Time
])), Un = (t) => {
  h(t.currentChunk);
  const e = t.currentChunk.samples.map((y) => y.timescaleUnitsToNextSample), i = t.currentChunk.samples.map((y) => y.size), r = t.currentChunk.samples.map(qi), s = t.currentChunk.samples.map((y) => B(y.timestamp - y.decodeTimestamp, t.timescale)), n = new Set(e), o = new Set(i), a = new Set(r), l = new Set(s), c = a.size === 2 && r[0] !== r[1], d = n.size > 1, u = o.size > 1, f = !c && a.size > 1, m = l.size > 1 || [...l].some((y) => y !== 0);
  let g = 0;
  return g |= 1, g |= 4 * +c, g |= 256 * +d, g |= 512 * +u, g |= 1024 * +f, g |= 2048 * +m, C("trun", 1, g, [
    p(t.currentChunk.samples.length),
    // Sample count
    p(t.currentChunk.offset - t.currentChunk.moofOffset || 0),
    // Data offset
    c ? p(r[0]) : [],
    t.currentChunk.samples.map((y, E) => [
      d ? p(e[E]) : [],
      // Sample duration
      u ? p(i[E]) : [],
      // Sample size
      f ? p(r[E]) : [],
      // Sample flags
      // Sample composition time offsets
      m ? ie(s[E]) : []
    ])
  ]);
}, qn = (t) => b("mfra", void 0, [
  ...t.map(jn),
  $n()
]), jn = (t) => C("tfra", 1, 0, [
  p(t.track.id),
  // Track ID
  p(63),
  // This specifies that traf number, trun number and sample number are 32-bit ints
  p(t.finalizedChunks.length),
  // Number of entries
  t.finalizedChunks.map((i) => [
    Y(B(i.samples[0].timestamp, t.timescale)),
    // Time (in presentation time)
    Y(i.moofOffset),
    // moof offset
    p(i.trafIndex + 1),
    // traf number
    p(1),
    // trun number
    p(1)
    // Sample number
  ])
]), $n = () => C("mfro", 0, 0, [
  // This value needs to be overwritten manually from the outside, where the actual size of the enclosing mfra box
  // is known
  p(0)
  // Size
]), Dn = () => b("vtte"), Gn = (t, e, i, r, s) => b("vttc", void 0, [
  s !== null ? b("vsid", [ie(s)]) : null,
  i !== null ? b("iden", [...se.encode(i)]) : null,
  e !== null ? b("ctim", [...se.encode($s(e))]) : null,
  r !== null ? b("sttg", [...se.encode(r)]) : null,
  b("payl", [...se.encode(t)])
]), Qn = (t) => b("vtta", [...se.encode(t)]), Xn = (t) => {
  const e = [], i = t.format._options.metadataFormat ?? "auto", r = t.output._metadataTags;
  if (i === "mdir" || i === "auto" && !t.isQuickTime) {
    const s = Yn(r);
    s && e.push(s);
  } else if (i === "mdta") {
    const s = Zn(r);
    s && e.push(s);
  } else (i === "udta" || i === "auto" && t.isQuickTime) && Kn(e, t.output._metadataTags);
  return e.length === 0 ? null : b("udta", void 0, e);
}, Kn = (t, e) => {
  for (const { key: i, value: r } of Ci(e))
    switch (i) {
      case "title":
        t.push(ee("©nam", r));
        break;
      case "description":
        t.push(ee("©des", r));
        break;
      case "artist":
        t.push(ee("©ART", r));
        break;
      case "album":
        t.push(ee("©alb", r));
        break;
      case "albumArtist":
        t.push(ee("albr", r));
        break;
      case "genre":
        t.push(ee("©gen", r));
        break;
      case "date":
        t.push(ee("©day", r.toISOString().slice(0, 10)));
        break;
      case "comment":
        t.push(ee("©cmt", r));
        break;
      case "lyrics":
        t.push(ee("©lyr", r));
        break;
      case "raw":
        break;
      case "discNumber":
      case "discsTotal":
      case "trackNumber":
      case "tracksTotal":
      case "beatsPerMinute":
      case "images":
        break;
      default:
        Be(i);
    }
  if (e.raw)
    for (const i in e.raw) {
      const r = e.raw[i];
      r == null || i.length !== 4 || t.some((s) => s.type === i) || (typeof r == "string" ? t.push(ee(i, r)) : r instanceof Uint8Array && t.push(b(i, Array.from(r))));
    }
}, ee = (t, e) => {
  const i = se.encode(e);
  return b(t, [
    T(i.length),
    T(Di("und")),
    Array.from(i)
  ]);
}, pi = {
  "image/jpeg": 13,
  "image/png": 14,
  "image/bmp": 27
}, ji = (t, e) => {
  const i = [];
  for (const { key: r, value: s } of Ci(t))
    switch (r) {
      case "title":
        i.push({ key: e ? "title" : "©nam", value: Q(s) });
        break;
      case "description":
        i.push({ key: e ? "description" : "©des", value: Q(s) });
        break;
      case "artist":
        i.push({ key: e ? "artist" : "©ART", value: Q(s) });
        break;
      case "album":
        i.push({ key: e ? "album" : "©alb", value: Q(s) });
        break;
      case "albumArtist":
        i.push({ key: e ? "album_artist" : "aART", value: Q(s) });
        break;
      case "comment":
        i.push({ key: e ? "comment" : "©cmt", value: Q(s) });
        break;
      case "genre":
        i.push({ key: e ? "genre" : "©gen", value: Q(s) });
        break;
      case "beatsPerMinute":
        e || i.push({ key: "tmpo", value: b("data", [
          p(21),
          // Type indicator
          p(0),
          // Locale indicator
          T(s)
        ]) });
        break;
      case "lyrics":
        i.push({ key: e ? "lyrics" : "©lyr", value: Q(s) });
        break;
      case "date":
        i.push({
          key: e ? "date" : "©day",
          value: Q(s.toISOString().slice(0, 10))
        });
        break;
      case "images":
        for (const n of s)
          n.kind === "coverFront" && i.push({ key: "covr", value: b("data", [
            p(pi[n.mimeType] ?? 0),
            // Type indicator
            p(0),
            // Locale indicator
            Array.from(n.data)
            // Kinda slow, hopefully temp
          ]) });
        break;
      case "trackNumber":
        if (e) {
          const n = t.tracksTotal !== void 0 ? `${s}/${t.tracksTotal}` : s.toString();
          i.push({ key: "track", value: Q(n) });
        } else
          i.push({ key: "trkn", value: b("data", [
            p(0),
            // 8 bytes empty
            p(0),
            T(0),
            // Empty
            T(s),
            T(t.tracksTotal ?? 0),
            T(0)
            // Empty
          ]) });
        break;
      case "discNumber":
        e || i.push({ key: "disc", value: b("data", [
          p(0),
          // 8 bytes empty
          p(0),
          T(0),
          // Empty
          T(s),
          T(t.discsTotal ?? 0),
          T(0)
          // Empty
        ]) });
        break;
      case "tracksTotal":
      case "discsTotal":
        break;
      case "raw":
        break;
      default:
        Be(r);
    }
  if (t.raw)
    for (const r in t.raw) {
      const s = t.raw[r];
      s == null || !e && r.length !== 4 || i.some((n) => n.key === r) || (typeof s == "string" ? i.push({ key: r, value: Q(s) }) : s instanceof Uint8Array ? i.push({ key: r, value: b("data", [
        p(0),
        // Type indicator
        p(0),
        // Locale indicator
        Array.from(s)
      ]) }) : s instanceof Si && i.push({ key: r, value: b("data", [
        p(pi[s.mimeType] ?? 0),
        // Type indicator
        p(0),
        // Locale indicator
        Array.from(s.data)
        // Kinda slow, hopefully temp
      ]) }));
    }
  return i;
}, Yn = (t) => {
  const e = ji(t, !1);
  return e.length === 0 ? null : C("meta", 0, 0, void 0, [
    kt(!1, "mdir", "", "appl"),
    // mdir handler
    b("ilst", void 0, e.map((i) => b(i.key, void 0, [i.value])))
    // Item list without keys box
  ]);
}, Zn = (t) => {
  const e = ji(t, !0);
  return e.length === 0 ? null : b("meta", void 0, [
    kt(!1, "mdta", ""),
    // mdta handler
    C("keys", 0, 0, [
      p(e.length)
    ], e.map((i) => b("mdta", [
      ...se.encode(i.key)
    ]))),
    b("ilst", void 0, e.map((i, r) => {
      const s = String.fromCharCode(...p(r + 1));
      return b(s, void 0, [i.value]);
    }))
  ]);
}, Q = (t) => b("data", [
  p(1),
  // Type indicator (UTF-8)
  p(0),
  // Locale indicator
  ...se.encode(t)
]), Jn = (t, e) => {
  switch (t) {
    case "avc":
      return e.startsWith("avc3") ? "avc3" : "avc1";
    case "hevc":
      return "hvc1";
    case "vp8":
      return "vp08";
    case "vp9":
      return "vp09";
    case "av1":
      return "av01";
    case "prores":
      return e;
  }
}, eo = {
  avc: gn,
  hevc: wn,
  vp8: hi,
  vp9: hi,
  av1: yn,
  prores: null
}, $i = (t, e, i) => {
  switch (t) {
    case "aac":
      return "mp4a";
    case "mp3":
      return "mp4a";
    case "opus":
      return "Opus";
    case "vorbis":
      return "mp4a";
    case "flac":
      return "fLaC";
    case "ulaw":
      return "ulaw";
    case "alaw":
      return "alaw";
    case "pcm-u8":
      return "raw ";
    case "pcm-s8":
      return "sowt";
    case "ac3":
      return "ac-3";
    case "eac3":
      return "ec-3";
    case "dts":
      return e;
  }
  if (i)
    switch (t) {
      case "pcm-s16":
        return "sowt";
      case "pcm-s16be":
        return "twos";
      case "pcm-s24":
        return "in24";
      case "pcm-s24be":
        return "in24";
      case "pcm-s32":
        return "in32";
      case "pcm-s32be":
        return "in32";
      case "pcm-f32":
        return "fl32";
      case "pcm-f32be":
        return "fl32";
      case "pcm-f64":
        return "fl64";
      case "pcm-f64be":
        return "fl64";
    }
  else
    switch (t) {
      case "pcm-s16":
        return "ipcm";
      case "pcm-s16be":
        return "ipcm";
      case "pcm-s24":
        return "ipcm";
      case "pcm-s24be":
        return "ipcm";
      case "pcm-s32":
        return "ipcm";
      case "pcm-s32be":
        return "ipcm";
      case "pcm-f32":
        return "fpcm";
      case "pcm-f32be":
        return "fpcm";
      case "pcm-f64":
        return "fpcm";
      case "pcm-f64be":
        return "fpcm";
    }
}, to = (t, e) => {
  switch (t) {
    case "aac":
      return dt;
    case "mp3":
      return dt;
    case "opus":
      return _n;
    case "vorbis":
      return dt;
    case "flac":
      return vn;
    case "ac3":
      return Cn;
    case "eac3":
      return xn;
    case "dts":
      return Sn;
  }
  if (e)
    switch (t) {
      case "pcm-s24":
        return fe;
      case "pcm-s24be":
        return fe;
      case "pcm-s32":
        return fe;
      case "pcm-s32be":
        return fe;
      case "pcm-f32":
        return fe;
      case "pcm-f32be":
        return fe;
      case "pcm-f64":
        return fe;
      case "pcm-f64be":
        return fe;
    }
  else
    switch (t) {
      case "pcm-s16":
        return J;
      case "pcm-s16be":
        return J;
      case "pcm-s24":
        return J;
      case "pcm-s24be":
        return J;
      case "pcm-s32":
        return J;
      case "pcm-s32be":
        return J;
      case "pcm-f32":
        return J;
      case "pcm-f32be":
        return J;
      case "pcm-f64":
        return J;
      case "pcm-f64be":
        return J;
    }
  return null;
}, io = {
  webvtt: "wvtt"
}, ro = {
  webvtt: Pn
}, Di = (t) => {
  h(t.length === 3);
  let e = 0;
  for (let i = 0; i < 3; i++)
    e <<= 5, e += t.charCodeAt(i) - 96;
  return e;
};
class vt {
  constructor(e, i) {
    if (this.finalized = !1, this.started = !1, this.pos = 0, this.trackedWrites = null, this.trackedStart = -1, this.trackedEnd = -1, e._writerAcquired)
      throw new Error("Can't have multiple Writers for the same Target.");
    this.target = e, e._setMonotonicity(i), e._writerAcquired = !0;
  }
  start() {
    h(!this.started), this.target._start(), this.started = !0;
  }
  /** Writes the given data to the target, at the current position. */
  write(e) {
    h(this.started && !this.finalized), this.maybeTrackWrites(e), this.target._write(e, this.pos), this.pos += e.byteLength;
  }
  /** Sets the current position for future writes to a new one. */
  seek(e) {
    this.pos = e;
  }
  /** Returns the current position. */
  getPos() {
    return this.pos;
  }
  /** Signals to the writer that it may be time to flush. */
  async flush() {
    return h(this.started && !this.finalized), this.target._flush();
  }
  /** Called after muxing has finished. */
  async finalize() {
    h(this.started && !this.finalized), await this.target._finalize(), this.finalized = !0;
  }
  maybeTrackWrites(e) {
    if (!this.trackedWrites)
      return;
    let i = this.getPos();
    if (i < this.trackedStart) {
      if (i + e.byteLength <= this.trackedStart)
        return;
      e = e.subarray(this.trackedStart - i), i = 0;
    }
    const r = i + e.byteLength - this.trackedStart;
    let s = this.trackedWrites.byteLength;
    for (; s < r; )
      s *= 2;
    if (s !== this.trackedWrites.byteLength) {
      const n = new Uint8Array(s);
      n.set(this.trackedWrites, 0), this.trackedWrites = n;
    }
    this.trackedWrites.set(e, i - this.trackedStart), this.trackedEnd = Math.max(this.trackedEnd, i + e.byteLength);
  }
  startTrackingWrites() {
    this.trackedWrites = new Uint8Array(2 ** 10), this.trackedStart = this.getPos(), this.trackedEnd = this.trackedStart;
  }
  stopTrackingWrites() {
    if (!this.trackedWrites)
      throw new Error("Internal error: Can't get tracked writes since nothing was tracked.");
    const i = {
      data: this.trackedWrites.subarray(0, this.trackedEnd - this.trackedStart),
      start: this.trackedStart,
      end: this.trackedEnd
    };
    return this.trackedWrites = null, i;
  }
}
class X extends xt {
  constructor() {
    super(...arguments), this._writerAcquired = !1, this._monotonicity = null, this.onwrite = null;
  }
  /** @internal */
  _setMonotonicity(e) {
    this._monotonicity !== !1 && (this._monotonicity = e);
  }
  /** @internal */
  _dispatchWrite(e, i) {
    this.onwrite?.(e, i), this._emit("write", { start: e, end: i });
  }
  /**
   * Returns a new {@link RangedTarget} that writes data to this target using the given offset.
   *
   * Useful for writing a file into a section of a larger file.
   */
  slice(e) {
    if (!Number.isInteger(e) || e < 0)
      throw new TypeError("offset must be a non-negative integer.");
    return new co(this, e);
  }
}
const lt = 2 ** 16, ut = 2 ** 32;
class ft extends X {
  /** Creates a new {@link BufferTarget}. The buffer holding the data will be created and managed internally. */
  constructor(e = {}) {
    if (super(), this.buffer = null, this._maxPos = 0, !e || typeof e != "object")
      throw new TypeError("BufferTarget options, when provided, must be an object.");
    if (e.onFinalize !== void 0 && typeof e.onFinalize != "function")
      throw new TypeError("options.onFinalize, when provided, must be a function.");
    if (this._options = e, this._supportsResize = "resize" in new ArrayBuffer(0), this._supportsResize)
      try {
        this._buffer = new ArrayBuffer(lt, { maxByteLength: ut });
      } catch {
        this._buffer = new ArrayBuffer(lt), this._supportsResize = !1;
      }
    else
      this._buffer = new ArrayBuffer(lt);
    this._bytes = new Uint8Array(this._buffer);
  }
  /** @internal */
  _ensureSize(e) {
    let i = this._buffer.byteLength;
    for (; i < e; )
      i *= 2;
    if (i !== this._buffer.byteLength) {
      if (i > ut)
        throw new Error(`ArrayBuffer exceeded maximum size of ${ut} bytes. Please consider using another target.`);
      if (this._supportsResize)
        this._buffer.resize(i);
      else {
        const r = new ArrayBuffer(i), s = new Uint8Array(r);
        s.set(this._bytes, 0), this._buffer = r, this._bytes = s;
      }
    }
  }
  /** @internal */
  _start() {
  }
  /** @internal */
  _write(e, i) {
    this._ensureSize(i + e.byteLength), this._bytes.set(e, i), this._maxPos = Math.max(this._maxPos, i + e.byteLength), this._dispatchWrite(i, i + e.byteLength);
  }
  /** @internal */
  async _flush() {
  }
  /** @internal */
  async _finalize() {
    this.buffer = this._buffer.slice(0, this._maxPos), this._options.onFinalize && await this._options.onFinalize(this.buffer), this._emit("finalized");
  }
  /** @internal */
  async _close() {
  }
  /** @internal */
  _getSlice(e, i) {
    return this._bytes.slice(e, i);
  }
}
const so = 2 ** 24, no = 2;
class oo extends X {
  /** Creates a new {@link StreamTarget} which writes to the specified `writable`. */
  constructor(e, i = {}) {
    if (super(), this._sections = [], this._lastWriteEnd = 0, this._lastFlushEnd = 0, this._streamWriter = null, this._writeError = null, this._chunks = [], !(e instanceof WritableStream))
      throw new TypeError("StreamTarget requires a WritableStream instance.");
    if (i != null && typeof i != "object")
      throw new TypeError("StreamTarget options, when provided, must be an object.");
    if (i.chunked !== void 0 && typeof i.chunked != "boolean")
      throw new TypeError("options.chunked, when provided, must be a boolean.");
    if (i.chunkSize !== void 0 && (!Number.isInteger(i.chunkSize) || i.chunkSize < 1024))
      throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");
    this._writable = e, this._options = i, this._chunked = i.chunked ?? !1, this._chunkSize = i.chunkSize ?? so;
  }
  /** @internal */
  _start() {
    this._streamWriter = this._writable.getWriter();
  }
  /** @internal */
  _write(e, i) {
    if (i > this._lastWriteEnd) {
      const r = i - this._lastWriteEnd;
      this._write(new Uint8Array(r), this._lastWriteEnd);
    }
    this._sections.push({
      data: e.slice(),
      start: i
    }), this._lastWriteEnd = Math.max(this._lastWriteEnd, i + e.byteLength), this._dispatchWrite(i, i + e.byteLength);
  }
  /** @internal */
  async _flush() {
    if (this._writeError !== null)
      throw this._writeError;
    if (h(this._streamWriter), this._sections.length === 0)
      return;
    const e = [], i = [...this._sections].sort((r, s) => r.start - s.start);
    e.push({
      start: i[0].start,
      size: i[0].data.byteLength
    });
    for (let r = 1; r < i.length; r++) {
      const s = e[e.length - 1], n = i[r];
      n.start <= s.start + s.size ? s.size = Math.max(s.size, n.start + n.data.byteLength - s.start) : e.push({
        start: n.start,
        size: n.data.byteLength
      });
    }
    for (const r of e) {
      r.data = new Uint8Array(r.size);
      for (const s of this._sections)
        r.start <= s.start && s.start < r.start + r.size && r.data.set(s.data, s.start - r.start);
      if (this._streamWriter.desiredSize !== null && this._streamWriter.desiredSize <= 0 && await this._streamWriter.ready, this._chunked)
        this._writeDataIntoChunks(r.data, r.start), this._tryToFlushChunks();
      else {
        if (this._monotonicity === !0 && r.start !== this._lastFlushEnd)
          throw new Error("Internal error: Monotonicity violation.");
        this._streamWriter.write({
          type: "write",
          data: r.data,
          position: r.start
        }).catch((s) => {
          this._writeError ??= s;
        }), this._lastFlushEnd = r.start + r.data.byteLength;
      }
    }
    this._sections.length = 0;
  }
  /** @internal */
  _writeDataIntoChunks(e, i) {
    let r = this._chunks.findIndex((l) => l.start <= i && i < l.start + this._chunkSize);
    r === -1 && (r = this._createChunk(i));
    const s = this._chunks[r], n = i - s.start, o = e.subarray(0, Math.min(this._chunkSize - n, e.byteLength));
    s.data.set(o, n);
    const a = {
      start: n,
      end: n + o.byteLength
    };
    if (this._insertSectionIntoChunk(s, a), s.written[0].start === 0 && s.written[0].end === this._chunkSize && (s.shouldFlush = !0), this._chunks.length > no) {
      for (let l = 0; l < this._chunks.length - 1; l++)
        this._chunks[l].shouldFlush = !0;
      this._tryToFlushChunks();
    }
    o.byteLength < e.byteLength && this._writeDataIntoChunks(e.subarray(o.byteLength), i + o.byteLength);
  }
  /** @internal */
  _insertSectionIntoChunk(e, i) {
    let r = 0, s = e.written.length - 1, n = -1;
    for (; r <= s; ) {
      const o = Math.floor(r + (s - r + 1) / 2);
      e.written[o].start <= i.start ? (r = o + 1, n = o) : s = o - 1;
    }
    for (e.written.splice(n + 1, 0, i), (n === -1 || e.written[n].end < i.start) && n++; n < e.written.length - 1 && e.written[n].end >= e.written[n + 1].start; )
      e.written[n].end = Math.max(e.written[n].end, e.written[n + 1].end), e.written.splice(n + 1, 1);
  }
  /** @internal */
  _createChunk(e) {
    const r = {
      start: Math.floor(e / this._chunkSize) * this._chunkSize,
      data: new Uint8Array(this._chunkSize),
      written: [],
      shouldFlush: !1
    };
    return this._chunks.push(r), this._chunks.sort((s, n) => s.start - n.start), this._chunks.indexOf(r);
  }
  /** @internal */
  _tryToFlushChunks(e = !1) {
    h(this._streamWriter);
    for (let i = 0; i < this._chunks.length; i++) {
      const r = this._chunks[i];
      if (!(!r.shouldFlush && !e)) {
        for (const s of r.written) {
          const n = r.start + s.start;
          if (this._monotonicity === !0 && n !== this._lastFlushEnd)
            throw new Error("Internal error: Monotonicity violation.");
          const o = s.start !== 0 || s.end !== r.data.byteLength;
          let a;
          o && pr() ? a = r.data.slice(s.start, s.end) : a = r.data.subarray(s.start, s.end), this._streamWriter.write({
            type: "write",
            data: a,
            position: n
          }).catch((l) => {
            this._writeError ??= l;
          }), this._lastFlushEnd = r.start + s.end;
        }
        this._chunks.splice(i--, 1);
      }
    }
  }
  /** @internal */
  async _finalize() {
    if (this._chunked && this._tryToFlushChunks(!0), this._writeError !== null)
      throw this._writeError;
    h(this._streamWriter), await this._streamWriter.ready, await this._streamWriter.close(), this._emit("finalized");
  }
  /** @internal */
  async _close() {
    return this._streamWriter?.close();
  }
}
class ao extends X {
  constructor(e) {
    super(), this._writer = null, this._nextWritePos = 0, this._writable = e, this._streamTarget = new oo(new WritableStream({
      start: () => {
        this._writer = this._writable.getWriter();
      },
      write: (i) => {
        if (this._monotonicity !== !0)
          throw new Error("AppendOnlyStreamTarget requires that data be written monotonically (always appended to the end). You must use a format that guarantees this behavior.");
        return h(i.position === this._nextWritePos), this._nextWritePos += i.data.byteLength, h(this._writer), this._writer.write(i.data);
      },
      close: () => this._writer?.close()
    }));
  }
  /** @internal */
  _start() {
    this._streamTarget._start();
  }
  /** @internal */
  _write(e, i) {
    this._streamTarget._write(e, i);
  }
  /** @internal */
  _flush() {
    return this._streamTarget._flush();
  }
  /** @internal */
  _finalize() {
    return this._streamTarget._finalize();
  }
  /** @internal */
  _close() {
    return this._streamTarget._close();
  }
  /** @internal */
  _setMonotonicity(e) {
    super._setMonotonicity(e), this._streamTarget._setMonotonicity(e);
  }
}
class co extends X {
  /** @internal */
  constructor(e, i) {
    super(), this._baseTarget = e, this._offset = i;
  }
  /** @internal */
  _start() {
  }
  /** @internal */
  _write(e, i) {
    this._baseTarget._write(e, this._offset + i), this._dispatchWrite(i, i + e.byteLength);
  }
  /** @internal */
  _flush() {
    return this._baseTarget._flush();
  }
  /** @internal */
  async _finalize() {
    this._emit("finalized");
  }
  /** @internal */
  async _close() {
  }
  /** @internal */
  _setMonotonicity(e) {
    super._setMonotonicity(e), this._baseTarget._setMonotonicity(e);
  }
}
class ht {
  /** Creates a new {@link PathedTarget} from a root path and a callback. */
  constructor(e, i) {
    if (this.rootPath = e, this.getTarget = i, typeof e != "string")
      throw new TypeError("rootPath must be a string.");
    if (typeof i != "function")
      throw new TypeError("getTarget must be a function.");
  }
}
const z = 57600, lo = 2082844800, uo = (t) => {
  const e = {}, i = t.track;
  return i.metadata.name !== void 0 && (e.name = i.metadata.name), e;
}, B = (t, e, i = !0) => {
  const r = t * e;
  return i ? Math.round(r) : r;
}, Se = (t) => {
  if (t.samples.length === 0)
    return 0;
  let e = 1 / 0, i = -1 / 0;
  for (let r = 0; r < t.samples.length; r++) {
    const s = t.samples[r];
    s.timestamp < e && (e = s.timestamp), s.timestamp + s.duration > i && (i = s.timestamp + s.duration);
  }
  return e === 1 / 0 ? 0 : i - e;
};
class fo extends js {
  constructor(e, i) {
    super(e), this.writer = null, this.boxWriter = null, this.initWriter = null, this.initBoxWriter = null, this.auxTarget = new ft(), this.auxWriter = new vt(this.auxTarget, !1), this.auxBoxWriter = new He(this.auxWriter), this.mdat = null, this.ftypSize = null, this.trackDatas = [], this.allTracksKnown = _i(), this.creationTime = Math.floor(Date.now() / 1e3) + lo, this.finalizedChunks = [], this.wroteFragmentedHeader = !1, this.nextFragmentNumber = 1, this.maxWrittenTimestamp = -1 / 0, this.minWrittenTimestamp = 1 / 0, this.maxWrittenEndTimestamp = -1 / 0, this.segmentHeaderSize = null, this.format = i, this.formatOptions = { ...i._options }, this.isQuickTime = i instanceof Ki, this.isCmaf = i instanceof wi, this.minimumFragmentDuration = this.formatOptions.minimumFragmentDuration ?? (i instanceof wi ? 1 / 0 : 1), this.auxWriter.start();
  }
  async start() {
    const e = await this.mutex.acquire();
    if (this.isCmaf ? (this.fastStart = "fragmented", this.isFragmented = !0) : (this.writer = await this.output._getRootWriter((r) => this.formatOptions.fastStart !== void 0 ? this.formatOptions.fastStart === "fragmented" : r instanceof ft), this.boxWriter = new He(this.writer), this.fastStart = this.formatOptions.fastStart ?? (this.writer.target instanceof ft ? "in-memory" : !1), this.isFragmented = this.fastStart === "fragmented"), this.isCmaf) {
      if (!this.output._hasInitTarget())
        throw new Error("CMAF outputs require the initTarget field in OutputOptions to be set; the init segment will be written to it.");
      const r = await this.output._getInitTarget(), s = new vt(r, !0);
      s.start(), this.initWriter = s, this.initBoxWriter = new He(s);
    }
    const i = this.output.tracks.some((r) => r.isVideoTrack() && r.source._codec === "avc");
    {
      const r = this.initBoxWriter ?? this.boxWriter;
      if (h(r), this.formatOptions.onFtyp && r.writer.startTrackingWrites(), r.writeBox(Ds({
        isQuickTime: this.isQuickTime,
        holdsAvc: i,
        fragmented: this.isFragmented,
        cmaf: this.isCmaf
      })), this.formatOptions.onFtyp) {
        const { data: s, start: n } = r.writer.stopTrackingWrites();
        this.formatOptions.onFtyp(s, n);
      }
      this.ftypSize = r.writer.getPos(), this.isCmaf && await this.initWriter.flush();
    }
    if (this.fastStart !== "in-memory") if (this.fastStart === "reserve") {
      for (const r of this.output.tracks)
        if (r.metadata.maximumPacketCount === void 0)
          throw new Error("All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'.");
    } else this.isFragmented || (h(this.writer), h(this.boxWriter), this.formatOptions.onMdat && this.writer.startTrackingWrites(), this.mdat = Ue(!0), this.boxWriter.writeBox(this.mdat));
    await this.writer?.flush();
    for (const r of this.output.tracks)
      r.isVideoTrack() && r.metadata.decoderConfig ? this.getVideoTrackData(r, r.metadata.primingPacket ?? null, { decoderConfig: r.metadata.decoderConfig }) : r.isAudioTrack() && r.metadata.decoderConfig && this.getAudioTrackData(r, r.metadata.primingPacket ?? null, { decoderConfig: r.metadata.decoderConfig });
    e();
  }
  allTracksAreKnown() {
    for (const e of this.output.tracks)
      if (!e.source._closed && !this.trackDatas.some((i) => i.track === e))
        return !1;
    return !0;
  }
  async getMimeType() {
    await this.allTracksKnown.promise;
    const e = this.trackDatas.map((i) => i.type === "video" || i.type === "audio" ? i.info.decoderConfig.codec : {
      webvtt: "wvtt"
    }[i.track.source._codec]);
    return Bs({
      isQuickTime: this.isQuickTime,
      hasVideo: this.trackDatas.some((i) => i.type === "video"),
      hasAudio: this.trackDatas.some((i) => i.type === "audio"),
      codecStrings: e
    });
  }
  getVideoTrackData(e, i, r) {
    const s = this.trackDatas.find((m) => m.track === e);
    if (s)
      return s;
    Mi(r, e.source._codec), h(r), h(r.decoderConfig);
    const n = { ...r.decoderConfig };
    h(n.codedWidth !== void 0), h(n.codedHeight !== void 0);
    let o = !1;
    if (e.source._codec === "avc" && !n.description) {
      if (!i)
        throw new Error("No AVC description provided; you must therefore provide a priming packet.");
      const m = Fr(i.data);
      if (!m)
        throw new Error("Couldn't extract an AVCDecoderConfigurationRecord from the AVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.264) when not providing a description, or provide a description (must be an AVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in AVCC format.");
      n.description = Or(m), o = !0;
    } else if (e.source._codec === "hevc" && !n.description) {
      if (!i)
        throw new Error("No HEVC description provided; you must therefore provide a priming packet.");
      const m = Lr(i.data);
      if (!m)
        throw new Error("Couldn't extract an HEVCDecoderConfigurationRecord from the HEVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.265) when not providing a description, or provide a description (must be an HEVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in HEVC format.");
      n.description = Dr(m), o = !0;
    }
    const a = hr(1 / (e.metadata.frameRate ?? z), 1e6).den, l = n.displayAspectWidth, c = n.displayAspectHeight, d = l === void 0 || c === void 0 ? { num: 1, den: 1 } : xi({
      num: l * n.codedHeight,
      den: c * n.codedWidth
    }), u = n.codec === "ap4h" || n.codec === "ap4x", f = {
      muxer: this,
      track: e,
      type: "video",
      info: {
        width: n.codedWidth,
        height: n.codedHeight,
        pixelAspectRatio: d,
        decoderConfig: n,
        requiresAnnexBTransformation: o,
        hasAlphaChannel: u
      },
      timescale: a,
      samples: [],
      sampleQueue: [],
      timestampProcessingQueue: [],
      timeToSampleTable: [],
      compositionTimeOffsetTable: [],
      lastTimescaleUnits: null,
      lastSample: null,
      startTimestampOffset: null,
      finalizedChunks: [],
      currentChunk: null,
      compactlyCodedChunkTable: [],
      closed: !1,
      avgBitrate: e.source._nominalBitrate ?? e.metadata.averageBitrate ?? 0,
      maxBitrate: e.source._nominalBitrate ?? e.metadata.bitrate ?? 0
    };
    return this.trackDatas.push(f), this.trackDatas.sort((m, g) => m.track.id - g.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), f;
  }
  getAudioTrackData(e, i, r) {
    const s = this.trackDatas.find((l) => l.track === e);
    if (s)
      return s;
    Fi(r, e.source._codec), h(r), h(r.decoderConfig);
    const n = { ...r.decoderConfig };
    let o = !1;
    if (e.source._codec === "aac" && !n.description) {
      if (!i)
        throw new Error("No AAC description provided; you must therefore provide a priming packet.");
      const l = Zt(We.tempFromBytes(i.data));
      if (!l)
        throw new Error("Couldn't parse ADTS header from the AAC packet. Make sure the packets are in ADTS format (as specified in ISO 13818-7) when not providing a description, or provide a description (must be an AudioSpecificConfig as specified in ISO 14496-3) and ensure the packets are raw AAC data.");
      const c = Bi[l.samplingFrequencyIndex], d = Pi[l.channelConfiguration];
      if (c === void 0 || d === void 0)
        throw new Error("Invalid ADTS frame header.");
      n.description = Pr({
        objectType: l.objectType,
        outputSampleRate: c,
        outputNumberOfChannels: d
      }), o = !0;
    }
    if (!i) {
      if (e.source._codec === "ac3" || e.source._codec === "eac3")
        throw new Error("AC-3/E-AC-3 require a priming packet.");
      if (e.source._codec === "dts")
        throw new Error("DTS requires a priming packet.");
    }
    const a = {
      muxer: this,
      track: e,
      type: "audio",
      info: {
        numberOfChannels: r.decoderConfig.numberOfChannels,
        sampleRate: r.decoderConfig.sampleRate,
        decoderConfig: n,
        requiresPcmTransformation: !this.isFragmented && Te.includes(e.source._codec),
        expectedNextPcmPacketTimestamp: null,
        requiresAdtsStripping: o,
        primingPacket: i
      },
      timescale: n.sampleRate,
      samples: [],
      sampleQueue: [],
      timestampProcessingQueue: [],
      timeToSampleTable: [],
      compositionTimeOffsetTable: [],
      lastTimescaleUnits: null,
      lastSample: null,
      startTimestampOffset: null,
      finalizedChunks: [],
      currentChunk: null,
      compactlyCodedChunkTable: [],
      closed: !1,
      avgBitrate: e.source._nominalBitrate ?? e.metadata.averageBitrate ?? 0,
      maxBitrate: e.source._nominalBitrate ?? e.metadata.bitrate ?? 0
    };
    return this.trackDatas.push(a), this.trackDatas.sort((l, c) => l.track.id - c.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), a;
  }
  getSubtitleTrackData(e, i) {
    const r = this.trackDatas.find((n) => n.track === e);
    if (r)
      return r;
    Ss(i), h(i), h(i.config);
    const s = {
      muxer: this,
      track: e,
      type: "subtitle",
      info: {
        config: i.config
      },
      timescale: 1e3,
      // Reasonable
      samples: [],
      sampleQueue: [],
      timestampProcessingQueue: [],
      timeToSampleTable: [],
      compositionTimeOffsetTable: [],
      lastTimescaleUnits: null,
      lastSample: null,
      startTimestampOffset: null,
      finalizedChunks: [],
      currentChunk: null,
      compactlyCodedChunkTable: [],
      closed: !1,
      avgBitrate: e.source._nominalBitrate ?? e.metadata.averageBitrate ?? 0,
      maxBitrate: e.source._nominalBitrate ?? e.metadata.bitrate ?? 0,
      lastCueEndTimestamp: null,
      cueQueue: [],
      nextSourceId: 0,
      cueToSourceId: /* @__PURE__ */ new WeakMap()
    };
    return this.trackDatas.push(s), this.trackDatas.sort((n, o) => n.track.id - o.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), s;
  }
  async addEncodedVideoPacket(e, i, r) {
    const s = await this.mutex.acquire();
    try {
      const n = this.getVideoTrackData(e, i, r);
      let o = i.data;
      if (n.info.requiresAnnexBTransformation) {
        const l = [...Ve(o)].map((c) => o.subarray(c.offset, c.offset + c.length));
        if (l.length === 0)
          throw new Error("Failed to transform packet data. Make sure all packets are provided in Annex B format, as specified in ITU-T-REC-H.264 and ITU-T-REC-H.265.");
        o = Mr(l, 4);
      }
      this.validateTimestamp(n.track, i.timestamp, i.type === "key");
      const a = this.createSampleForTrack(n, o, i.timestamp, i.duration, i.type);
      await this.registerSample(n, a);
    } finally {
      s();
    }
  }
  async addEncodedAudioPacket(e, i, r) {
    const s = await this.mutex.acquire();
    try {
      const n = this.getAudioTrackData(e, i, r);
      let o = i.data;
      if (n.info.requiresAdtsStripping) {
        const d = Zt(We.tempFromBytes(o));
        if (!d)
          throw new Error("Expected ADTS frame, didn't get one.");
        const u = d.crcCheck === null ? Ps : ks;
        o = o.subarray(u);
      }
      this.validateTimestamp(n.track, i.timestamp, i.type === "key");
      let a = i.timestamp, l = i.duration;
      if (n.info.requiresPcmTransformation) {
        const u = xe(n.info.decoderConfig.codec).sampleSize * n.info.numberOfChannels;
        if (l = o.byteLength / u / n.info.sampleRate, n.info.expectedNextPcmPacketTimestamp !== null) {
          const f = a - n.info.expectedNextPcmPacketTimestamp;
          if (f < 0.01)
            a = n.info.expectedNextPcmPacketTimestamp;
          else {
            const m = await this.padWithSilence(n, n.info.expectedNextPcmPacketTimestamp, f);
            a = n.info.expectedNextPcmPacketTimestamp + m;
          }
        }
        n.info.expectedNextPcmPacketTimestamp = a + l;
      }
      const c = this.createSampleForTrack(n, o, a, l, i.type);
      await this.registerSample(n, c);
    } finally {
      s();
    }
  }
  async padWithSilence(e, i, r) {
    const s = B(r, e.timescale);
    if (r = s / e.timescale, s > 0) {
      const { sampleSize: n, silentValue: o } = xe(e.info.decoderConfig.codec), a = s * e.info.numberOfChannels, l = new Uint8Array(n * a).fill(o), c = this.createSampleForTrack(e, new Uint8Array(l.buffer), i, r, "key");
      await this.registerSample(e, c);
    }
    return r;
  }
  async addSubtitleCue(e, i, r) {
    const s = await this.mutex.acquire();
    try {
      const n = this.getSubtitleTrackData(e, r);
      this.validateTimestamp(n.track, i.timestamp, !0), e.source._codec === "webvtt" && (n.cueQueue.push(i), await this.processWebVTTCues(n, i.timestamp));
    } finally {
      s();
    }
  }
  async processWebVTTCues(e, i) {
    for (; e.cueQueue.length > 0; ) {
      e.lastCueEndTimestamp ??= Math.min(0, e.cueQueue[0].timestamp);
      const r = /* @__PURE__ */ new Set([]);
      for (const c of e.cueQueue)
        h(c.timestamp <= i), h(e.lastCueEndTimestamp <= c.timestamp + c.duration), r.add(Math.max(c.timestamp, e.lastCueEndTimestamp)), r.add(c.timestamp + c.duration);
      const s = [...r].sort((c, d) => c - d), n = s[0], o = s[1] ?? n;
      if (i < o)
        break;
      if (e.lastCueEndTimestamp < n) {
        this.auxWriter.seek(0);
        const c = Dn();
        this.auxBoxWriter.writeBox(c);
        const d = this.auxTarget._getSlice(0, this.auxWriter.getPos()), u = this.createSampleForTrack(e, d, e.lastCueEndTimestamp, n - e.lastCueEndTimestamp, "key");
        await this.registerSample(e, u), e.lastCueEndTimestamp = n;
      }
      this.auxWriter.seek(0);
      for (let c = 0; c < e.cueQueue.length; c++) {
        const d = e.cueQueue[c];
        if (d.timestamp >= o)
          break;
        di.lastIndex = 0;
        const u = di.test(d.text), f = d.timestamp + d.duration;
        let m = e.cueToSourceId.get(d);
        if (m === void 0 && o < f && (m = e.nextSourceId++, e.cueToSourceId.set(d, m)), d.notes) {
          const y = Qn(d.notes);
          this.auxBoxWriter.writeBox(y);
        }
        const g = Gn(d.text, u ? n : null, d.identifier ?? null, d.settings ?? null, m ?? null);
        this.auxBoxWriter.writeBox(g), f === o && e.cueQueue.splice(c--, 1);
      }
      const a = this.auxTarget._getSlice(0, this.auxWriter.getPos()), l = this.createSampleForTrack(e, a, n, o - n, "key");
      await this.registerSample(e, l), e.lastCueEndTimestamp = o;
    }
  }
  createSampleForTrack(e, i, r, s, n) {
    return {
      timestamp: r,
      decodeTimestamp: r,
      // This may be refined later
      duration: s,
      data: i,
      size: i.byteLength,
      type: n,
      timescaleUnitsToNextSample: B(s, e.timescale)
      // Will be refined
    };
  }
  processTimestamps(e, i) {
    if (e.timestampProcessingQueue.length === 0)
      return;
    if (e.type === "audio" && e.info.requiresPcmTransformation) {
      h(!this.isFragmented), e.startTimestampOffset ??= e.timestampProcessingQueue[0].timestamp;
      let s = 0;
      for (let n = 0; n < e.timestampProcessingQueue.length; n++) {
        const o = e.timestampProcessingQueue[n], a = B(o.duration, e.timescale);
        s += a;
      }
      if (e.timeToSampleTable.length === 0)
        e.timeToSampleTable.push({
          sampleCount: s,
          sampleDelta: 1
        });
      else {
        const n = re(e.timeToSampleTable);
        n.sampleCount += s;
      }
      e.timestampProcessingQueue.length = 0;
      return;
    }
    const r = e.timestampProcessingQueue.map((s) => s.timestamp).sort((s, n) => s - n);
    this.isFragmented ? e.startTimestampOffset ??= Math.min(r[0], 0) : e.startTimestampOffset ??= r[0];
    for (let s = 0; s < e.timestampProcessingQueue.length; s++) {
      const n = e.timestampProcessingQueue[s];
      n.decodeTimestamp = r[s];
      const o = B(n.timestamp - n.decodeTimestamp, e.timescale), a = B(n.duration, e.timescale);
      if (e.lastTimescaleUnits !== null) {
        h(e.lastSample);
        const l = B(n.decodeTimestamp, e.timescale, !1), c = Math.round(l - e.lastTimescaleUnits);
        if (h(c >= 0), e.lastTimescaleUnits += c, e.lastSample.timescaleUnitsToNextSample = c, !this.isFragmented) {
          let d = re(e.timeToSampleTable);
          if (h(d), d.sampleCount === 1) {
            d.sampleDelta = c;
            const f = e.timeToSampleTable[e.timeToSampleTable.length - 2];
            f && f.sampleDelta === c && (f.sampleCount++, e.timeToSampleTable.pop(), d = f);
          } else d.sampleDelta !== c && (d.sampleCount--, e.timeToSampleTable.push(d = {
            sampleCount: 1,
            sampleDelta: c
          }));
          d.sampleDelta === a ? d.sampleCount++ : e.timeToSampleTable.push({
            sampleCount: 1,
            sampleDelta: a
          });
          const u = re(e.compositionTimeOffsetTable);
          h(u), u.sampleCompositionTimeOffset === o ? u.sampleCount++ : e.compositionTimeOffsetTable.push({
            sampleCount: 1,
            sampleCompositionTimeOffset: o
          });
        }
      } else
        e.lastTimescaleUnits = B(n.decodeTimestamp, e.timescale, !1), this.isFragmented || (e.timeToSampleTable.push({
          sampleCount: 1,
          sampleDelta: a
        }), e.compositionTimeOffsetTable.push({
          sampleCount: 1,
          sampleCompositionTimeOffset: o
        }));
      e.lastSample = n;
    }
    if (e.timestampProcessingQueue.length = 0, h(e.lastSample), h(e.lastTimescaleUnits !== null), i !== void 0 && e.lastSample.timescaleUnitsToNextSample === 0) {
      h(i.type === "key");
      const s = B(i.timestamp, e.timescale, !1), n = Math.round(s - e.lastTimescaleUnits);
      e.lastSample.timescaleUnitsToNextSample = n;
    }
  }
  async registerSample(e, i) {
    i.type === "key" && this.processTimestamps(e, i), e.timestampProcessingQueue.push(i), this.isFragmented ? (e.sampleQueue.push(i), await this.interleaveSamples()) : this.fastStart === "reserve" ? await this.registerSampleFastStartReserve(e, i) : await this.addSampleToTrack(e, i);
  }
  async addSampleToTrack(e, i) {
    if (!this.isFragmented && (e.samples.push(i), this.fastStart === "reserve")) {
      const s = e.track.metadata.maximumPacketCount;
      if (h(s !== void 0), e.samples.length > s)
        throw new Error(`Track #${e.track.id} has already reached the maximum packet count (${s}). Either add less packets or increase the maximum packet count.`);
    }
    let r = !1;
    if (!e.currentChunk)
      r = !0;
    else {
      e.currentChunk.startTimestamp = Math.min(e.currentChunk.startTimestamp, i.timestamp);
      const s = i.timestamp - e.currentChunk.startTimestamp;
      if (this.isFragmented) {
        const n = this.trackDatas.every((o) => {
          if (e === o)
            return i.type === "key";
          const a = o.sampleQueue[0];
          return a ? a.type === "key" : o.closed;
        });
        s >= this.minimumFragmentDuration && n && i.timestamp > this.maxWrittenTimestamp && (r = !0, await this.finalizeFragment());
      } else
        r = s >= 0.5;
    }
    r && (e.currentChunk && await this.finalizeCurrentChunk(e), e.currentChunk = {
      startTimestamp: i.timestamp,
      samples: [],
      offset: null,
      moofOffset: null,
      trafIndex: null
    }), h(e.currentChunk), e.currentChunk.samples.push(i), this.isFragmented && (this.maxWrittenTimestamp = Math.max(this.maxWrittenTimestamp, i.timestamp), this.maxWrittenEndTimestamp = Math.max(this.maxWrittenEndTimestamp, i.timestamp + i.duration), this.minWrittenTimestamp = Math.min(this.minWrittenTimestamp, i.timestamp));
  }
  async finalizeCurrentChunk(e) {
    if (h(!this.isFragmented), h(this.writer), !e.currentChunk)
      return;
    e.finalizedChunks.push(e.currentChunk), this.finalizedChunks.push(e.currentChunk);
    let i = e.currentChunk.samples.length;
    if (e.type === "audio" && e.info.requiresPcmTransformation && (i = e.currentChunk.samples.reduce((r, s) => r + B(s.duration, e.timescale), 0)), (e.compactlyCodedChunkTable.length === 0 || re(e.compactlyCodedChunkTable).samplesPerChunk !== i) && e.compactlyCodedChunkTable.push({
      firstChunk: e.finalizedChunks.length,
      // 1-indexed
      samplesPerChunk: i
    }), this.fastStart === "in-memory") {
      e.currentChunk.offset = 0;
      return;
    }
    e.currentChunk.offset = this.writer.getPos();
    for (const r of e.currentChunk.samples)
      h(r.data), this.writer.write(r.data), r.data = null;
    await this.writer.flush();
  }
  async interleaveSamples(e = !1) {
    if (h(this.isFragmented), !(!e && !this.allTracksAreKnown()))
      e: for (; ; ) {
        let i = null, r = 1 / 0;
        for (const n of this.trackDatas) {
          if (!e && n.sampleQueue.length === 0 && !n.closed)
            break e;
          n.sampleQueue.length > 0 && n.sampleQueue[0].timestamp < r && (i = n, r = n.sampleQueue[0].timestamp);
        }
        if (!i)
          break;
        const s = i.sampleQueue.shift();
        await this.addSampleToTrack(i, s);
      }
  }
  async finalizeFragment(e = !this.isCmaf) {
    if (h(this.isFragmented), !this.wroteFragmentedHeader) {
      this.wroteFragmentedHeader = !0;
      const m = this.initBoxWriter ?? this.boxWriter;
      h(m), this.formatOptions.onMoov && m.writer.startTrackingWrites(), this.ensureOneEnabledTrack();
      const g = Ie(this);
      if (m.writeBox(g), this.formatOptions.onMoov) {
        const { data: y, start: E } = m.writer.stopTrackingWrites();
        this.formatOptions.onMoov(y, E);
      }
      if (this.isCmaf) {
        h(this.initWriter), await this.initWriter.flush(), await this.initWriter.finalize(), this.writer = await this.output._getRootWriter(!0), this.boxWriter = new He(this.writer);
        const y = this.boxWriter.measureBox(ui()), E = this.boxWriter.measureBox(fi(this, 0));
        this.segmentHeaderSize = y + E, this.writer.seek(this.segmentHeaderSize);
      }
    }
    h(this.writer), h(this.boxWriter);
    const i = this.trackDatas.filter((m) => m.currentChunk);
    if (i.length === 0) {
      e && await this.writer.flush();
      return;
    }
    const r = this.nextFragmentNumber++, s = mi(r, i), n = this.writer.getPos(), o = n + this.boxWriter.measureBox(s);
    let a = o + st, l = 1 / 0;
    for (let m = 0; m < i.length; m++) {
      const g = i[m];
      h(g.currentChunk), h(g.startTimestampOffset !== null), g.currentChunk.offset = a, g.currentChunk.moofOffset = n, g.currentChunk.trafIndex = m, g.currentChunk.startTimestamp -= g.startTimestampOffset;
      for (const y of g.currentChunk.samples)
        a += y.size, y.timestamp -= g.startTimestampOffset, y.decodeTimestamp -= g.startTimestampOffset;
      l = Math.min(l, g.currentChunk.startTimestamp);
    }
    const c = a - o, d = c >= 2 ** 32;
    if (d)
      for (const m of i)
        m.currentChunk.offset += Yt - st;
    this.formatOptions.onMoof && this.writer.startTrackingWrites();
    const u = mi(r, i);
    if (this.boxWriter.writeBox(u), this.formatOptions.onMoof) {
      const { data: m, start: g } = this.writer.stopTrackingWrites();
      this.formatOptions.onMoof(m, g, l);
    }
    h(this.writer.getPos() === o), this.formatOptions.onMdat && this.writer.startTrackingWrites();
    const f = Ue(d);
    f.size = c, this.boxWriter.writeBox(f), this.writer.seek(o + (d ? Yt : st));
    for (const m of i)
      for (const g of m.currentChunk.samples)
        this.writer.write(g.data), g.data = null;
    if (this.formatOptions.onMdat) {
      const { data: m, start: g } = this.writer.stopTrackingWrites();
      this.formatOptions.onMdat(m, g);
    }
    for (const m of i)
      m.finalizedChunks.push(m.currentChunk), this.finalizedChunks.push(m.currentChunk), m.currentChunk = null;
    e && await this.writer.flush();
  }
  async registerSampleFastStartReserve(e, i) {
    this.allTracksAreKnown() ? (this.mdat || await this.createFastStartReserveMdat(), await this.addSampleToTrack(e, i)) : e.sampleQueue.push(i);
  }
  async createFastStartReserveMdat() {
    h(this.writer), h(this.boxWriter), this.ensureOneEnabledTrack();
    const e = Ie(this), r = this.boxWriter.measureBox(e) + this.computeSampleTableSizeUpperBound() + 4096;
    h(this.ftypSize !== null), this.writer.seek(this.ftypSize + r), this.formatOptions.onMdat && this.writer.startTrackingWrites(), this.mdat = Ue(!0), this.boxWriter.writeBox(this.mdat);
    for (const s of this.trackDatas) {
      for (const n of s.sampleQueue)
        await this.addSampleToTrack(s, n);
      s.sampleQueue.length = 0;
    }
  }
  computeSampleTableSizeUpperBound() {
    h(this.fastStart === "reserve");
    let e = 0;
    for (const i of this.trackDatas) {
      const r = i.track.metadata.maximumPacketCount;
      h(r !== void 0), e += 8 * Math.ceil(2 / 3 * r), e += 4 * r, e += 8 * Math.ceil(2 / 3 * r), e += 12 * Math.ceil(2 / 3 * r), e += 4 * r, e += 8 * r;
    }
    return e;
  }
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async onTrackClose(e) {
    const i = await this.mutex.acquire(), r = this.trackDatas.find((s) => s.track === e);
    r && (r.closed = !0, r.type === "subtitle" && e.source._codec === "webvtt" && await this.processWebVTTCues(r, 1 / 0), this.processTimestamps(r)), this.allTracksAreKnown() && this.allTracksKnown.resolve(), this.isFragmented && await this.interleaveSamples(), i();
  }
  ensureOneEnabledTrack() {
    for (const e of ["video", "audio", "subtitle"]) {
      const i = this.trackDatas.filter((s) => s.type === e);
      if (i.length === 0)
        continue;
      if (!i.some((s) => s.track.metadata.disposition?.default !== !1)) {
        const s = i[0];
        s.track.metadata.disposition = {
          ...s.track.metadata.disposition,
          default: !0
        };
      }
    }
  }
  /** Internal function for external callers who want to full control fragment boundaries. */
  async forceFragmentFinalization() {
    h(this.isFragmented);
    const e = await this.mutex.acquire();
    try {
      for (const i of this.trackDatas)
        i.type === "subtitle" && i.track.source._codec === "webvtt" && await this.processWebVTTCues(i, 1 / 0), this.processTimestamps(i);
      await this.interleaveSamples(!0), await this.finalizeFragment();
    } finally {
      e();
    }
  }
  /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
  async finalize() {
    const e = await this.mutex.acquire();
    this.allTracksKnown.resolve(), this.ensureOneEnabledTrack(), !this.mdat && this.fastStart === "reserve" && await this.createFastStartReserveMdat();
    for (const i of this.trackDatas)
      i.closed = !0, i.type === "subtitle" && i.track.source._codec === "webvtt" && await this.processWebVTTCues(i, 1 / 0), this.processTimestamps(i);
    if (this.isFragmented)
      await this.interleaveSamples(!0), await this.finalizeFragment(!1);
    else
      for (const i of this.trackDatas) {
        await this.finalizeCurrentChunk(i);
        const r = Se(i);
        if (r > 0) {
          let a = 0;
          for (const l of i.samples)
            a += l.size;
          i.avgBitrate = Math.round(8 * a / r);
        } else
          i.avgBitrate = 0;
        let s = 0, n = 0, o = 0;
        for (let a = 0; a < i.samples.length; a++) {
          const l = i.samples[a];
          for (n += l.size; l.decodeTimestamp - i.samples[s].decodeTimestamp >= 1; )
            n -= i.samples[s].size, s++;
          o = Math.max(o, n);
        }
        if (i.maxBitrate = 8 * o, i.startTimestampOffset !== null)
          for (let a = 0; a < i.samples.length; a++) {
            const l = i.samples[a];
            l.timestamp -= i.startTimestampOffset, l.decodeTimestamp -= i.startTimestampOffset;
          }
      }
    if (h(this.writer), h(this.boxWriter), this.fastStart === "in-memory") {
      this.mdat = Ue(!1);
      let i;
      for (let s = 0; s < 2; s++) {
        const n = Ie(this), o = this.boxWriter.measureBox(n);
        i = this.boxWriter.measureBox(this.mdat);
        let a = this.writer.getPos() + o + i;
        for (const l of this.finalizedChunks) {
          l.offset = a;
          for (const { data: c } of l.samples)
            h(c), a += c.byteLength, i += c.byteLength;
        }
        if (a < 2 ** 32)
          break;
        i >= 2 ** 32 && (this.mdat.largeSize = !0);
      }
      this.formatOptions.onMoov && this.writer.startTrackingWrites();
      const r = Ie(this);
      if (this.boxWriter.writeBox(r), this.formatOptions.onMoov) {
        const { data: s, start: n } = this.writer.stopTrackingWrites();
        this.formatOptions.onMoov(s, n);
      }
      this.formatOptions.onMdat && this.writer.startTrackingWrites(), this.mdat.size = i, this.boxWriter.writeBox(this.mdat);
      for (const s of this.finalizedChunks)
        for (const n of s.samples)
          h(n.data), this.writer.write(n.data), n.data = null;
      if (this.formatOptions.onMdat) {
        const { data: s, start: n } = this.writer.stopTrackingWrites();
        this.formatOptions.onMdat(s, n);
      }
    } else if (this.isFragmented)
      if (this.isCmaf) {
        const i = this.segmentHeaderSize !== null ? this.writer.getPos() - this.segmentHeaderSize : 0;
        this.writer.seek(0), this.boxWriter.writeBox(ui()), this.boxWriter.writeBox(fi(this, i));
      } else {
        const i = this.writer.getPos(), r = qn(this.trackDatas);
        this.boxWriter.writeBox(r);
        const s = this.writer.getPos() - i;
        this.writer.seek(this.writer.getPos() - 4), this.boxWriter.writeU32(s);
      }
    else {
      h(this.mdat);
      const i = this.boxWriter.offsets.get(this.mdat);
      h(i !== void 0);
      const r = this.writer.getPos() - i;
      if (this.mdat.size = r, this.mdat.largeSize = r >= 2 ** 32, this.boxWriter.patchBox(this.mdat), this.formatOptions.onMdat) {
        const { data: n, start: o } = this.writer.stopTrackingWrites();
        this.formatOptions.onMdat(n, o);
      }
      const s = Ie(this);
      if (this.fastStart === "reserve") {
        h(this.ftypSize !== null), this.writer.seek(this.ftypSize), this.formatOptions.onMoov && this.writer.startTrackingWrites(), this.boxWriter.writeBox(s);
        const n = this.boxWriter.offsets.get(this.mdat) - this.writer.getPos();
        this.boxWriter.writeBox(Gs(n));
      } else
        this.formatOptions.onMoov && this.writer.startTrackingWrites(), this.boxWriter.writeBox(s);
      if (this.formatOptions.onMoov) {
        const { data: n, start: o } = this.writer.stopTrackingWrites();
        this.formatOptions.onMoov(n, o);
      }
    }
    e();
  }
}
var ho = function(t, e, i) {
  if (e != null) {
    if (typeof e != "object" && typeof e != "function") throw new TypeError("Object expected.");
    var r, s;
    if (i) {
      if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
      r = e[Symbol.asyncDispose];
    }
    if (r === void 0) {
      if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
      r = e[Symbol.dispose], i && (s = r);
    }
    if (typeof r != "function") throw new TypeError("Object not disposable.");
    s && (r = function() {
      try {
        s.call(this);
      } catch (n) {
        return Promise.reject(n);
      }
    }), t.stack.push({ value: e, dispose: r, async: i });
  } else i && t.stack.push({ async: !0 });
  return e;
}, mo = /* @__PURE__ */ (function(t) {
  return function(e) {
    function i(o) {
      e.error = e.hasError ? new t(o, e.error, "An error was suppressed during disposal.") : o, e.hasError = !0;
    }
    var r, s = 0;
    function n() {
      for (; r = e.stack.pop(); )
        try {
          if (!r.async && s === 1) return s = 0, e.stack.push(r), Promise.resolve().then(n);
          if (r.dispose) {
            var o = r.dispose.call(r.value);
            if (r.async) return s |= 2, Promise.resolve(o).then(n, function(a) {
              return i(a), n();
            });
          } else s |= 1;
        } catch (a) {
          i(a);
        }
      if (s === 1) return e.hasError ? Promise.reject(e.error) : Promise.resolve();
      if (e.hasError) throw e.error;
    }
    return n();
  };
})(typeof SuppressedError == "function" ? SuppressedError : function(t, e, i) {
  var r = new Error(i);
  return r.name = "SuppressedError", r.error = t, r.suppressed = e, r;
});
class It {
  constructor() {
    this._connectedTrack = null, this._closingPromise = null, this._closed = !1, this._nominalBitrate = null;
  }
  /** @internal */
  _ensureValidAdd() {
    if (!this._connectedTrack)
      throw new Error("Source is not connected to an output track.");
    if (this._connectedTrack.output.state === "canceled")
      throw new Error("Output has been canceled.");
    if (this._connectedTrack.output.state === "finalizing" || this._connectedTrack.output.state === "finalized")
      throw new Error("Output has been finalized.");
    if (this._connectedTrack.output.state === "pending")
      throw new Error("Output has not started.");
    if (this._closed)
      throw new Error("Source is closed.");
  }
  /** @internal */
  async _start() {
  }
  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async _flushAndClose(e) {
  }
  /**
   * Closes this source. This prevents future samples from being added and signals to the output file that no further
   * samples will come in for this track. Calling `.close()` is optional but recommended after adding the
   * last sample - for improved performance and reduced memory usage.
   */
  close() {
    if (this._closingPromise)
      return;
    const e = this._connectedTrack;
    if (!e)
      throw new Error("Cannot call close without connecting the source to an output track.");
    if (e.output.state === "pending")
      throw new Error("Cannot call close before output has been started.");
    this._closingPromise = (async () => {
      await this._flushAndClose(!1), this._closed = !0, !(e.output.state === "finalizing" || e.output.state === "finalized") && e.output._muxer.onTrackClose(e);
    })();
  }
  /** @internal */
  async _flushOrWaitForOngoingClose(e) {
    return this._closingPromise ??= (async () => {
      await this._flushAndClose(e), this._closed = !0;
    })();
  }
}
class Gi extends It {
  /** Internal constructor. */
  constructor(e) {
    if (super(), !le.includes(e))
      throw new TypeError(`Invalid video codec '${e}'. Must be one of: ${le.join(", ")}.`);
    this._codec = e;
  }
}
const gi = (t, e) => {
  if (t.metadata.hasOnlyKeyPackets && e.type !== "key")
    throw new Error("Cannot add non-key packets to a hasOnlyKeyPackets video track.");
};
class po {
  setError(e) {
    this.errorSet || (this.error = e, this.errorSet = !0);
  }
  constructor(e, i) {
    this.source = e, this.encodingConfig = i, this.ensureEncoderPromise = null, this.encoderInitialized = !1, this.encoder = null, this.encoderConfig = null, this.encodersReclaimed = !1, this.muxer = null, this.lastMultipleOfKeyFrameInterval = -1, this.emittedEncoderPackets = 0, this.codedWidth = null, this.codedHeight = null, this.outputWidth = null, this.outputHeight = null, this.frameRateLastSample = null, this.frameRateLastTimestamp = null, this.frameRateLastEndTimestamp = null, this.preciseTimings = [], this.customEncoder = null, this.customEncoderCallSerializer = new mr(), this.customEncoderQueueSize = 0, this.defaultEncodeOptions = {}, this.alphaEncoder = null, this.splitter = null, this.splitterCreationFailed = !1, this.alphaFrameQueue = [], this.error = null, this.errorSet = !1, this.lastMuxerPromise = Promise.resolve(), this.closed = !1;
  }
  async add(e, i, r) {
    const s = e;
    try {
      this.checkForEncoderError(), this.source._ensureValidAdd();
      const n = this.encodingConfig, o = n.sizeChangeBehavior ?? "deny";
      let a = !1;
      if (this.codedWidth !== null && this.codedHeight !== null) {
        if ((e.codedWidth !== this.codedWidth || e.codedHeight !== this.codedHeight) && (a = !0, o === "deny"))
          throw new Error(`Video sample size must remain constant. Expected ${this.codedWidth}x${this.codedHeight}, got ${e.codedWidth}x${e.codedHeight}. To allow the sample size to change over time, set \`sizeChangeBehavior\` to a value other than 'deny' in the encoding options.`);
      } else
        this.codedWidth = e.codedWidth, this.codedHeight = e.codedHeight;
      if (n.transform?.width !== void 0 || n.transform?.height !== void 0 || n.transform?.rotate !== void 0 || n.transform?.flip !== void 0 || n.transform?.crop !== void 0 || n.transform?.force === !0 || a && o !== "passThrough") {
        let u = n.transform?.width, f = n.transform?.height, m = n.transform?.fit ?? "fill";
        a && o !== "passThrough" && (h(this.outputWidth), h(this.outputHeight), h(o !== "deny"), u = this.outputWidth, f = this.outputHeight, m = o);
        const g = await e.transform({
          width: u,
          height: f,
          roundDimensionsTo: 2,
          crop: n.transform?.crop,
          rotate: n.transform?.rotate,
          flip: n.transform?.flip,
          fit: m,
          alpha: n.alpha
        });
        (this.outputWidth === null || this.outputHeight === null) && (this.outputWidth = g.displayWidth, this.outputHeight = g.displayHeight), i && e.close(), e = g, i = !0;
      } else
        (this.outputWidth === null || this.outputHeight === null) && (this.outputWidth = e.codedWidth, this.outputHeight = e.codedHeight);
      const d = n.transform?.frameRate;
      if (d !== void 0) {
        const u = e.timestamp + e.duration, f = zt(e.timestamp, d);
        if (this.frameRateLastSample !== null)
          if (f <= this.frameRateLastTimestamp) {
            this.frameRateLastSample.close(), this.frameRateLastSample = e.clone(), this.frameRateLastEndTimestamp = u;
            return;
          } else
            await this.padFrameRate(f, r);
        e === s && (e = e.clone(), i = !0), e.setTimestamp(f), e.setDuration(1 / d), this.frameRateLastSample?.close(), this.frameRateLastSample = e.clone(), this.frameRateLastTimestamp = f, this.frameRateLastEndTimestamp = u;
      }
      await this.processAndEncode(e, r);
    } finally {
      i && e.close();
    }
  }
  /**
   * Runs the process function (if any) and encodes the resulting samples.
   */
  async processAndEncode(e, i) {
    const r = this.encodingConfig;
    let s;
    if (r.transform?.process) {
      let n = r.transform.process(e);
      if (be(n) && (n = await n), n === null)
        return;
      Array.isArray(n) || (n = [n]);
      const o = [];
      try {
        for (const a of n)
          a instanceof W ? o.push(a) : typeof VideoFrame < "u" && a instanceof VideoFrame ? o.push(new W(a)) : o.push(new W(a, {
            timestamp: e.timestamp,
            duration: e.duration
          }));
      } catch (a) {
        for (const l of o)
          l !== e && l.close();
        for (const l of n)
          (l instanceof W && l !== e || typeof VideoFrame < "u" && l instanceof VideoFrame) && l.close();
        throw a;
      }
      s = o;
    } else
      s = [e];
    try {
      for (const n of s) {
        if (this.encoderInitialized || (this.ensureEncoderPromise || this.ensureEncoder(n), this.encoderInitialized || await this.ensureEncoderPromise), h(this.encoderInitialized), this.closed)
          break;
        this.encodersReclaimed && this.recreateWebCodecsEncoders();
        const o = this.encodingConfig.keyFrameInterval ?? 2, a = Math.floor(n.timestamp / o), l = {
          ...this.defaultEncodeOptions,
          ...n.encodeOptions,
          ...i
        }, c = {
          ...l,
          keyFrame: l.keyFrame !== void 0 ? l.keyFrame : o === 0 || a !== this.lastMultipleOfKeyFrameInterval
        };
        if (this.lastMultipleOfKeyFrameInterval = a, this.encodingConfig.onEncodedSample?.(n), this.customEncoder) {
          this.customEncoderQueueSize++;
          const d = n.clone(), u = this.customEncoderCallSerializer.call(() => this.customEncoder.encode(d, c)).catch((f) => this.setError(f)).finally(() => {
            this.customEncoderQueueSize--, d.close();
          });
          this.customEncoderQueueSize >= 4 && await u;
        } else {
          h(this.encoder);
          const d = n.toVideoFrame(), u = Ft(this.preciseTimings, d.timestamp, (m) => m.microsecondTimestamp), f = u !== -1 ? this.preciseTimings[u] : null;
          if (f && f.microsecondTimestamp === d.timestamp ? (f.timestamp !== n.timestamp && (f.timestampIsValid = !1), f.duration !== n.duration && (f.durationIsValid = !1)) : (this.preciseTimings.splice(u + 1, 0, {
            microsecondTimestamp: d.timestamp,
            timestamp: n.timestamp,
            duration: n.duration,
            timestampIsValid: !0,
            durationIsValid: !0
          }), this.preciseTimings.length > 128 && this.preciseTimings.shift()), this.alphaEncoder)
            if (!!d.format && !d.format.includes("A") || this.splitterCreationFailed) {
              this.alphaFrameQueue.push(null);
              try {
                this.encoder.encode(d, c);
              } finally {
                d.close();
              }
            } else {
              this.splitter || (this.splitter = new go());
              const { colorFrame: g, alphaFrame: y } = await this.splitter.split(d);
              this.alphaFrameQueue.push(y);
              try {
                this.encoder.encode(g, c);
              } finally {
                g.close();
              }
            }
          else
            try {
              this.encoder.encode(d, c);
            } finally {
              d.close();
            }
          this.encoder.encodeQueueSize >= 4 && await new Promise((m) => this.encoder.addEventListener("dequeue", m, { once: !0 }));
        }
        await this.lastMuxerPromise;
      }
    } finally {
      for (const n of s)
        n !== e && n.close();
    }
  }
  /** Repeats the last frame rate sample to fill the gap up to the given timestamp. */
  async padFrameRate(e, i) {
    const r = this.encodingConfig.transform.frameRate;
    h(this.frameRateLastSample);
    const s = Math.round((e - this.frameRateLastTimestamp) * r);
    for (let n = 1; n < s; n++) {
      const o = { stack: [], error: void 0, hasError: !1 };
      try {
        const a = ho(o, this.frameRateLastSample.clone(), !1);
        a.setTimestamp(this.frameRateLastTimestamp + n / r), a.setDuration(1 / r), await this.processAndEncode(a, i);
      } catch (a) {
        o.error = a, o.hasError = !0;
      } finally {
        mo(o);
      }
    }
  }
  ensureEncoder(e) {
    this.ensureEncoderPromise = (async () => {
      const i = Vi(this.encodingConfig.quality, this.encodingConfig.bitrate);
      h(i !== void 0);
      const r = Wi({
        ...this.encodingConfig,
        quality: i,
        width: e.codedWidth,
        height: e.codedHeight,
        squarePixelWidth: e.squarePixelWidth,
        squarePixelHeight: e.squarePixelHeight,
        framerate: this.source._connectedTrack?.metadata.frameRate
      });
      let s = null, n;
      for (const a of r) {
        const l = a.config;
        if (this.encodingConfig.onEncoderConfig?.(l), n = Li.find((d) => d.supports(this.encodingConfig.codec, l)), n) {
          s = a;
          break;
        }
        if (typeof VideoEncoder > "u")
          continue;
        if (l.alpha = "discard", this.encodingConfig.alpha === "keep" && (l.latencyMode = "quality"), (l.width % 2 === 1 || l.height % 2 === 1) && (this.encodingConfig.codec === "avc" || this.encodingConfig.codec === "hevc"))
          throw new Error(`The dimensions ${l.width}x${l.height} are not supported for codec '${this.encodingConfig.codec}'; both width and height must be even numbers. Make sure to round your dimensions to the nearest even number.`);
        try {
          if ((await VideoEncoder.isConfigSupported(l)).supported) {
            s = a;
            break;
          }
        } catch {
        }
      }
      if (!s) {
        if (typeof VideoEncoder > "u")
          throw new Error(wr("VideoEncoder"));
        const a = r[0].config, l = r.map(({ config: c, quantizer: d }) => d !== null ? `quantizer ${d}` : `${c.bitrate} bps`);
        throw new Error(`This specific encoder configuration (${a.codec}, ${l.join(" / ")}, ${a.width}x${a.height}, hardware acceleration: ${a.hardwareAcceleration ?? "no-preference"}) is not supported in this environment. Consider using another codec or changing your video parameters.`);
      }
      const o = s.config;
      s.quantizer !== null ? this.defaultEncodeOptions = zi(this.encodingConfig.codec, s.quantizer) : this.source._nominalBitrate = o.bitrate ?? null, n ? (this.customEncoder = new n(), this.customEncoder.codec = this.encodingConfig.codec, this.customEncoder.config = o, this.customEncoder.onPacket = (a, l) => {
        if (!(a instanceof Ee))
          throw new TypeError("The first argument passed to onPacket must be an EncodedPacket.");
        if (l !== void 0 && (!l || typeof l != "object"))
          throw new TypeError("The second argument passed to onPacket must be an object or undefined.");
        gi(this.source._connectedTrack, a), this.encodingConfig.onEncodedPacket?.(a, l), this.lastMuxerPromise = this.muxer.addEncodedVideoPacket(this.source._connectedTrack, a, l).catch((c) => {
          this.setError(c);
        });
      }, this.customEncoder.onError = (a) => {
        this.setError(a);
      }, await this.customEncoder.init()) : (this.encoderConfig = o, this.createWebCodecsEncoders()), h(this.source._connectedTrack), this.muxer = this.source._connectedTrack.output._muxer, this.encoderInitialized = !0;
    })();
  }
  createWebCodecsEncoders() {
    const e = this.encoderConfig;
    h(e);
    const i = [], r = [];
    let s = 0, n = 0;
    const o = (l, c) => {
      if (yr(l)) {
        this.encodersReclaimed = !0;
        return;
      }
      l.stack = c, this.setError(l);
    }, a = new Error("Encoding error").stack;
    if (this.encoder = new VideoEncoder({
      output: (l, c) => {
        if (!this.alphaEncoder) {
          this.addPacket(l, null, c);
          return;
        }
        const d = this.alphaFrameQueue.shift();
        h(d !== void 0), d ? (this.alphaEncoder.encode(d, {
          ...this.defaultEncodeOptions,
          // Crucial: The alpha frame is forced to be a key frame whenever the color frame
          // also is. Without this, playback can glitch and even crash in some browsers.
          // This is the reason why the two encoders are wired in series and not in parallel.
          keyFrame: l.type === "key"
        }), n++, d.close(), i.push({ chunk: l, meta: c })) : n === 0 ? this.addPacket(l, null, c) : (r.push(s + n), i.push({ chunk: l, meta: c }));
      },
      error: (l) => o(l, a)
    }), this.encoder.configure(e), this.encodingConfig.alpha === "keep") {
      const l = new Error("Encoding error").stack;
      this.alphaEncoder = new VideoEncoder({
        // We ignore the alpha chunk's metadata
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        output: (c, d) => {
          n--;
          const u = i.shift();
          for (h(u !== void 0), this.addPacket(u.chunk, c, u.meta), s++; r.length > 0 && r[0] === s; ) {
            r.shift();
            const f = i.shift();
            h(f !== void 0), this.addPacket(f.chunk, null, f.meta);
          }
        },
        error: (c) => o(c, l)
      }), this.alphaEncoder.configure(e);
    }
  }
  addPacket(e, i, r) {
    const s = {};
    if (i) {
      const c = new Uint8Array(i.byteLength);
      i.copyTo(c), s.alpha = c;
    }
    let n = Ee.fromEncodedChunk(e, s);
    const o = Ft(this.preciseTimings, e.timestamp, (c) => c.microsecondTimestamp), a = o !== -1 ? this.preciseTimings[o] : null;
    let l = null;
    this.emittedEncoderPackets === 0 && n.type === "delta" && r?.decoderConfig && (l = Xr(this.encodingConfig.codec, r.decoderConfig, n.data)), (a && a.microsecondTimestamp === e.timestamp || l !== null) && (n = n.clone({
      timestamp: a?.timestampIsValid ? a.timestamp : void 0,
      duration: a?.durationIsValid ? a.duration : void 0,
      type: l ?? void 0
    })), gi(this.source._connectedTrack, n), this.encodingConfig.onEncodedPacket?.(n, r), this.lastMuxerPromise = this.muxer.addEncodedVideoPacket(this.source._connectedTrack, n, r).catch((c) => {
      this.setError(c);
    }), this.emittedEncoderPackets++;
  }
  // Browsers may reclaim codecs that have been inactive for a while (see
  // https://github.com/Vanilagy/mediabunny/issues/531), closing them and reporting a QuotaExceededError. Since a
  // reclaimed encoder was idle, no frames are lost, so we transparently replace the encoders with fresh ones.
  recreateWebCodecsEncoders() {
    h(this.encoder), this.encoder.state !== "closed" && this.encoder.close(), this.alphaEncoder && this.alphaEncoder.state !== "closed" && this.alphaEncoder.close(), this.alphaFrameQueue.forEach((e) => e?.close()), this.alphaFrameQueue.length = 0, this.encodersReclaimed = !1, this.lastMultipleOfKeyFrameInterval = -1, this.createWebCodecsEncoders();
  }
  async flushAndClose(e) {
    try {
      if (!e && (this.checkForEncoderError(), this.frameRateLastSample)) {
        const i = this.encodingConfig.transform.frameRate, r = zt(this.frameRateLastEndTimestamp, i);
        await this.padFrameRate(r);
      }
      this.closed = !0, e || (this.customEncoder ? this.customEncoderCallSerializer.call(() => this.customEncoder.flush()) : this.encoder && !this.encodersReclaimed && (await this.encoder.flush(), await this.alphaEncoder?.flush(), await vr(25)));
    } finally {
      this.closed = !0, this.frameRateLastSample?.close(), this.frameRateLastSample = null, this.customEncoder ? await this.customEncoderCallSerializer.call(() => this.customEncoder.close()).catch((i) => this.setError(i)) : this.encoder && (this.encoder.state !== "closed" && this.encoder.close(), this.alphaEncoder && this.alphaEncoder.state !== "closed" && this.alphaEncoder.close(), this.alphaFrameQueue.forEach((i) => i?.close()), this.alphaFrameQueue.length = 0, this.splitter?.close());
    }
    e || this.checkForEncoderError();
  }
  getQueueSize() {
    return this.customEncoder ? this.customEncoderQueueSize : this.encoder?.encodeQueueSize ?? 0;
  }
  checkForEncoderError() {
    if (this.errorSet)
      throw this.error;
  }
}
let mt = null;
class go {
  constructor() {
    this.worker = null, this.pendingRequests = /* @__PURE__ */ new Map(), this.nextRequestId = 0;
  }
  split(e) {
    if (!this.worker) {
      if (!mt) {
        const s = new Blob([`(${wo.toString()})()`], { type: "application/javascript" });
        mt = URL.createObjectURL(s);
      }
      this.worker = new Worker(mt), this.worker.addEventListener("message", (s) => {
        const n = s.data, o = this.pendingRequests.get(n.id);
        o && (this.pendingRequests.delete(n.id), "error" in n ? o.reject(new Error(n.error)) : o.resolve({ colorFrame: n.colorFrame, alphaFrame: n.alphaFrame }));
      }), this.worker.addEventListener("error", (s) => {
        const n = new Error(s.message || "Color/alpha splitter worker error.");
        for (const o of this.pendingRequests.values())
          o.reject(n);
        this.pendingRequests.clear();
      });
    }
    const i = this.nextRequestId++, r = _i();
    return this.pendingRequests.set(i, r), this.worker.postMessage({ id: i, sourceFrame: e }, { transfer: [e] }), r.promise;
  }
  close() {
    this.worker?.terminate(), this.worker = null;
    const e = new Error("Color/alpha splitter closed.");
    for (const i of this.pendingRequests.values())
      i.reject(e);
    this.pendingRequests.clear();
  }
}
const wo = () => {
  let t = null, e = Promise.resolve();
  self.addEventListener("message", (n) => {
    const { id: o, sourceFrame: a } = n.data;
    e = e.then(async () => {
      try {
        const { colorFrame: l, alphaFrame: c } = await i(a);
        self.postMessage({ id: o, colorFrame: l, alphaFrame: c }, { transfer: [l, c] });
      } catch (l) {
        self.postMessage({ id: o, error: l.message });
      } finally {
        a.close();
      }
    });
  });
  const i = async (n) => {
    const o = n.format;
    if (!o)
      throw new Error("CPU color/alpha splitting requires a known VideoFrame format.");
    const a = n.allocationSize();
    if ((!t || t.byteLength !== a) && (t = new Uint8Array(a)), await n.copyTo(t), o === "RGBA" || o === "BGRA")
      return r(t, o, n);
    if (o === "I420A" || o === "I420AP10" || o === "I420AP12" || o === "I422A" || o === "I422AP10" || o === "I422AP12" || o === "I444A" || o === "I444AP10" || o === "I444AP12")
      return s(t, o, n);
    throw new Error(`CPU color/alpha splitting does not support format '${o}'.`);
  }, r = (n, o, a) => {
    const l = a.visibleRect?.width ?? a.codedWidth, c = a.visibleRect?.height ?? a.codedHeight, d = l * c, u = Math.ceil(l / 2), f = Math.ceil(c / 2), m = d + u * f * 2, g = new Uint8Array(m);
    for (let x = 0, R = 3; x < d; x++, R += 4)
      g[x] = n[R];
    g.fill(128, d);
    const y = new VideoFrame(n, {
      format: o === "RGBA" ? "RGBX" : "BGRX",
      codedWidth: l,
      codedHeight: c,
      timestamp: a.timestamp,
      duration: a.duration ?? void 0
      // No transfer!
    }), E = {
      format: "I420",
      codedWidth: l,
      codedHeight: c,
      timestamp: a.timestamp,
      duration: a.duration ?? void 0,
      transfer: [g.buffer]
    }, _ = new VideoFrame(g, E);
    return { colorFrame: y, alphaFrame: _ };
  }, s = (n, o, a) => {
    const l = a.visibleRect?.width ?? a.codedWidth, c = a.visibleRect?.height ?? a.codedHeight, d = o.includes("P10"), u = o.includes("P12"), f = d || u ? 2 : 1;
    let m, g;
    o.startsWith("I420") ? (m = Math.ceil(l / 2), g = Math.ceil(c / 2)) : o.startsWith("I422") ? (m = Math.ceil(l / 2), g = c) : (m = l, g = c);
    const y = l * c, E = m * g, _ = y * f, x = E * f, R = y * f, M = _ + x * 2, V = o.replace("A", ""), me = Math.ceil(l / 2), pe = Math.ceil(c / 2), ne = me * pe, Z = ne * f, U = R + 2 * Z, q = new Uint8Array(U), A = M;
    q.set(n.subarray(A, A + R), 0);
    const oe = R, Pe = d ? 512 : u ? 2048 : 128;
    f === 1 ? q.fill(Pe, oe) : new Uint16Array(q.buffer, oe, 2 * ne).fill(Pe);
    const j = d ? "I420P10" : u ? "I420P12" : "I420", F = new VideoFrame(n.subarray(0, M), {
      format: V,
      codedWidth: l,
      codedHeight: c,
      timestamp: a.timestamp,
      duration: a.duration ?? void 0
    }), $ = {
      format: j,
      codedWidth: l,
      codedHeight: c,
      timestamp: a.timestamp,
      duration: a.duration ?? void 0,
      transfer: [q.buffer]
    }, D = new VideoFrame(q, $);
    return { colorFrame: F, alphaFrame: D };
  };
};
class yo extends Gi {
  /**
   * Creates a new {@link CanvasSource} from a canvas element or `OffscreenCanvas` whose samples are encoded
   * according to the specified {@link VideoEncodingConfig}.
   */
  constructor(e, i) {
    if (!(typeof HTMLCanvasElement < "u" && e instanceof HTMLCanvasElement) && !(typeof OffscreenCanvas < "u" && e instanceof OffscreenCanvas))
      throw new TypeError("canvas must be an HTMLCanvasElement or OffscreenCanvas.");
    Ls(i), super(i.codec), this._encoder = new po(this, i), this._canvas = e;
  }
  /**
   * Captures the current canvas state as a video sample (frame), encodes it and adds it to the output.
   *
   * @param timestamp - The timestamp of the sample, in seconds.
   * @param duration - The duration of the sample, in seconds.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  add(e, i = 0, r) {
    if (!Number.isFinite(e))
      throw new TypeError("timestamp must be a finite number.");
    if (!Number.isFinite(i) || i < 0)
      throw new TypeError("duration must be a non-negative number.");
    const s = new W(this._canvas, { timestamp: e, duration: i });
    return this._encoder.add(s, !0, r);
  }
  /** @internal */
  _flushAndClose(e) {
    return this._encoder.flushAndClose(e);
  }
}
class bo extends It {
  /** Internal constructor. */
  constructor(e) {
    if (super(), !$e.includes(e))
      throw new TypeError(`Invalid audio codec '${e}'. Must be one of: ${$e.join(", ")}.`);
    this._codec = e;
  }
}
class To extends It {
  /** Internal constructor. */
  constructor(e) {
    if (super(), !Oe.includes(e))
      throw new TypeError(`Invalid subtitle codec '${e}'. Must be one of: ${Oe.join(", ")}.`);
    this._codec = e;
  }
}
class Qi {
  /**
   * Whether this output format supports video rotation metadata.
   * @deprecated Use {@link OutputFormat.supportsVideoTransformationMetadata} instead.
   */
  get supportsVideoRotationMetadata() {
    return this.supportsVideoTransformationMetadata;
  }
  /** Returns a list of video codecs that this output format can contain. */
  getSupportedVideoCodecs() {
    return this.getSupportedCodecs().filter((e) => le.includes(e));
  }
  /** Returns a list of audio codecs that this output format can contain. */
  getSupportedAudioCodecs() {
    return this.getSupportedCodecs().filter((e) => $e.includes(e));
  }
  /** Returns a list of subtitle codecs that this output format can contain. */
  getSupportedSubtitleCodecs() {
    return this.getSupportedCodecs().filter((e) => Oe.includes(e));
  }
  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _codecUnsupportedHint(e) {
    return "";
  }
  /** @internal */
  _isFragmentedIsobmff() {
    return !1;
  }
}
class Rt extends Qi {
  /** Internal constructor. */
  constructor(e = {}) {
    if (!e || typeof e != "object")
      throw new TypeError("options must be an object.");
    if (e.fastStart !== void 0 && ![!1, "in-memory", "reserve", "fragmented"].includes(e.fastStart))
      throw new TypeError("options.fastStart, when provided, must be false, 'in-memory', 'reserve', or 'fragmented'.");
    if (e.minimumFragmentDuration !== void 0 && (!Er(e.minimumFragmentDuration) || e.minimumFragmentDuration < 0))
      throw new TypeError("options.minimumFragmentDuration, when provided, must be a non-negative number.");
    if (e.onFtyp !== void 0 && typeof e.onFtyp != "function")
      throw new TypeError("options.onFtyp, when provided, must be a function.");
    if (e.onMoov !== void 0 && typeof e.onMoov != "function")
      throw new TypeError("options.onMoov, when provided, must be a function.");
    if (e.onMdat !== void 0 && typeof e.onMdat != "function")
      throw new TypeError("options.onMdat, when provided, must be a function.");
    if (e.onMoof !== void 0 && typeof e.onMoof != "function")
      throw new TypeError("options.onMoof, when provided, must be a function.");
    if (e.metadataFormat !== void 0 && !["mdir", "mdta", "udta", "auto"].includes(e.metadataFormat))
      throw new TypeError("options.metadataFormat, when provided, must be either 'auto', 'mdir', 'mdta', or 'udta'.");
    super(), this._options = e;
  }
  getSupportedTrackCounts() {
    return {
      video: { min: 0, max: 4294967295 },
      audio: { min: 0, max: 4294967295 },
      subtitle: { min: 0, max: 4294967295 },
      total: { min: 0, max: 4294967295 }
    };
  }
  get supportsVideoTransformationMetadata() {
    return !0;
  }
  get supportsTimestampedMediaData() {
    return !0;
  }
  get negativeTimestampSupport() {
    return "full";
  }
  /** @internal */
  _createMuxer(e) {
    return new fo(e, this);
  }
  /** @internal */
  _isFragmentedIsobmff() {
    return this._options.fastStart === "fragmented";
  }
}
class Xi extends Rt {
  /** Creates a new {@link Mp4OutputFormat} configured with the specified `options`. */
  constructor(e) {
    super(e);
  }
  /** @internal */
  get _name() {
    return "MP4";
  }
  get fileExtension() {
    return ".mp4";
  }
  get mimeType() {
    return "video/mp4";
  }
  getSupportedCodecs() {
    return [
      ...le,
      ...St,
      // These are supported via ISO/IEC 23003-5:
      "pcm-s16",
      "pcm-s16be",
      "pcm-s24",
      "pcm-s24be",
      "pcm-s32",
      "pcm-s32be",
      "pcm-f32",
      "pcm-f32be",
      "pcm-f64",
      "pcm-f64be",
      ...Oe
    ];
  }
  /** @internal */
  _codecUnsupportedHint(e) {
    return new Ki().getSupportedCodecs().includes(e) ? " Switching to MOV will grant support for this codec." : "";
  }
}
class wi extends Rt {
  /** Creates a new {@link CmafOutputFormat} configured with the specified `options`. */
  constructor(e) {
    super(e);
  }
  /** @internal */
  get _name() {
    return "CMAF";
  }
  get fileExtension() {
    return ".m4s";
  }
  get mimeType() {
    return "video/mp4";
  }
  getSupportedCodecs() {
    return [
      ...le,
      ...St,
      // These are supported via ISO/IEC 23003-5:
      "pcm-s16",
      "pcm-s16be",
      "pcm-s24",
      "pcm-s24be",
      "pcm-s32",
      "pcm-s32be",
      "pcm-f32",
      "pcm-f32be",
      "pcm-f64",
      "pcm-f64be",
      ...Oe
    ];
  }
}
class Ki extends Rt {
  /** Creates a new {@link MovOutputFormat} configured with the specified `options`. */
  constructor(e) {
    super(e);
  }
  /** @internal */
  get _name() {
    return "MOV";
  }
  get fileExtension() {
    return ".mov";
  }
  get mimeType() {
    return "video/quicktime";
  }
  getSupportedCodecs() {
    return [
      ...le,
      ...$e
    ];
  }
  /** @internal */
  _codecUnsupportedHint(e) {
    return new Xi().getSupportedCodecs().includes(e) ? " Switching to MP4 will grant support for this codec." : "";
  }
}
const yi = ["video", "audio", "subtitle"];
class Le {
  /** @internal */
  constructor(e, i, r, s, n) {
    this.id = e, this.output = i, this.type = r, this.source = s, this.metadata = n;
  }
  /** Returns true if and only if this track is a video track. */
  isVideoTrack() {
    return this.type === "video";
  }
  /** Returns true if and only if this track is an audio track. */
  isAudioTrack() {
    return this.type === "audio";
  }
  /** Returns true if and only if this track is a subtitle track. */
  isSubtitleTrack() {
    return this.type === "subtitle";
  }
  /**
   * Returns true if and only if this track can be paired with the given other track. Pairability can be set using
   * the {@link BaseTrackMetadata.group} option.
   */
  canBePairedWith(e) {
    if (!(e instanceof Le))
      throw new TypeError("other must be an OutputTrack.");
    if (this === e)
      return !1;
    const i = Vt(this.metadata.group), r = Vt(e.metadata.group);
    for (const s of i)
      if (this.type !== e.type && r.some((a) => s === a) || r.some((a) => s._pairedGroups.has(a)))
        return !0;
    return !1;
  }
}
class Eo extends Le {
  /** @internal */
  constructor(e, i, r, s) {
    super(e, i, "video", r, s);
  }
}
class _o extends Le {
  /** @internal */
  constructor(e, i, r, s) {
    super(e, i, "audio", r, s);
  }
}
class vo extends Le {
  /** @internal */
  constructor(e, i, r, s) {
    super(e, i, "subtitle", r, s);
  }
}
class ze {
  /** Creates a new {@link OutputTrackGroup}. */
  constructor() {
    this._pairedGroups = /* @__PURE__ */ new Set();
  }
  /**
   * Marks this group as being pairable with another group, symmetrically. Output tracks where each track is assigned
   * to one half of a group pairing are then considered pairable.
   *
   * You cannot pair a group with itself.
   */
  pairWith(e) {
    if (!(e instanceof ze))
      throw new TypeError("other must be an OutputTrackGroup.");
    if (this === e)
      throw new TypeError("Cannot pair a group with itself.");
    this._pairedGroups.add(e), e._pairedGroups.add(this);
  }
}
const pt = (t) => {
  if (!t || typeof t != "object")
    throw new TypeError("metadata must be an object.");
  if (t.languageCode !== void 0 && !fr(t.languageCode))
    throw new TypeError("metadata.languageCode, when provided, must be a three-letter, ISO 639-2/T language code.");
  if (t.name !== void 0 && typeof t.name != "string")
    throw new TypeError("metadata.name, when provided, must be a string.");
  if (t.disposition !== void 0 && Br(t.disposition), t.maximumPacketCount !== void 0 && (!Number.isInteger(t.maximumPacketCount) || t.maximumPacketCount < 0))
    throw new TypeError("metadata.maximumPacketCount, when provided, must be a non-negative integer.");
  if (t.bitrate !== void 0 && (!Number.isFinite(t.bitrate) || t.bitrate < 0))
    throw new TypeError("metadata.bitrate, when provided, must be a non-negative number.");
  if (t.averageBitrate !== void 0 && (!Number.isFinite(t.averageBitrate) || t.averageBitrate < 0))
    throw new TypeError("metadata.averageBitrate, when provided, must be a non-negative number.");
  if (t.group !== void 0 && !(t.group instanceof ze) && (!Array.isArray(t.group) || t.group.some((e) => !(e instanceof ze))))
    throw new TypeError("metadata.group, when provided, must be an OutputTrackGroup instance or an array of OutputTrackGroup instances.");
};
class Co extends xt {
  /**
   * The target to which the root file will be written. Throws when using {@link PathedTarget} with an async callback;
   * prefer the `'target'` event for those cases.
   */
  get target() {
    const e = "Output.target cannot be used when using PathedTarget with an async callback. Use the 'target' event instead.";
    if (this._rootTargetPromise)
      throw new TypeError(e);
    const i = this._getRootTarget();
    if (be(i))
      throw new TypeError(e);
    return i;
  }
  /**
   * Creates a new instance of {@link Output} which can then be used to create a new media file according to the
   * specified {@link OutputOptions}.
   */
  constructor(e) {
    if (super(), this.state = "pending", this.defaultTrackGroup = new ze(), this.tracks = [], this._onFinalize = null, this._unfinalizedTargets = /* @__PURE__ */ new Set(), this._rootWriterPromise = null, this._startPromise = null, this._cancelPromise = null, this._finalizePromise = null, this._mutex = new Ei(), this._metadataTags = {}, this._rootTarget = null, this._rootTargetPromise = null, this._firstMediaStreamTimestamp = null, !e || typeof e != "object")
      throw new TypeError("options must be an object.");
    if (!(e.format instanceof Qi))
      throw new TypeError("options.format must be an OutputFormat.");
    if (!(e.target instanceof X || e.target instanceof ht))
      throw new TypeError("options.target must be a Target or a PathedTarget.");
    if (e.target instanceof X && this._rememberTarget(e.target), e.initTarget !== void 0 && !(e.initTarget instanceof X) && typeof e.initTarget != "function")
      throw new Error("options.initTarget, when provided, must be a Target or a function that returns or resolves to a Target.");
    if (e.onFinalize !== void 0 && typeof e.onFinalize != "function")
      throw new TypeError("options.onFinalize, when provided, must be a function.");
    this.format = e.format, this._target = e.target, this._onFinalize = e.onFinalize ?? null, this._initTarget = e.initTarget ?? null, this._initTarget instanceof X && this._rememberTarget(this._initTarget), this._muxer = e.format._createMuxer(this);
  }
  /** @internal */
  _getTargetValidated(e) {
    h(this._target instanceof ht);
    const i = this._target.getTarget(e), r = (s) => {
      if (!(s instanceof X))
        throw new TypeError("getTarget must return a Target.");
      return s;
    };
    return be(i) ? i.then(r) : r(i);
  }
  /** @internal */
  async _getTarget(e) {
    h(this._target instanceof ht);
    const i = await this._getTargetValidated(e);
    return this._emit("target", { target: i, request: e, isRoot: e.isRoot }), this.state === "canceled" ? await i._close() : this._rememberTarget(i), i;
  }
  /** @internal */
  _rememberTarget(e) {
    this._unfinalizedTargets.add(e), e.on("finalized", () => this._unfinalizedTargets.delete(e), { once: !0 });
  }
  /** @internal */
  async _getInitTarget() {
    if (h(this._initTarget !== null), this._initTarget instanceof X)
      return this._initTarget;
    const e = await this._initTarget();
    return this.state === "canceled" ? await e._close() : this._rememberTarget(e), e;
  }
  /** @internal */
  _hasInitTarget() {
    return this._initTarget !== null;
  }
  /** @internal */
  _getRootTarget() {
    if (this._rootTarget)
      return this._rootTarget;
    if (this._rootTargetPromise)
      return this._rootTargetPromise;
    if (this._target instanceof X)
      return this._emit("target", { target: this._target, request: null, isRoot: !0 }), this._rootTarget = this._target, this._target;
    const e = {
      path: this._target.rootPath,
      isRoot: !0,
      mimeType: this.format.mimeType
    }, i = this._getTargetValidated(e), r = (s) => (this.state === "canceled" ? s._close() : this._rememberTarget(s), this._emit("target", { target: s, request: e, isRoot: !0 }), this._rootTarget = s, s);
    return be(i) ? this._rootTargetPromise = i.then(r) : r(i);
  }
  /** @internal */
  _getRootWriter(e) {
    return this._rootWriterPromise ??= (async () => {
      const i = await this._getRootTarget(), r = new vt(i, typeof e == "boolean" ? e : e(i));
      return r.start(), r;
    })();
  }
  /** Adds a video track to the output with the given source. Can only be called before the output is started. */
  addVideoTrack(e, i = {}) {
    if (!(e instanceof Gi))
      throw new TypeError("source must be a VideoSource.");
    if (pt(i), i.rotation !== void 0 && ![0, 90, 180, 270].includes(i.rotation))
      throw new TypeError(`Invalid video rotation: ${i.rotation}. Has to be 0, 90, 180 or 270.`);
    if (i.flip !== void 0 && typeof i.flip != "boolean")
      throw new TypeError("metadata.flip, when provided, must be a boolean.");
    if (i.transformationMatrix !== void 0 && (!Array.isArray(i.transformationMatrix) || i.transformationMatrix.length !== 9 || !i.transformationMatrix.every((s) => Number.isFinite(s))))
      throw new TypeError("metadata.transformationMatrix, when provided, must be an array of 9 finite numbers.");
    if (i.frameRate !== void 0 && (!Number.isFinite(i.frameRate) || i.frameRate <= 0))
      throw new TypeError(`Invalid video frame rate: ${i.frameRate}. Must be a positive number.`);
    if (i.hasOnlyKeyPackets !== void 0 && typeof i.hasOnlyKeyPackets != "boolean")
      throw new TypeError("metadata.hasOnlyKeyPackets, when provided, must be a boolean.");
    if (i.canBeTransparent !== void 0 && typeof i.canBeTransparent != "boolean")
      throw new TypeError("metadata.canBeTransparent, when provided, must be a boolean.");
    if (i.decoderConfig !== void 0 && Mi({ decoderConfig: i.decoderConfig }, e._codec), i.primingPacket !== void 0) {
      if (!(i.primingPacket instanceof Ee))
        throw new TypeError("metadata.primingPacket, when provided, must be an EncodedPacket.");
      if (i.decoderConfig === void 0)
        throw new TypeError("metadata.primingPacket can only be provided alongside metadata.decoderConfig.");
    }
    const r = { ...i };
    return r.group ??= this.defaultTrackGroup, this._addTrack(new Eo(this.tracks.length + 1, this, e, r));
  }
  /** Adds an audio track to the output with the given source. Can only be called before the output is started. */
  addAudioTrack(e, i = {}) {
    if (!(e instanceof bo))
      throw new TypeError("source must be an AudioSource.");
    if (pt(i), i.decoderConfig !== void 0 && Fi({ decoderConfig: i.decoderConfig }, e._codec), i.primingPacket !== void 0) {
      if (!(i.primingPacket instanceof Ee))
        throw new TypeError("metadata.primingPacket, when provided, must be an EncodedPacket.");
      if (i.decoderConfig === void 0)
        throw new TypeError("metadata.primingPacket can only be provided alongside metadata.decoderConfig.");
    }
    const r = { ...i };
    return r.group ??= this.defaultTrackGroup, this._addTrack(new _o(this.tracks.length + 1, this, e, r));
  }
  /** Adds a subtitle track to the output with the given source. Can only be called before the output is started. */
  addSubtitleTrack(e, i = {}) {
    if (!(e instanceof To))
      throw new TypeError("source must be a SubtitleSource.");
    pt(i);
    const r = { ...i };
    return r.group ??= this.defaultTrackGroup, this._addTrack(new vo(this.tracks.length + 1, this, e, r));
  }
  /**
   * Sets descriptive metadata tags about the media file, such as title, author, date, or cover art. When called
   * multiple times, only the metadata from the last call will be used.
   *
   * Can only be called before the output is started.
   */
  setMetadataTags(e) {
    if (Sr(e), this.state !== "pending")
      throw new Error("Cannot set metadata tags after output has been started or canceled.");
    this._metadataTags = e;
  }
  /** @internal */
  _addTrack(e) {
    if (this.state !== "pending")
      throw new Error("Cannot add track after output has been started or canceled.");
    if (e.source._connectedTrack)
      throw new Error("Source is already used for a track.");
    const i = this.format.getSupportedTrackCounts(), r = this.tracks.reduce((o, a) => o + (a.type === e.type ? 1 : 0), 0), s = i[e.type].max;
    if (r === s)
      throw new Error(s === 0 ? `${this.format._name} does not support ${e.type} tracks.` : `${this.format._name} does not support more than ${s} ${e.type} track${s === 1 ? "" : "s"}.`);
    const n = i.total.max;
    if (this.tracks.length === n)
      throw new Error(`${this.format._name} does not support more than ${n} tracks${n === 1 ? "" : "s"} in total.`);
    if (e.isVideoTrack()) {
      const o = this.format.getSupportedVideoCodecs();
      if (o.length === 0)
        throw new Error(`${this.format._name} does not support video tracks.` + this.format._codecUnsupportedHint(e.source._codec));
      if (!o.includes(e.source._codec))
        throw new Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported video codecs are: ${o.map((a) => `'${a}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
    } else if (e.isAudioTrack()) {
      const o = this.format.getSupportedAudioCodecs();
      if (o.length === 0)
        throw new Error(`${this.format._name} does not support audio tracks.` + this.format._codecUnsupportedHint(e.source._codec));
      if (!o.includes(e.source._codec))
        throw new Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported audio codecs are: ${o.map((a) => `'${a}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
    } else if (e.isSubtitleTrack()) {
      const o = this.format.getSupportedSubtitleCodecs();
      if (o.length === 0)
        throw new Error(`${this.format._name} does not support subtitle tracks.` + this.format._codecUnsupportedHint(e.source._codec));
      if (!o.includes(e.source._codec))
        throw new Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported subtitle codecs are: ${o.map((a) => `'${a}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
    }
    return this.tracks.push(e), e.source._connectedTrack = e, e;
  }
  /**
   * Whether the output has enough tracks (of the correct type) to be started, based on the requirements of the output
   * format.
   */
  hasEnoughTracks() {
    const e = this.format.getSupportedTrackCounts();
    for (const r of yi) {
      const s = this.tracks.reduce((o, a) => o + (a.type === r ? 1 : 0), 0), n = e[r].min;
      if (s < n)
        return !1;
    }
    const i = e.total.min;
    return !(this.tracks.length < i);
  }
  /**
   * Starts the creation of the output file. This method should be called after all tracks have been added. Only after
   * the output has started can media samples be added to the tracks.
   *
   * @returns A promise that resolves when the output has successfully started and is ready to receive media samples.
   */
  async start() {
    const e = this.format.getSupportedTrackCounts();
    for (const r of yi) {
      const s = this.tracks.reduce((o, a) => o + (a.type === r ? 1 : 0), 0), n = e[r].min;
      if (s < n)
        throw new Error(n === e[r].max ? `${this.format._name} requires exactly ${n} ${r} track${n === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${n} ${r} track${n === 1 ? "" : "s"}.`);
    }
    const i = e.total.min;
    if (this.tracks.length < i)
      throw new Error(i === e.total.max ? `${this.format._name} requires exactly ${i} track${i === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${i} track${i === 1 ? "" : "s"}.`);
    if (this.state === "canceled")
      throw new Error("Output has been canceled.");
    return this._startPromise ? (k._warn("Output has already been started."), this._startPromise) : this._startPromise = (async () => {
      this.state = "started";
      const r = this._mutex.acquire();
      try {
        await this._muxer.start();
        const s = this.tracks.map((n) => n.source._start());
        await Promise.all(s);
      } finally {
        (await r)();
      }
    })();
  }
  /**
   * Resolves with the full MIME type of the output file, including track codecs.
   *
   * The returned promise will resolve only once the precise codec strings of all tracks are known.
   */
  getMimeType() {
    return this._muxer.getMimeType();
  }
  /**
   * Cancels the creation of the output file, releasing internal resources like encoders and preventing further
   * samples from being added.
   *
   * @returns A promise that resolves once all internal resources have been released.
   */
  async cancel() {
    if (this.state === "canceled")
      return this._cancelPromise ?? void 0;
    if (this.state === "finalizing" || this.state === "finalized") {
      this.state === "finalized" && k._warn("Output has already been finalized.");
      return;
    }
    return this._cancelPromise = (async () => {
      this.state = "canceled";
      const e = await this._mutex.acquire();
      try {
        const i = this.tracks.map((r) => r.source._flushOrWaitForOngoingClose(!0));
        await Promise.all(i), await Promise.all([...this._unfinalizedTargets].map((r) => r._close())), this._unfinalizedTargets.clear();
      } finally {
        e();
      }
    })();
  }
  /**
   * Finalizes the output file. This method must be called after all media samples across all tracks have been added.
   * Once the Promise returned by this method completes, the output file is ready.
   */
  async finalize() {
    if (this.state === "pending")
      throw new Error("Cannot finalize before starting.");
    if (this.state === "canceled")
      throw new Error("Cannot finalize after canceling.");
    return this._finalizePromise ? (k._warn("Output has already been finalized."), this._finalizePromise) : this._finalizePromise = (async () => {
      this.state = "finalizing";
      const e = await this._mutex.acquire();
      try {
        const i = this.tracks.map((r) => r.source._flushOrWaitForOngoingClose(!1));
        if (await Promise.all(i), await this._muxer.finalize(), this._rootWriterPromise) {
          const r = await this._rootWriterPromise;
          r.finalized || (await r.flush(), await r.finalize());
        }
        this._onFinalize && await this._onFinalize(), this.state = "finalized";
      } catch (i) {
        throw this.state = "canceled", i;
      } finally {
        await Promise.all([...this._unfinalizedTargets].map((i) => i._close().catch(() => {
        }))), this._unfinalizedTargets.clear(), e();
      }
    })();
  }
}
let ye, Re, _e, Me = 5, bi = 256 * 1024 * 1024, qe = 0, ve = [];
const je = (t, e, i = []) => self.postMessage({ id: t, value: e }, { transfer: i });
self.onmessage = async (t) => {
  const { id: e, type: i, value: r } = t.data;
  try {
    if (i === "start") {
      Me = r.fps, bi = r.maxBytes, qe = 0, ve = [];
      const s = r.width + r.width % 2, n = r.height + r.height % 2;
      if (!await Hs("avc", { width: s, height: n, frameRate: Me })) throw new Error("Chrome cannot encode this MP4 size locally. Try a smaller crop.");
      _e = new OffscreenCanvas(s, n), ye = new Co({
        format: new Xi({ fastStart: "fragmented" }),
        target: new ao(new WritableStream({ write(o) {
          if (qe += o.byteLength, qe > bi) throw new Error("Movie exceeds the configured size limit. Select fewer frames or a smaller crop.");
          ve.push(o.slice());
        } }))
      }), Re = new yo(_e, { codec: "avc", quality: new he({ bitrate: 4e6 }) }), ye.addVideoTrack(Re, { frameRate: Me }), await ye.start(), je(e, !0);
    } else if (i === "frame") {
      if (!_e || !Re) throw new Error("Movie encoder is not ready.");
      const s = _e.getContext("2d");
      s.fillStyle = "#000", s.fillRect(0, 0, _e.width, _e.height), s.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0), await Re.add(r.index / Me, 1 / Me), je(e, !0);
    } else if (i === "finish") {
      if (!ye) throw new Error("Movie encoder is not ready.");
      await ye.finalize();
      const s = new Uint8Array(qe);
      let n = 0;
      for (const o of ve)
        s.set(o, n), n += o.byteLength;
      ve = [], Re?.close(), je(e, s.buffer, [s.buffer]);
    } else i === "cancel" && (await ye?.cancel(), ve = [], je(e, !0));
  } catch (s) {
    await ye?.cancel().catch(() => {
    }), ve = [], self.postMessage({ id: e, error: s instanceof Error ? s.message : String(s) });
  }
};
