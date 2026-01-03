// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

class Memory64 {
  constructor() {
    this.store = new Map();  // BigInt → value
  }
  
  read(addr, width) {
    // TODO handle "high tetra" which is not really a width
    // but can be passed in similarly to one

    // TODO: make width an enum: either 1, 2, 4, 8
    // ("byte", "wyde", "tetra", or "octa")
    // or "high tetra"

    let addr_rounded = (addr / width) * width;
    let result = 0n;
    for (let i = 0; i < count; i++) {
        let byte = this.store.get(addr_rounded + BigInt(i)) ?? 0n;
        result |= byte
        if (i < count - 1) {
            // TODO handle signed vs unsigned loading operations
            result = result << 8n;
        }
    }
    return result;
  }
  
  write(addr, width, value) {
    // TODO mirror the logic in read for write
    // TODO handle overflow in 
    this.store.set(addr, value);
  }
  
  // Handle alignment, multi-byte reads, etc.
  readBytes(addr, count) {
    let result = 0n;
    for (let i = 0; i < count; i++) {
      let byte = BigInt(this.read(addr + BigInt(i)) ?? 0);
      result |= byte << (BigInt(i) * 8n);
    }
    return result;
  }
}

// class MMIX {
//     constructor() {
//         this.mem = new Memory64();
//         this.reg = new BigUint64Array(256);
//         this.sreg = new BigUint64Array(32);
//     }
// }

const mmix = {
    mem: new Memory64(),
    reg: new BigUint64Array(256),
    sreg: new BigUint64Array(32),
}
// TODO render the state of the mmix machine on the screen in a canvas.