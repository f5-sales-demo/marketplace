type OriginalCaptureSource = {
  name: string;
  close(): void | Promise<void>;
};

type OriginalGuestSources = {
  nodeName: string;
  round?: Promise<unknown>;
  finalWorker?: { dispose(): Promise<void> };
  worker?: { dispose(): Promise<void> };
  binding?: { close(): void };
};

/** Attempt every independent original source in order. This retires existing
 * sources only; native group absence and complete capture require their own
 * witnesses. Any failure remains a failure after the other sources settle. */
export async function closeOriginalCaptureSources(sources: readonly OriginalCaptureSource[]): Promise<void> {
  const failures: unknown[] = [];
  const names: string[] = [];
  for (const source of sources) {
    try {
      await source.close();
    } catch (error) {
      failures.push(error);
      names.push(source.name);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, `Original capture source closure incomplete: ${names.join(', ')}`);
}

/** A failed round is already settled and must not prevent disposal. Worker
 * disposal failures keep the original binding alive for independent recovery;
 * neither failure may prevent another node's sources from being retired. */
export async function closeOriginalGuestSources(nodes: readonly OriginalGuestSources[]): Promise<void> {
  await closeOriginalCaptureSources(
    nodes.map((node) => ({
      name: node.nodeName,
      close: () =>
        closeOriginalCaptureSources([
          {
            name: `${node.nodeName}:round`,
            close: async () => {
              await node.round;
            },
          },
          {
            name: `${node.nodeName}:workers-and-binding`,
            close: async () => {
              await closeOriginalCaptureSources([
                {
                  name: `${node.nodeName}:final-worker`,
                  close: async () => {
                    await node.finalWorker?.dispose();
                  },
                },
                {
                  name: `${node.nodeName}:before-worker`,
                  close: async () => {
                    await node.worker?.dispose();
                  },
                },
              ]);
              node.binding?.close();
            },
          },
        ]),
    })),
  );
}
