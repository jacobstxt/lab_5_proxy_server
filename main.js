import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { Command } from 'commander';
import superagent from 'superagent';

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



const ALLOWED_METHODS = ['GET', 'PUT', 'DELETE'];


function send(res, status, text, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...extraHeaders,
  });
  res.end(text + '\n');
}

function parseCode(req) {
  const { pathname } = new URL(req.url, 'http://localhost');
  const match = /^\/(\d{3})$/.exec(pathname);
  return match ? match[1] : null;
}

async function handleGet(res, code, filePath) {
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': data.length,
      'X-Cache': 'HIT',
    });
    return res.end(data);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err; // інша помилка диска -> 500
  }

  let data;
  try {
    const response = await superagent
      .get(`https://http.cat/${code}`)
      .buffer(true)
      .parse(superagent.parse.image)
      .timeout({ response: 5000, deadline: 10000 });
    data = response.body;
  } catch (err) {
    console.error(`http.cat error for ${code}:`, err.status ?? err.code ?? err.message);
    return send(res, 404, 'Not Found: image is not in cache and not available on http.cat');
  }

  await fs.writeFile(filePath, data);
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': data.length,
    'X-Cache': 'MISS',
  });
  res.end(data);
}


const server = http.createServer(async (req, res) => {
  try {
    if (!ALLOWED_METHODS.includes(req.method)) {
      return send(res, 405, 'Method Not Allowed', {
        Allow: ALLOWED_METHODS.join(', '),
      });
    }
    const code = parseCode(req);
    if (code === null) {
      return send(res, 400, 'Bad Request: use /<три цифри>, наприклад /404');
    }
    const filePath = path.join(cacheDir, `${code}.jpg`);

    switch (req.method) {
      case 'GET':
         return await handleGet(res, code, filePath);
      case 'PUT':
      case 'DELETE':
        return send(res, 501, `${req.method} ${filePath}: ще не реалізовано`);
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      send(res, 500, 'Internal Server Error');
    } else {
      res.end();
    }
  }
});

server.listen(port, host);
await once(server, 'listening');
console.log(`Server running at: http://${host}:${port}, cache folder: ${cacheDir}`);