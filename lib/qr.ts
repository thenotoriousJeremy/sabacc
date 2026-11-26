/**
 * Zero-dependency ISO/IEC 18004 QR Code matrix encoder (Byte mode, ECC Level L, Versions 1–4).
 * Encodes URLs up to 78 UTF-8 bytes into a scannable boolean[][] matrix.
 */

interface VersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewords: number;
  hasAlignment: boolean;
}

const VERSIONS_L: VersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, ecCodewords: 7, hasAlignment: false },
  { version: 2, size: 25, dataCodewords: 34, ecCodewords: 10, hasAlignment: true },
  { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, hasAlignment: true },
  { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, hasAlignment: true },
  { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, hasAlignment: true },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

function computeFormatBits(eclBits: number, mask: number): number {
  const data = (eclBits << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

export function encodeQrMatrix(text: string): boolean[][] | null {
  const bytes = new TextEncoder().encode(text);
  const spec = VERSIONS_L.find(v => bytes.length + 2 <= v.dataCodewords);
  if (!spec) return null;

  // Build bit stream: 0100 (Byte mode) + 8-bit length + payload + terminator + pad bytes.
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);

  const capacityBits = spec.dataCodewords * 8;
  const term = Math.min(4, capacityBits - bits.length);
  pushBits(0, term);
  while (bits.length % 8 !== 0) bits.push(0);

  const data = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    data[i] = byte;
  }
  const pads = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < spec.dataCodewords; i++, p++) {
    data[i] = pads[p % 2];
  }

  const ec = rsEncode(data, spec.ecCodewords);
  const allCodewords = new Uint8Array(data.length + ec.length);
  allCodewords.set(data, 0);
  allCodewords.set(ec, data.length);

  const n = spec.size;
  const modules: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
  const reserved: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));

  const setFunction = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= n || c < 0 || c >= n) return;
    modules[r][c] = dark;
    reserved[r][c] = true;
  };

  const placeFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const ring =
          inside &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFunction(top + dr, left + dc, ring);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, n - 7);
  placeFinder(n - 7, 0);

  if (spec.hasAlignment) {
    const center = n - 7;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        setFunction(center + dr, center + dc, dark);
      }
    }
  }

  for (let i = 8; i < n - 8; i++) {
    if (!reserved[6][i]) setFunction(6, i, i % 2 === 0);
    if (!reserved[i][6]) setFunction(i, 6, i % 2 === 0);
  }

  // Dark module + reserve format areas
  setFunction(n - 8, 8, true);
  for (let i = 0; i <= 8; i++) {
    if (!reserved[8][i]) setFunction(8, i, false);
    if (!reserved[i][8]) setFunction(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!reserved[8][n - 1 - i]) setFunction(8, n - 1 - i, false);
    if (!reserved[n - 1 - i][8]) setFunction(n - 1 - i, 8, false);
  }

  // Place data bits in 2-column vertical zigzags using Mask 0: (r + c) % 2 === 0
  let bitIndex = 0;
  const totalBits = allCodewords.length * 8;
  let upward = true;

  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      const r = upward ? n - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (reserved[r][c]) continue;
        let dark = false;
        if (bitIndex < totalBits) {
          dark = ((allCodewords[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
        if ((r + c) % 2 === 0) dark = !dark;
        modules[r][c] = dark;
      }
    }
    upward = !upward;
  }

  // Write Format Information for Level L (0b01) + Mask 0 (0b000)
  const fmt = computeFormatBits(0b01, 0);
  const fmtBit = (i: number) => ((fmt >> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) modules[8][i] = fmtBit(14 - i);
  modules[8][7] = fmtBit(8);
  modules[8][8] = fmtBit(7);
  modules[7][8] = fmtBit(6);
  for (let i = 9; i <= 14; i++) modules[14 - i][8] = fmtBit(14 - i);

  for (let i = 0; i < 8; i++) modules[8][n - 1 - i] = fmtBit(i);
  for (let i = 8; i < 15; i++) modules[n - 15 + i][8] = fmtBit(i);

  return modules;
}
