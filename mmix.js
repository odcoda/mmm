// MMIX Machine Emulator
// Based on Knuth's MMIX specification

// Width constants for memory operations
const Width = {
  BYTE: 1,
  WYDE: 2,
  TETRA: 4,
  OCTA: 8,
  HIGH_TETRA: 'high_tetra'  // Special case for LDHT/STHT
};

// Memory class implementing MMIX's 64-bit addressable memory
// MMIX uses big-endian byte ordering
class Memory64 {
  constructor() {
    this.store = new Map();  // BigInt address → byte value (0-255)
  }

  // Align address down to width boundary
  // MMIX naturally aligns: wyde to 2, tetra to 4, octa to 8
  alignAddress(addr, width) {
    if (width === Width.HIGH_TETRA) {
      width = Width.TETRA;
    }
    const mask = BigInt(width - 1);
    return addr & ~mask;
  }

  // Read a single byte from memory
  readByte(addr) {
    return this.store.get(addr) ?? 0n;
  }

  // Write a single byte to memory
  writeByte(addr, value) {
    this.store.set(addr, BigInt(value) & 0xFFn);
  }

  // Read from memory with specified width (big-endian)
  // Options:
  //   signed: boolean - if true, sign-extend the value (for LDB, LDW, LDT, LDO)
  //   highTetra: boolean - if true, shift result left by 32 bits (for LDHT)
  read(addr, width, options = {}) {
    const { signed = false, highTetra = false } = options;

    // Handle high tetra specially
    let actualWidth = width;
    if (width === Width.HIGH_TETRA || highTetra) {
      actualWidth = Width.TETRA;
    }

    // Align address to width boundary
    const alignedAddr = this.alignAddress(addr, actualWidth);

    // Read bytes in big-endian order (most significant byte first)
    let result = 0n;
    for (let i = 0; i < actualWidth; i++) {
      const byte = this.readByte(alignedAddr + BigInt(i));
      result = (result << 8n) | byte;
    }

    // Handle high tetra: shift left by 32 bits, right half is zero
    if (width === Width.HIGH_TETRA || highTetra) {
      result = result << 32n;
    }
    // Handle signed loading (sign extension to 64 bits)
    else if (signed) {
      result = this.signExtend(result, actualWidth);
    }

    return result;
  }

  // Sign extend a value from its original width to 64 bits
  signExtend(value, width) {
    const bits = width * 8;
    const signBit = 1n << BigInt(bits - 1);

    if (value & signBit) {
      // Negative: fill upper bits with 1s
      const mask = (1n << BigInt(bits)) - 1n;
      return value | ~mask;
    }
    return value;
  }

  // Write to memory with specified width (big-endian)
  // Options:
  //   highTetra: boolean - if true, store upper 32 bits of value (for STHT)
  write(addr, width, value, options = {}) {
    const { highTetra = false } = options;

    let actualWidth = width;
    let actualValue = BigInt(value);

    // Handle high tetra: store upper 32 bits
    if (width === Width.HIGH_TETRA || highTetra) {
      actualWidth = Width.TETRA;
      actualValue = actualValue >> 32n;
    }

    // Align address to width boundary
    const alignedAddr = this.alignAddress(addr, actualWidth);

    // Mask value to width
    const mask = (1n << BigInt(actualWidth * 8)) - 1n;
    actualValue = actualValue & mask;

    // Write bytes in big-endian order (most significant byte first)
    for (let i = actualWidth - 1; i >= 0; i--) {
      const byte = actualValue & 0xFFn;
      this.writeByte(alignedAddr + BigInt(i), byte);
      actualValue = actualValue >> 8n;
    }
  }

  // Get all addresses that have been written to (for debugging/display)
  getUsedAddresses() {
    return Array.from(this.store.keys()).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    );
  }

  // Read an octa (8 bytes) as a formatted hex string
  readOctaHex(addr) {
    const value = this.read(addr, Width.OCTA);
    return formatHex(value, 16);
  }

  // Clear all memory
  clear() {
    this.store.clear();
  }
}

