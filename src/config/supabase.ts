import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Name of the PUBLIC bucket that holds movie images (create it in the Supabase dashboard).
export const STORAGE_BUCKET = process.env.SUPABASE_BUCKET || "movie-posters";

let client: SupabaseClient | null = null;

// Created on first use, so the server still starts if the keys are missing
// and only the upload endpoint reports "storage is not configured".
export const getSupabase = (): SupabaseClient => {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Image storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }

  // The service-role key bypasses Row Level Security. It must stay on the server
  // and must never be sent to the browser or committed to git.
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
};