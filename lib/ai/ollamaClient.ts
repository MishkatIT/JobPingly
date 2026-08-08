/**
 * Reusable server-side Ollama API Client.
 * All requests happen strictly from backend code.
 * Implements exponential backoff retries for transient AI/network failures.
 */

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:31b';
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'https://api.ollama.com').replace(/\/$/, '');

export interface OllamaRequestPayload {
  prompt: string;
  system?: string;
  temperature?: number;
  model?: string;
}

export async function callOllamaCloud(
  prompt: string,
  systemPrompt?: string,
  maxRetries = 3
): Promise<string> {
  const apiKey = process.env.OLLAMA_API_KEY || OLLAMA_API_KEY;
  const model = process.env.OLLAMA_MODEL || OLLAMA_MODEL;
  const baseUrl = (process.env.OLLAMA_BASE_URL || OLLAMA_BASE_URL).replace(/\/$/, '');

  let attempt = 0;
  let delayMs = 1000;

  while (attempt < maxRetries) {
    attempt++;
    try {
      // Endpoint handles Ollama Cloud generate or chat completion endpoint
      const endpoint = `${baseUrl}/api/generate`;
      const body = {
        model,
        prompt,
        system: systemPrompt,
        stream: false,
        options: {
          temperature: 0.1,
        },
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000), // 45s timeout
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Ollama Cloud API returned status ${res.status}: ${errText.substring(0, 200)}`);
      }

      const data = await res.json();
      const responseText = data.response || data.message?.content || (typeof data === 'string' ? data : JSON.stringify(data));

      if (!responseText) {
        throw new Error('Empty response payload from Ollama Cloud API.');
      }

      return responseText;
    } catch (err: any) {
      console.warn(`[Ollama Client] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);

      if (attempt >= maxRetries) {
        throw new Error(`Ollama Cloud request failed after ${maxRetries} attempts: ${err.message}`);
      }

      // Exponential backoff
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs *= 2;
    }
  }

  throw new Error('Ollama Cloud request failed');
}
