import { createServer } from 'node:http';
import { loadConfig } from './config.js';

const config = loadConfig();

const server = createServer((_req, res) => {
  res.writeHead(501, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      code: 'not_implemented',
      message: 'Artifact AI API scaffold is present; route handlers are not implemented yet.',
    }),
  );
});

server.listen(config.port, () => {
  console.log(`Artifact API listening on :${config.port}`);
});
