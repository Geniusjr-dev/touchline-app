"use client";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Null when env is not set, so the app still builds/runs on sample data.
export const supabase = url && key ? createClient(url, key) : null;
export const hasSupabase = () => !!supabase;
