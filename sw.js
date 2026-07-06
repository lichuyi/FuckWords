const AUDIO_CACHE = "fuckwords-audio-us-v3";
const AUDIO_ORIGIN = "https://dict.youdao.com/dictvoice";
const CONCURRENCY = 8;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("fuckwords-audio-us-") && key !== AUDIO_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!isAudioRequest(url)) return;

  event.respondWith(getAudio(event.request));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "cache-audio" || !Array.isArray(data.words)) return;

  event.waitUntil(cacheAudioBatch(data.words, event.source));
});

async function getAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  try {
    await cache.put(request, response.clone());
  } catch {
    // Range/media responses are still playable even when they cannot be cached.
  }
  return response;
}

async function cacheAudioBatch(words, client) {
  const uniqueWords = [...new Set(words.map((word) => String(word || "").trim()).filter(Boolean))];
  let done = 0;
  let failed = 0;
  let cursor = 0;

  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < uniqueWords.length) {
      const word = uniqueWords[cursor++];
      const request = new Request(remoteAudioUrl(word), { mode: "no-cors" });

      try {
        await getAudio(request);
      } catch {
        failed += 1;
      } finally {
        done += 1;
        postProgress(client, done, uniqueWords.length, failed);
      }
    }
  }));

  postProgress(client, done, uniqueWords.length, failed, true);
}

function remoteAudioUrl(word) {
  const url = new URL(AUDIO_ORIGIN);
  url.searchParams.set("audio", word);
  url.searchParams.set("type", "2");
  return url.toString();
}

function isAudioRequest(url) {
  return url.origin === new URL(AUDIO_ORIGIN).origin
    && url.pathname === new URL(AUDIO_ORIGIN).pathname
    && url.searchParams.get("type") === "2"
    && url.searchParams.has("audio");
}

function postProgress(client, done, total, failed, complete = false) {
  if (!client) return;
  client.postMessage({
    type: "audio-cache-progress",
    done,
    total,
    failed,
    complete
  });
}
