/**
 * Server-side AI API Client.
 * Supports Ollama Cloud, Groq, and OpenAI with exponential backoff retries.
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

  // Groq API Fallback option if configured
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch (groqErr) {
      console.warn('[AI Client] Groq API fallback failed, trying primary Ollama endpoint:', (groqErr as Error).message);
    }
  }

  // OpenAI API Fallback option if configured
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch (oaErr) {
      console.warn('[AI Client] OpenAI API fallback failed, trying primary Ollama endpoint:', (oaErr as Error).message);
    }
  }

  let attempt = 0;
  let delayMs = 1000;

  while (attempt < maxRetries) {
    attempt++;
    try {
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
        signal: AbortSignal.timeout(45000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Ollama Cloud API status ${res.status}: ${errText.substring(0, 200)}`);
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

      await new Promise((r) => setTimeout(r, delayMs));
      delayMs *= 2;
    }
  }

  throw new Error('Ollama Cloud request failed');
}