// Special register indices (from Table 2 in the spec)
const SpecialReg = {
  rA: 21,   // arithmetic status register
  rB: 0,    // bootstrap register (trip)
  rC: 8,    // cycle counter
  rD: 1,    // dividend register
  rE: 2,    // epsilon register
  rF: 22,   // failure location register
  rG: 19,   // global threshold register
  rH: 3,    // himult register
  rI: 12,   // interval counter
  rJ: 4,    // return-jump register
  rK: 15,   // interrupt mask register
  rL: 20,   // local threshold register
  rM: 5,    // multiplex mask register
  rN: 9,    // serial number
  rO: 10,   // register stack offset
  rP: 23,   // prediction register
  rQ: 16,   // interrupt request register
  rR: 6,    // remainder register
  rS: 11,   // register stack pointer
  rT: 13,   // trap address register
  rU: 17,   // usage counter
  rV: 18,   // virtual translation register
  rW: 24,   // where-interrupted register (trip)
  rX: 25,   // execution register (trip)
  rY: 26,   // Y operand (trip)
  rZ: 27,   // Z operand (trip)
  rBB: 7,   // bootstrap register (trap)
  rTT: 14,  // dynamic trap address register
  rWW: 28,  // where-interrupted register (trap)
  rXX: 29,  // execution register (trap)
  rYY: 30,  // Y operand (trap)
  rZZ: 31   // Z operand (trap)
};

// Format a BigInt as a hexadecimal string with specified width
function formatHex(value, digits = 16) {
  // Handle negative values (two's complement)
  if (value < 0n) {
    value = (1n << 64n) + value;
  }
  return value.toString(16).toUpperCase().padStart(digits, '0');
}

// Format a BigInt as a signed decimal
function formatSigned(value) {
  // Check if negative (bit 63 set)
  if (value & (1n << 63n)) {
    return (value - (1n << 64n)).toString();
  }
  return value.toString();
}

// MMIX Machine state
class MMIX {
  constructor() {
    this.mem = new Memory64();
    this.reg = new BigUint64Array(256);      // General-purpose registers $0-$255
    this.sreg = new BigUint64Array(32);      // Special registers
    this.pc = 0n;                             // Program counter (@)
  }

  // Get a general register value
  getReg(index) {
    return this.reg[index];
  }

  // Set a general register value
  setReg(index, value) {
    this.reg[index] = BigInt(value) & ((1n << 64n) - 1n);
  }

  // Get a special register value
  getSpecialReg(index) {
    return this.sreg[index];
  }

  // Set a special register value
  setSpecialReg(index, value) {
    this.sreg[index] = BigInt(value) & ((1n << 64n) - 1n);
  }

  // Get register by name (e.g., "rA", "$5")
  getRegByName(name) {
    if (name.startsWith('$')) {
      const index = parseInt(name.slice(1), 10);
      return this.getReg(index);
    }
    if (name in SpecialReg) {
      return this.getSpecialReg(SpecialReg[name]);
    }
    throw new Error(`Unknown register: ${name}`);
  }

  // Format register value as hex
  getRegHex(index) {
    return formatHex(this.reg[index], 16);
  }

  // Format special register value as hex
  getSpecialRegHex(index) {
    return formatHex(this.sreg[index], 16);
  }

  // Reset the machine to initial state
  reset() {
    this.mem.clear();
    this.reg.fill(0n);
    this.sreg.fill(0n);
    this.pc = 0n;
  }

  // Get state summary for display
  getStateSummary() {
    return {
      pc: formatHex(this.pc, 16),
      registers: Array.from(this.reg).map((v, i) => ({
        index: i,
        name: `$${i}`,
        value: formatHex(v, 16),
        decimal: formatSigned(v)
      })),
      specialRegisters: Object.entries(SpecialReg).map(([name, index]) => ({
        name,
        index,
        value: formatHex(this.sreg[index], 16),
        decimal: formatSigned(this.sreg[index])
      }))
    };
  }
}

// Create global mmix instance
const mmix = new MMIX();

// Export for use in other modules and testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Memory64, MMIX, Width, SpecialReg, formatHex, formatSigned };
}
