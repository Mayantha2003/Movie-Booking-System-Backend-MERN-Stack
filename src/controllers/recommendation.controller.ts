import { Request, Response } from "express";
import { Booking } from "../models/booking.model";
import { MovieModel } from "../models/movie.model";
import {
  askAi,
  CatalogMovie,
  fallbackRecommendations,
  isAiConfigured,
  Recommendation,
} from "../services/aiRecommendation.service";

const WINDOW_DAYS = 14;
const AI_CACHE_MS = 30 * 60 * 1000; // AI result reused for 30 min (fast for guests, saves quota)
const FALLBACK_CACHE_MS = 5 * 60 * 1000; // retry the AI sooner after a failure

interface CachedPicks {
  picks: Recommendation[];
  source: "ai" | "fallback";
  expiresAt: number;
}
let cache: CachedPicks | null = null;

// Paid tickets per movie in the last 14 days = "popularity".
const getRecentTicketCounts = async (): Promise<Map<string, number>> => {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await Booking.aggregate<{ _id: unknown; tickets: number }>([
    {
      $match: {
        createdAt: { $gte: since },
        paymentStatus: "Paid",
        bookingStatus: { $in: ["Confirmed", "Completed"] },
      },
    },
    { $group: { _id: "$movie", tickets: { $sum: "$totalSeats" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.tickets]));
};

// ===================== GET /api/recommendations/trending =====================
// Public. Returns up to 5 "now showing" movies the AI considers the best right now.
export const getTrendingPicks = async (_req: Request, res: Response) => {
  try {
    const movies = (await MovieModel.find({ status: "now_showing" }).lean()) as unknown as Array<
      Omit<CatalogMovie, "recentTickets"> & Record<string, unknown>
    >;

    if (movies.length === 0) {
      return res.status(200).json({ message: "No movies are showing right now.", source: "none", data: [] });
    }

    const byId = new Map(movies.map((m) => [String(m._id), m]));

    let entry = cache && cache.expiresAt > Date.now() ? cache : null;

    if (!entry) {
      const counts = await getRecentTicketCounts();
      const catalog: CatalogMovie[] = movies.map((m) => ({
        ...m,
        _id: String(m._id),
        recentTickets: counts.get(String(m._id)) ?? 0,
      }));

      let picks: Recommendation[] = [];
      let source: "ai" | "fallback" = "fallback";

      if (isAiConfigured()) {
        try {
          picks = await askAi(catalog);
          source = "ai";
        } catch (error) {
          console.error("AI picks failed, using fallback:", (error as Error).message);
        }
      }
      if (picks.length === 0) picks = fallbackRecommendations(catalog);

      entry = {
        picks,
        source,
        expiresAt: Date.now() + (source === "ai" ? AI_CACHE_MS : FALLBACK_CACHE_MS),
      };
      cache = entry;
    }

    // Re-attach fresh movie documents; skip anything that stopped showing since it was cached.
    const data = entry.picks
      .map((p) => ({ movie: byId.get(p.movieId), reason: p.reason }))
      .filter((item) => item.movie);

    return res.status(200).json({
      message: "Trending picks fetched successfully!",
      source: entry.source,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Get Trending Picks Error:", error);
    return res.status(500).json({ message: "Failed to fetch recommendations!" });
  }
};