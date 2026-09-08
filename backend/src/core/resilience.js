export async function withTimeout(operation, timeoutMs, label = 'Operation') {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

export async function withRetries(operation, { retries = 0, delayMs = 0, shouldRetry = () => true } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await operation(attempt); }
    catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) break;
      if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}
