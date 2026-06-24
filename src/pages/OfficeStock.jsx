import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";

/* ─────────────────────────────────────────
   NIVEE BRAND COLORS  (mirrors Products.jsx)
   Primary : Deep Steel Blue  #1B3A6B
   Accent  : Nivee Orange     #E8630A
   Surface : Warm White       #F8F7F4
───────────────────────────────────────── */