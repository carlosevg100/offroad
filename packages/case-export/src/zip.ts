/**
 * A minimal ZIP writer: stored entries, CRC-32, no compression.
 *
 * A .docx is a ZIP of XML parts. The parts here are a few kilobytes of text, so compression
 * buys nothing worth a dependency that reads untrusted archives; Word, LibreOffice and Google
 * Docs all accept stored entries. The writer is deterministic: same parts, same bytes, which is
 * what lets the data room hash what it sends.
 */

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

/** DOS date/time fields for a fixed instant, so two exports of one material are byte-identical. */
const fixedTime = {time: 0, date: (1 << 5) | 1}; // 1980-01-01 00:00

function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}
function u32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

export function zipStored(entries: ReadonlyArray<{name: string; data: string | Uint8Array}>): Uint8Array {
  const locals: number[] = [];
  const central: number[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(data);
    const header = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(fixedTime.time), ...u16(fixedTime.date),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
    ];
    locals.push(...header, ...name, ...data);
    central.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(fixedTime.time), ...u16(fixedTime.date),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
      ...name,
    );
    offset += header.length + name.length + data.length;
  }
  const end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(central.length), ...u32(offset), ...u16(0)];
  return Uint8Array.from([...locals, ...central, ...end]);
}
