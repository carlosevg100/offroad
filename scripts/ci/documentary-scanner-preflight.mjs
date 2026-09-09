import {connect} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';

function command(bytes) {
  return new Promise((resolve, reject) => {
    const socket = connect({host: '127.0.0.1', port: 3310});
    const chunks = [];
    socket.setTimeout(5000, () => socket.destroy(new Error('scanner_preflight_timeout')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(bytes));
    socket.on('data', chunk => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).includes(0)) socket.end();
    });
    socket.on('end', () => resolve(Buffer.concat(chunks).toString().replace(/\0$/, '').trim()));
  });
}
function stream(bytes) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  return command(Buffer.concat([Buffer.from('zINSTREAM\0'), size, bytes, Buffer.alloc(4)]));
}
const deadline = Date.now() + 60000;
let ready = false;
while (Date.now() < deadline) {
  try { if (await command(Buffer.from('zPING\0')) === 'PONG') { ready = true; break; } } catch {}
  await delay(1000);
}
if (!ready) throw new Error('scanner_preflight_unavailable');
const version = await command(Buffer.from('zVERSION\0'));
if (!version.startsWith('ClamAV ') || !version.includes('/')) throw new Error('scanner_definitions_unavailable');
if (await stream(Buffer.from('company,revenue\nSynthetic clean control,100\n')) !== 'stream: OK') throw new Error('scanner_clean_control_failed');
// Standard harmless EICAR antivirus control, sent only to the local daemon in memory.
const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
const negative = await stream(eicar);
if (!/^stream: .*Eicar.* FOUND$/i.test(negative)) throw new Error('scanner_negative_control_failed');
console.log(JSON.stringify({event:'documentary.scanner.preflight',version,cleanControl:'passed',eicarControl:'detected'}));
