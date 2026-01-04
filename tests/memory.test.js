const { test, describe } = require('node:test');
const assert = require('node:assert');
const { Memory64, MMIX, Width, formatHex, formatSigned } = require('../mmix.js');

describe('Memory64', () => {
  describe('byte operations', () => {
    test('should read and write single bytes', () => {
      const mem = new Memory64();
      mem.writeByte(0n, 0x42n);
      assert.strictEqual(mem.readByte(0n), 0x42n);
    });

    test('should return 0 for uninitialized memory', () => {
      const mem = new Memory64();
      assert.strictEqual(mem.readByte(100n), 0n);
    });
  });

  describe('address alignment', () => {
    test('should align wyde addresses to 2-byte boundary', () => {
      const mem = new Memory64();
      assert.strictEqual(mem.alignAddress(0n, Width.WYDE), 0n);
      assert.strictEqual(mem.alignAddress(1n, Width.WYDE), 0n);
      assert.strictEqual(mem.alignAddress(2n, Width.WYDE), 2n);
      assert.strictEqual(mem.alignAddress(3n, Width.WYDE), 2n);
    });

    test('should align tetra addresses to 4-byte boundary', () => {
      const mem = new Memory64();
      assert.strictEqual(mem.alignAddress(0n, Width.TETRA), 0n);
      assert.strictEqual(mem.alignAddress(1n, Width.TETRA), 0n);
      assert.strictEqual(mem.alignAddress(3n, Width.TETRA), 0n);
      assert.strictEqual(mem.alignAddress(4n, Width.TETRA), 4n);
      assert.strictEqual(mem.alignAddress(7n, Width.TETRA), 4n);
    });

    test('should align octa addresses to 8-byte boundary', () => {
      const mem = new Memory64();
      assert.strictEqual(mem.alignAddress(0n, Width.OCTA), 0n);
      assert.strictEqual(mem.alignAddress(7n, Width.OCTA), 0n);
      assert.strictEqual(mem.alignAddress(8n, Width.OCTA), 8n);
      assert.strictEqual(mem.alignAddress(15n, Width.OCTA), 8n);
    });
  });

  describe('big-endian read/write', () => {
    // Example from MMIX spec page 6: M8[1000] = #0123456789abcdef
    test('should store and load octa in big-endian order (spec example)', () => {
      const mem = new Memory64();
      const addr = 1000n;
      const value = 0x0123456789abcdefn;

      mem.write(addr, Width.OCTA, value);

      // Verify individual bytes are in big-endian order
      assert.strictEqual(mem.readByte(1000n), 0x01n);
      assert.strictEqual(mem.readByte(1001n), 0x23n);
      assert.strictEqual(mem.readByte(1002n), 0x45n);
      assert.strictEqual(mem.readByte(1003n), 0x67n);
      assert.strictEqual(mem.readByte(1004n), 0x89n);
      assert.strictEqual(mem.readByte(1005n), 0xabn);
      assert.strictEqual(mem.readByte(1006n), 0xcdn);
      assert.strictEqual(mem.readByte(1007n), 0xefn);

      // Read back as octa
      assert.strictEqual(mem.read(addr, Width.OCTA), value);
    });

    test('should read wyde correctly', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.OCTA, 0x0123456789abcdefn);

      // LDW from address 1002 should get bytes 1002-1003 = 0x4567
      assert.strictEqual(mem.read(1002n, Width.WYDE), 0x4567n);
    });

    test('should read tetra correctly', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.OCTA, 0x0123456789abcdefn);

      // LDT from address 1000 should get bytes 1000-1003 = 0x01234567
      assert.strictEqual(mem.read(1000n, Width.TETRA), 0x01234567n);
      // LDT from address 1004 should get bytes 1004-1007 = 0x89abcdef
      assert.strictEqual(mem.read(1004n, Width.TETRA), 0x89abcdefn);
    });
  });

  describe('unsigned loading (LDBU, LDWU, LDTU, LDOU)', () => {
    test('should load byte unsigned without sign extension', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.OCTA, 0x0123456789abcdefn);

      // LDBU from 1005 gets 0xab, should NOT sign extend
      assert.strictEqual(mem.read(1005n, Width.BYTE), 0xabn);
    });

    test('should load wyde unsigned without sign extension', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.OCTA, 0x0123456789abcdefn);

      // LDWU from 1004 gets 0x89ab, should NOT sign extend
      assert.strictEqual(mem.read(1004n, Width.WYDE), 0x89abn);
    });
  });

  describe('signed loading (LDB, LDW, LDT, LDO)', () => {
    // From MMIX spec: with $3 = 5, A = 1005
    // LDB $1,$2,$3 sets $1 ← #ffffffffffffffab
    test('should sign extend negative byte (spec example)', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.OCTA, 0x0123456789abcdefn);

      // LDB from 1005 gets 0xab (negative), should sign extend
      const result = mem.read(1005n, Width.BYTE, { signed: true });
      assert.strictEqual(formatHex(result), 'FFFFFFFFFFFFFFAB');
    });

    test('should sign extend negative wyde (spec example)', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.OCTA, 0x0123456789abcdefn);

      // LDW from 1004 gets 0x89ab (negative), should sign extend to #ffffffffffff89ab
      const result = mem.read(1004n, Width.WYDE, { signed: true });
      assert.strictEqual(formatHex(result), 'FFFFFFFFFFFF89AB');
    });

    test('should sign extend negative tetra (spec example)', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.OCTA, 0x0123456789abcdefn);

      // LDT from 1004 gets 0x89abcdef (negative), should sign extend
      const result = mem.read(1004n, Width.TETRA, { signed: true });
      assert.strictEqual(formatHex(result), 'FFFFFFFF89ABCDEF');
    });

    test('should NOT sign extend positive values', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.OCTA, 0x0123456789abcdefn);

      // LDB from 1002 gets 0x45 (positive)
      const result = mem.read(1002n, Width.BYTE, { signed: true });
      assert.strictEqual(result, 0x45n);
    });
  });

  describe('high tetra operations (LDHT, STHT)', () => {
    // LDHT $1,$2,$3 with A=1005 sets $1 ← #89abcdef00000000
    test('should load high tetra correctly (spec example)', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.OCTA, 0x0123456789abcdefn);

      // LDHT from 1005 (aligns to 1004), gets tetra 0x89abcdef, shifts left 32
      const result = mem.read(1005n, Width.HIGH_TETRA);
      assert.strictEqual(formatHex(result), '89ABCDEF00000000');
    });

    test('should store high tetra correctly', () => {
      const mem = new Memory64();
      const value = 0x12345678ABCDEFFFn;

      // STHT stores upper 32 bits (0x12345678) to memory
      mem.write(1000n, Width.HIGH_TETRA, value);

      // Should have stored 0x12345678 in big-endian
      assert.strictEqual(mem.readByte(1000n), 0x12n);
      assert.strictEqual(mem.readByte(1001n), 0x34n);
      assert.strictEqual(mem.readByte(1002n), 0x56n);
      assert.strictEqual(mem.readByte(1003n), 0x78n);
    });
  });

  describe('store operations (STB, STW, STT, STO)', () => {
    test('should store byte (lowest 8 bits)', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.BYTE, 0xFFFFFFFFFFFF1234n);

      // Only lowest byte (0x34) should be stored
      assert.strictEqual(mem.readByte(1000n), 0x34n);
    });

    test('should store wyde (lowest 16 bits)', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.WYDE, 0xFFFFFFFFFFFF1234n);

      // Only lowest 2 bytes (0x1234) should be stored in big-endian
      assert.strictEqual(mem.readByte(1000n), 0x12n);
      assert.strictEqual(mem.readByte(1001n), 0x34n);
    });

    test('should store tetra (lowest 32 bits)', () => {
      const mem = new Memory64();
      mem.write(1000n, Width.TETRA, 0xFFFFFFFF12345678n);

      // Only lowest 4 bytes should be stored in big-endian
      assert.strictEqual(mem.readByte(1000n), 0x12n);
      assert.strictEqual(mem.readByte(1001n), 0x34n);
      assert.strictEqual(mem.readByte(1002n), 0x56n);
      assert.strictEqual(mem.readByte(1003n), 0x78n);
    });

    test('should store with alignment', () => {
      const mem = new Memory64();
      // Store wyde at misaligned address 1001 - should align to 1000
      mem.write(1001n, Width.WYDE, 0xABCDn);

      assert.strictEqual(mem.readByte(1000n), 0xABn);
      assert.strictEqual(mem.readByte(1001n), 0xCDn);
    });
  });

  describe('memory clear and getUsedAddresses', () => {
    test('should clear all memory', () => {
      const mem = new Memory64();
      mem.write(0n, Width.OCTA, 0x123456789ABCDEFn);
      mem.clear();
      assert.strictEqual(mem.readByte(0n), 0n);
    });

    test('should return used addresses sorted', () => {
      const mem = new Memory64();
      mem.writeByte(100n, 1n);
      mem.writeByte(50n, 2n);
      mem.writeByte(200n, 3n);

      const addrs = mem.getUsedAddresses();
      assert.deepStrictEqual(addrs, [50n, 100n, 200n]);
    });
  });
});

