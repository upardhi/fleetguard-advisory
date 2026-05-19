import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { REQUEST_TIMEOUT_MS } from './constants';

export function createAxiosClient(config?: AxiosRequestConfig): AxiosInstance {
  const instance = axios.create({
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      Connection: 'keep-alive',
    },
    ...config,
  });

  return instance;
}

export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 500
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;
    await new Promise((res) => setTimeout(res, delayMs));
    return fetchWithRetry(fn, retries - 1, delayMs * 2);
  }
}

export const httpClient = createAxiosClient();
