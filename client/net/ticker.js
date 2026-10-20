// A steady fixed-rate tick for the in-browser game host. Browsers throttle timers in background tabs
// (down to once a second), which would freeze the match for everyone; timers inside a dedicated
// Worker keep running, so the worker just sends "tick" and the page catches up on the real clock.
export function startTicker(rate, fn) {
  const step = 1000 / rate;
  let next = performance.now();
  const run = () => {
    const now = performance.now();
    let n = 0;
    while (now >= next && n < 6) { fn(); next += step; n++; }
    if (now - next > 250) next = now; // fell far behind (machine slept): resync
  };
  try {
    const src = `let t=setInterval(()=>postMessage(0),${Math.max(4, Math.floor(step / 2))});onmessage=()=>clearInterval(t);`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = run;
    return () => { w.postMessage('stop'); w.terminate(); };
  } catch {
    const id = setInterval(run, Math.max(4, Math.floor(step / 2)));
    return () => clearInterval(id);
  }
}
