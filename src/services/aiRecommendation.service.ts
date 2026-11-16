export interface CatalogMovie {
  _id: string;
  title: string;
  description: string;
  genre: string[];
  language: string;
  duration: number;
  rating?: number;
  director?: string;
  cast?: string[];
  /** Paid tickets in the last 14 days (popularity signal). */
  recentTickets: number;
}

export interface Recommendation {
  movieId: string;
  reason: string;
}

export const MAX_RECOMMENDATIONS = 5;
const MAX_REASON_LENGTH = 220;

// ---------- Prompt ----------

const SYSTEM_PROMPT = `You are the editor of a cinema website's home page.
You will receive a CATALOGUE of movies showing now. Each has "tickets14d" (paid tickets sold in the last 14 days) and "rating" (0-10).
Task: choose the ${MAX_RECOMMENDATIONS} best movies to feature as "Trending now" - the ones audiences are loving most these days.
Rules:
- Weigh popularity (tickets14d) and rating together; both matter. If data is thin, prefer the higher rating.
- Only use movies from the CATALOGUE and copy their "id" exactly. Never invent movies.
- Order best first. If the catalogue has fewer than ${MAX_RECOMMENDATIONS} movies, return them all.
- Each "reason" is ONE short sentence (max 12 words) a movie-goer would like, e.g. "Rated 8.4 and a crowd favourite this fortnight."
- Reply with JSON only, exactly in this shape:
{"recommendations":[{"id":"<catalogue id>","reason":"<sentence>"}]}`;

export const buildCatalogText = (movies: CatalogMovie[]): string =>
  movies
    .map((m) =>
      JSON.stringify({
        id: m._id,
        title: m.title,
        genres: m.genre,
        rating: m.rating ?? null,
        tickets14d: m.recentTickets,
      })
    )
    .join("\n");

export const buildUserPrompt = (movies: CatalogMovie[]): string =>
  `CATALOGUE (one JSON object per line):\n${buildCatalogText(movies)}`;

// ---------- Validating the model output ----------

/** Turns raw model text into trusted recommendations: valid IDs only, no duplicates, capped. */
export const parseAiRecommendations = (
  raw: string,
  movies: CatalogMovie[]
): Recommendation[] => {
  const allowed = new Set(movies.map((m) => String(m._id)));
  const cleaned = raw.replace(/```json|```/gi, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  const list = (parsed as { recommendations?: unknown })?.recommendations;
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const result: Recommendation[] = [];

  for (const item of list) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    const reason = typeof item?.reason === "string" ? item.reason.trim() : "";
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push({
      movieId: id,
      reason: (reason || "A crowd favourite right now.").slice(0, MAX_REASON_LENGTH),
    });
    if (result.length === MAX_RECOMMENDATIONS) break;
  }
  return result;
};

// ---------- Groq call ----------

export const isAiConfigured = (): boolean => Boolean(process.env.GROQ_API_KEY);

/** Asks Groq (OpenAI-compatible chat completions, free tier) and returns validated picks, or throws. */
export const askAi = async (movies: CatalogMovie[]): Promise<Recommendation[]> => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(movies) },
      ],
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Groq request failed with status ${response.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? "";

  const recommendations = parseAiRecommendations(text, movies);
  if (recommendations.length === 0) throw new Error("Groq returned no usable recommendations");
  return recommendations;
};

// ---------- Fallback (no AI) ----------

/** Same idea as the AI prompt, but a plain formula: 60% popularity + 40% rating. */
export const fallbackRecommendations = (movies: CatalogMovie[]): Recommendation[] => {
  const maxTickets = Math.max(1, ...movies.map((m) => m.recentTickets));

  return movies
    .map((movie) => {
      const popularity = movie.recentTickets / maxTickets; // 0..1
      const rating = (movie.rating ?? 0) / 10; // 0..1
      const score = 0.6 * popularity + 0.4 * rating;

      const reason =
        movie.recentTickets > 0
          ? `${movie.recentTickets} tickets booked in the last 2 weeks.`
          : movie.rating
            ? `Highly rated at ${movie.rating.toFixed(1)}/10.`
            : "Now showing in cinemas.";

      return { movie, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ movie, reason }) => ({ movieId: String(movie._id), reason }));
};