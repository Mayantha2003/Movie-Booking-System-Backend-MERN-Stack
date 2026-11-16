
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
  recentTickets: number;
}

export interface Recommendation {
  movieId: string;
  reason: string;
}

export const MAX_RECOMMENDATIONS = 5;

const MAX_REASON_LENGTH = 220;

// ---------- SYSTEM PROMPT ----------

const SYSTEM_PROMPT = `
You are a cinema recommendation assistant.

Your task is to select the best trending movies
from the supplied cinema catalogue.

Selection rules:
1. Select up to 5 movies.
2. Use only movies from the catalogue.
3. Copy movie IDs exactly.
4. Never invent movie IDs.
5. Consider recent ticket sales and ratings.
6. Prefer popular and highly rated movies.
7. Return the best movie first.
8. Each reason must be one short sentence.
9. Keep each reason under 12 words.

Return recommendations using the requested JSON schema.
`;

// ---------- BUILD CATALOGUE ----------

export const buildCatalogText = (
  movies: CatalogMovie[]
): string => {
  return movies
    .map((movie) =>
      JSON.stringify({
        id: String(movie._id),
        title: movie.title,
        genres: movie.genre,
        rating: movie.rating ?? null,
        tickets14d: movie.recentTickets,
      })
    )
    .join("\n");
};

// ---------- BUILD USER PROMPT ----------

export const buildUserPrompt = (
  movies: CatalogMovie[]
): string => {
  return `
Choose the best trending movies from this catalogue.

${buildCatalogText(movies)}

Return no more than ${MAX_RECOMMENDATIONS} recommendations.
`;
};

// ---------- PARSE AI RESPONSE ----------

export const parseAiRecommendations = (
  raw: string,
  movies: CatalogMovie[]
): Recommendation[] => {
  const allowedIds = new Set(
    movies.map((movie) => String(movie._id))
  );

  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("recommendations" in parsed)
  ) {
    return [];
  }

  const recommendations = (
    parsed as {
      recommendations?: unknown;
    }
  ).recommendations;

  if (!Array.isArray(recommendations)) {
    return [];
  }

  const seen = new Set<string>();

  const result: Recommendation[] = [];

  for (const item of recommendations) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const id =
      typeof item.id === "string"
        ? item.id.trim()
        : "";

    const reason =
      typeof item.reason === "string"
        ? item.reason.trim()
        : "";

    if (!allowedIds.has(id)) {
      continue;
    }

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);

    result.push({
      movieId: id,
      reason: (
        reason || "A popular choice among cinema audiences."
      ).slice(0, MAX_REASON_LENGTH),
    });

    if (result.length >= MAX_RECOMMENDATIONS) {
      break;
    }
  }

  return result;
};

// ---------- AI CONFIGURATION ----------

export const isAiConfigured = (): boolean => {
  return Boolean(process.env.GROQ_API_KEY);
};

// ---------- GROQ AI REQUEST ----------

export const askAi = async (
  movies: CatalogMovie[]
): Promise<Recommendation[]> => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  if (movies.length === 0) {
    return [];
  }

  const model =
    process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },

      body: JSON.stringify({
        model,

        temperature: 0.2,

        max_completion_tokens: 4096,

        reasoning_effort: "low",

        response_format: {
          type: "json_schema",

          json_schema: {
            name: "movie_recommendations",

            strict: true,

            schema: {
              type: "object",

              properties: {
                recommendations: {
                  type: "array",

                  items: {
                    type: "object",

                    properties: {
                      id: {
                        type: "string",
                      },

                      reason: {
                        type: "string",
                      },
                    },

                    required: [
                      "id",
                      "reason",
                    ],

                    additionalProperties: false,
                  },
                },
              },

              required: [
                "recommendations",
              ],

              additionalProperties: false,
            },
          },
        },

        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },

          {
            role: "user",
            content: buildUserPrompt(movies),
          },
        ],
      }),

      signal: AbortSignal.timeout(30000),
    }
  );

  // Handle API errors

  if (!response.ok) {
    const errorText = await response.text();

    console.error(
      "Groq API Error:",
      response.status,
      errorText
    );

    throw new Error(
      `Groq API failed with status ${response.status}`
    );
  }

  // Read API response

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };

      finish_reason?: string;
    }>;
  };

  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error("Groq returned no choices");
  }

  console.log(
    "Groq finish reason:",
    choice.finish_reason
  );

  // Check incomplete response

  if (choice.finish_reason === "length") {
    throw new Error(
      "Groq response was truncated"
    );
  }

  const aiText =
    choice.message?.content ?? "";

  if (!aiText.trim()) {
    throw new Error(
      "Groq returned an empty response"
    );
  }

  // Validate AI recommendations

  const recommendations = parseAiRecommendations(
    aiText,
    movies
  );

  if (recommendations.length === 0) {
    console.error(
      "Invalid AI response:",
      aiText
    );

    throw new Error(
      "No valid AI recommendations returned"
    );
  }

  return recommendations;
};

// ---------- FALLBACK RECOMMENDATIONS ----------

/**
 * Fallback algorithm:
 * 60% popularity + 40% rating.
 */

export const fallbackRecommendations = (
  movies: CatalogMovie[]
): Recommendation[] => {
  if (movies.length === 0) {
    return [];
  }

  const maxTickets = Math.max(
    1,
    ...movies.map((movie) => movie.recentTickets)
  );

  return movies
    .map((movie) => {
      const popularity =
        movie.recentTickets / maxTickets;

      const rating =
        (movie.rating ?? 0) / 10;

      const score =
        0.6 * popularity + 0.4 * rating;

      const reason =
        movie.recentTickets > 0
          ? `${movie.recentTickets} tickets booked in the last 2 weeks.`
          : movie.rating
            ? `Highly rated at ${movie.rating.toFixed(1)}/10.`
            : "Now showing in cinemas.";

      return {
        movie,
        score,
        reason,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ movie, reason }) => ({
      movieId: String(movie._id),
      reason,
    }));
};