describe('MMIX', () => {
  describe('registers', () => {
    test('should read and write general registers', () => {
      const machine = new MMIX();
      machine.setReg(5, 0x123456789ABCDEFn);
      assert.strictEqual(machine.getReg(5), 0x123456789ABCDEFn);
    });

    test('should mask register values to 64 bits', () => {
      const machine = new MMIX();
      machine.setReg(0, (1n << 64n) + 5n);  // Larger than 64 bits
      assert.strictEqual(machine.getReg(0), 5n);
    });

    test('should read and write special registers', () => {
      const machine = new MMIX();
      machine.setSpecialReg(0, 0xABCDn);
      assert.strictEqual(machine.getSpecialReg(0), 0xABCDn);
    });

    test('should get register by name', () => {
      const machine = new MMIX();
      machine.setReg(42, 0x999n);
      assert.strictEqual(machine.getRegByName('$42'), 0x999n);
    });
  });

  describe('reset', () => {
    test('should reset all state', () => {
      const machine = new MMIX();
      machine.setReg(0, 123n);
      machine.mem.write(0n, Width.OCTA, 456n);
      machine.pc = 1000n;

      machine.reset();

      assert.strictEqual(machine.getReg(0), 0n);
      assert.strictEqual(machine.mem.read(0n, Width.OCTA), 0n);
      assert.strictEqual(machine.pc, 0n);
    });
  });
});

describe('formatHex', () => {
  test('should format positive values with leading zeros', () => {
    assert.strictEqual(formatHex(0x123n, 8), '00000123');
    assert.strictEqual(formatHex(0xABCDEFn, 16), '0000000000ABCDEF');
  });

  test('should format negative values as two\'s complement', () => {
    assert.strictEqual(formatHex(-1n, 16), 'FFFFFFFFFFFFFFFF');
  });
});

describe('formatSigned', () => {
  test('should format positive values', () => {
    assert.strictEqual(formatSigned(123n), '123');
  });

  test('should format negative values (high bit set)', () => {
    // 0xFFFFFFFFFFFFFFFF is -1 in signed 64-bit
    const negOne = 0xFFFFFFFFFFFFFFFFn;
    assert.strictEqual(formatSigned(negOne), '-1');
  });
});
