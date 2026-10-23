// The same wait with a timer keeping the event loop alive, so the process
// never exits by itself and only the timeout ends it — and a SIGTERM handler,
// the way a server module's graceful shutdown installs one, so a timeout that
// only asked the process to stop would wait on it forever.
process.on('SIGTERM', () => {});
await new Promise(() => setInterval(() => {}, 60_000));

export const ready = true;
