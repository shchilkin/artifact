import type { IncomingMessage, ServerResponse } from 'node:http';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';
import type { GenerationQueue } from './queue.js';
import { getBullBoardQueue } from './queue.js';

export interface BullBoardHandler {
  basePath: string;
  handle(req: IncomingMessage, res: ServerResponse): boolean;
}

export function createBullBoardHandler(queue: GenerationQueue, basePath = '/admin/queues'): BullBoardHandler | null {
  const bullQueue = getBullBoardQueue(queue);
  if (!bullQueue) return null;

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({
    queues: [new BullMQAdapter(bullQueue)],
    serverAdapter,
  });

  const app = express();
  app.use(basePath, serverAdapter.getRouter());

  return {
    basePath,
    handle(req, res) {
      const pathname = new URL(req.url ?? '/', 'http://artifact.local').pathname;
      if (!pathname.startsWith(basePath)) return false;
      app(req, res);
      return true;
    },
  };
}
