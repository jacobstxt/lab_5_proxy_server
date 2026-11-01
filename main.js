import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { Command } from 'commander';

const program = new Command();

program
  .helpOption(false) 
  .requiredOption('-h, --host <address>', 'адреса, на якій працює сервер')
  .requiredOption('-p, --port <number>', 'порт сервера')
  .requiredOption('-c, --cache <path>', 'шлях до теки кешу');

program.parse();

const { host, port: portRaw, cache } = program.opts();

const port = Number.parseInt(portRaw, 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Помилка: некоректний порт "${portRaw}"`);
  process.exit(1);
}

const cacheDir = path.resolve(cache);
await fs.mkdir(cacheDir, { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Proxy server is running\n');
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error\n');
  }
});

server.listen(port, host);
await once(server, 'listening');
console.log(`Server running at: http://${host}:${port}, cache folder: ${cacheDir}`);