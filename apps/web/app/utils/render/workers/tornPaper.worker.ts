import { runTornPaper, type TornPaperRequest, type TornPaperResult } from './effectPixelTornPaper';

type TornPaperWorkerRequest = {
  id: number;
  request: TornPaperRequest;
};

type TornPaperWorkerResponse =
  | {
      id: number;
      result: TornPaperResult;
    }
  | {
      id: number;
      error: string;
    };

globalThis.addEventListener('message', (event: MessageEvent<TornPaperWorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const result = runTornPaper(request);
    const buffer = result.data.buffer;
    globalThis.postMessage({ id, result } satisfies TornPaperWorkerResponse, {
      transfer: buffer instanceof ArrayBuffer ? [buffer] : [],
    });
  } catch (error) {
    globalThis.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Torn paper worker failed',
    } satisfies TornPaperWorkerResponse);
  }
});
