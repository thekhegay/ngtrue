// A top-level await on a promise nothing settles, and nothing else to do:
// Node drains its event loop and exits with code 13.
await new Promise(() => {});

export const ready = true;
