let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

export function info(msg: string): void {
  console.log(`[info] ${msg}`);
}

export function debug(msg: string): void {
  if (verbose) {
    console.log(`[debug] ${msg}`);
  }
}

export function warn(msg: string): void {
  console.warn(`[warn] ${msg}`);
}

export function error(msg: string): void {
  console.error(`[error] ${msg}`);
}
