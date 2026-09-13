/* منطق أدوات خادم MCP لمنصة "مشهور قرآن"، مستقل عن آلية النقل (stdio محليًا
   عبر server.mjs، أو HTTP عن بُعد عبر http-server.mjs) — كلاهما يستدعي
   createMcpServer() لبناء نسخة جديدة مهيّأة بنفس الأدوات الثماني. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SURAH_NAMES, MAJOR_CITIES } from "./data.mjs";

export const SERVER_VERSION = "1.1.0";

const API_PRIMARY = "https://www.mp3quran.net/api/v3/";
const API_FALLBACK = "https://mp3quran.net/api/v3/";
const QURAN_FULLTEXT_URLS = [
  "https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/ara-quransimple.min.json",
  "https://raw.githubusercontent.com/fawazahmed0/quran-api/1/editions/ara-quransimple.min.json"
];

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "mashhor-quran-mcp/1.0" }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} من ${url}`);
    return await res.json();
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`انتهت مهلة الاتصال بـ ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function mp3quranApi(path, params) {
  const qs = "?" + new URLSearchParams(params).toString();
  for (const base of [API_PRIMARY, API_FALLBACK]) {
    try { return await fetchJson(base + path + qs); } catch { /* جرّب المصدر التالي */ }
  }
  throw new Error(`تعذّر الوصول إلى واجهة mp3quran.net (${path})`);
}

let quranIndex = null;
async function loadQuranIndex() {
  if (quranIndex) return quranIndex;
  for (const url of QURAN_FULLTEXT_URLS) {
    try {
      const d = await fetchJson(url);
      const rows = (d && d.quran) || [];
      if (rows.length) {
        quranIndex = rows.map(r => ({ c: +r.chapter, v: +r.verse, t: String(r.text || "") }));
        return quranIndex;
      }
    } catch { /* جرّب المصدر التالي */ }
  }
  throw new Error("تعذّر تحميل فهرس نص القرآن الكريم الكامل");
}

/* يبني تعبيرًا نمطيًا يتجاهل التشكيل ويوحّد صور الألف والهمزة والياء والتاء
   المربوطة (نفس منطق البحث في الموقع، js/app.js:arabicSearchRegex). */
function arabicSearchRegex(query) {
  const cleaned = String(query || "").replace(/[ً-ْٰـ]/g, "").trim();
  if (cleaned.length < 2) return null;
  const equivalents = { "ا": "[إأآاٱ]", "أ": "[إأآاٱ]", "إ": "[إأآاٱ]", "آ": "[إأآاٱ]", "ٱ": "[إأآاٱ]", "ة": "[ةه]", "ه": "[ةه]", "ى": "[ىي]", "ي": "[ىي]", "ؤ": "[ؤو]", "ئ": "[ئي]" };
  const DIAC = "[\\u064B-\\u0652\\u0670\\u0640]*";
  const pattern = [...cleaned].map(ch => {
    if (/\s/.test(ch)) return "\\s+";
    const safe = ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (equivalents[ch] || safe) + DIAC;
  }).join("");
  try { return new RegExp(pattern, "i"); } catch { return null; }
}

function text(payload) {
  return { content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }] };
}

export function createMcpServer() {
  const server = new McpServer({ name: "mashhor-quran", version: SERVER_VERSION });

  server.registerTool(
    "list_surahs",
    {
      title: "قائمة سور القرآن الكريم",
      description: "يعيد أسماء سور القرآن الكريم الـ114 بالترتيب مع رقم كل سورة.",
      inputSchema: {}
    },
    async () => text(SURAH_NAMES.map((name, i) => ({ number: i + 1, name })))
  );

  server.registerTool(
    "list_reciters",
    {
      title: "قائمة قراء القرآن الكريم",
      description: "يبحث في قراء القرآن الكريم المتاحين عبر mp3quran.net، مع رواياتهم المتاحة. يمكن تمرير جزء من اسم القارئ للتصفية.",
      inputSchema: { query: z.string().max(200).optional().describe("جزء من اسم القارئ للتصفية (اختياري)") }
    },
    async ({ query }) => {
      const d = await mp3quranApi("reciters", { language: "ar" });
      let reciters = (d && d.reciters) || [];
      if (query) reciters = reciters.filter(r => r.name.includes(query));
      return text(reciters.map(r => ({
        id: r.id, name: r.name,
        riwayat: (r.moshaf || []).map(m => m.name)
      })));
    }
  );

  server.registerTool(
    "get_surah_audio",
    {
      title: "رابط تلاوة سورة لقارئ معيّن",
      description: "يعيد رابط ملف الصوت المباشر لتلاوة سورة معيّنة بصوت قارئ محدد (استخدم list_reciters أولًا لمعرفة المعرّف reciter_id).",
      inputSchema: {
        reciter_id: z.number().int().describe("معرّف القارئ من list_reciters"),
        surah: z.number().int().min(1).max(114).describe("رقم السورة من 1 إلى 114")
      }
    },
    async ({ reciter_id, surah }) => {
      const d = await mp3quranApi("reciters", { language: "ar", reciter: reciter_id });
      const reciter = (d && d.reciters && d.reciters[0]) || null;
      if (!reciter) return text({ error: "لم يتم العثور على قارئ بهذا المعرّف" });
      /* بعض الروايات تغطي جزءًا من القرآن فقط، فلا يصح افتراض أن أول رواية
         مذكورة تشمل السورة المطلوبة — نختار أول رواية يشملها surah_list فعليًا. */
      const moshaf = (reciter.moshaf || []).find(m => {
        if (!m.server) return false;
        const list = String(m.surah_list || "").split(",").map(Number);
        return list.includes(surah);
      });
      if (!moshaf) return text({ error: `هذه السورة غير متاحة لهذا القارئ في أي من رواياته المسجّلة` });
      /* moshaf.server قادم من استجابة mp3quran.net الخارجية، فيُتحقق من أنه
         رابط https حقيقي لهذا المضيف تحديدًا قبل إعادته للعميل، دفاعًا في
         العمق حال تعرّض تلك الواجهة لاختراق أو انتحال. */
      let serverUrl;
      try { serverUrl = new URL(moshaf.server); } catch { return text({ error: "رابط الصوت الوارد من واجهة mp3quran.net غير صالح" }); }
      if (serverUrl.protocol !== "https:" || !/(^|\.)mp3quran\.net$/.test(serverUrl.hostname)) {
        return text({ error: "رابط الصوت الوارد من واجهة mp3quran.net غير موثوق" });
      }
      const url = `${moshaf.server}${String(surah).padStart(3, "0")}.mp3`;
      return text({ reciter: reciter.name, riwaya: moshaf.name, surah: SURAH_NAMES[surah - 1] || surah, url });
    }
  );

  server.registerTool(
    "search_quran",
    {
      title: "بحث نصي في القرآن الكريم",
      description: "يبحث عن كلمة أو عبارة داخل نص القرآن الكريم كاملًا (بلا تشكيل، ويتجاهل اختلاف رسم الألف/الياء/التاء المربوطة)، ويعيد الآيات المطابقة مع موضعها.",
      inputSchema: {
        query: z.string().min(2).max(200).describe("كلمة أو عبارة للبحث عنها (حرفان على الأقل)"),
        limit: z.number().int().min(1).max(100).optional().describe("أقصى عدد نتائج (افتراضيًا 20)")
      }
    },
    async ({ query, limit }) => {
      const re = arabicSearchRegex(query);
      if (!re) return text({ error: "نص البحث قصير جدًا" });
      const index = await loadQuranIndex();
      const max = limit || 20;
      const results = [];
      for (const row of index) {
        if (re.test(row.t)) {
          results.push({ surah: SURAH_NAMES[row.c - 1] || row.c, surahNumber: row.c, ayah: row.v, text: row.t });
          if (results.length >= max) break;
        }
      }
      return text(results);
    }
  );

  server.registerTool(
    "get_ayah",
    {
      title: "نص آية محددة",
      description: "يعيد نص آية واحدة بعينها من القرآن الكريم برقم السورة ورقم الآية.",
      inputSchema: {
        surah: z.number().int().min(1).max(114).describe("رقم السورة"),
        ayah: z.number().int().min(1).describe("رقم الآية داخل السورة")
      }
    },
    async ({ surah, ayah }) => {
      const index = await loadQuranIndex();
      const row = index.find(r => r.c === surah && r.v === ayah);
      if (!row) return text({ error: "لم يتم العثور على هذه الآية" });
      return text({ surah: SURAH_NAMES[surah - 1] || surah, surahNumber: surah, ayah, text: row.t });
    }
  );

  server.registerTool(
    "list_radio_stations",
    {
      title: "قائمة إذاعات القرآن الكريم المباشرة",
      description: "يعيد قائمة إذاعات القرآن الكريم المباشرة المتاحة مع روابط البث.",
      inputSchema: { query: z.string().max(200).optional().describe("جزء من اسم الإذاعة للتصفية (اختياري)") }
    },
    async ({ query }) => {
      const d = await mp3quranApi("radios", { language: "ar" });
      let radios = (d && d.radios) || [];
      if (query) radios = radios.filter(r => r.name.includes(query));
      return text(radios.map(r => ({ id: r.id, name: r.name, url: r.url })));
    }
  );

  server.registerTool(
    "get_prayer_times",
    {
      title: "مواقيت الصلاة",
      description: "يعيد مواقيت الصلاة الخمس لمدينة أو إحداثيات معيّنة في تاريخ محدد (افتراضيًا اليوم). مرّر اسم مدينة من القائمة المعروفة (مكة المكرمة، المدينة المنورة، القاهرة، الكويت، الإمارات) أو إحداثيات latitude/longitude مباشرة لأي مكان آخر.",
      inputSchema: {
        city: z.string().max(200).optional().describe("اسم مدينة معروفة، مثل: الكويت"),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        date: z.string().optional().describe("تاريخ بصيغة DD-MM-YYYY، افتراضيًا اليوم"),
        method: z.number().int().optional().describe("رمز طريقة الحساب الفلكية (aladhan.com)، افتراضيًا 4")
      }
    },
    async ({ city, latitude, longitude, date, method }) => {
      let lat = latitude, lng = longitude, m = method || 4;
      if (city) {
        const found = MAJOR_CITIES.find(c => c.name.includes(city) || city.includes(c.name));
        if (found) { lat = found.lat; lng = found.lng; m = method || found.method; }
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return text({ error: "حدد مدينة معروفة أو إحداثيات latitude/longitude صالحة", knownCities: MAJOR_CITIES.map(c => c.name) });
      }
      const d = date || (() => {
        const now = new Date();
        return `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
      })();
      /* يُدرج التاريخ داخل مسار الرابط مباشرة، فيجب التحقق من صيغته أولًا
         لمنع كسر بنية المسار أو حقن معاملات إضافية في طلب aladhan.com. */
      if (!/^\d{1,2}-\d{1,2}-\d{4}$/.test(d)) {
        return text({ error: "صيغة التاريخ غير صالحة، استخدم DD-MM-YYYY" });
      }
      const url = `https://api.aladhan.com/v1/timings/${d}?${new URLSearchParams({ latitude: lat, longitude: lng, method: m })}`;
      const res = await fetchJson(url);
      const timings = res && res.data && res.data.timings;
      if (!timings) return text({ error: "تعذّر جلب مواقيت الصلاة" });
      return text({
        date: d, latitude: lat, longitude: lng,
        fajr: timings.Fajr, sunrise: timings.Sunrise, dhuhr: timings.Dhuhr,
        asr: timings.Asr, maghrib: timings.Maghrib, isha: timings.Isha
      });
    }
  );

  server.registerTool(
    "get_hijri_date",
    {
      title: "التاريخ الهجري اليوم",
      description: "يعيد التاريخ الهجري المقابل لليوم (أو لتاريخ ميلادي محدد) دون أي استدعاء شبكي.",
      inputSchema: { gregorian_date: z.string().optional().describe("تاريخ ميلادي بصيغة YYYY-MM-DD، افتراضيًا اليوم") }
    },
    async ({ gregorian_date }) => {
      const d = gregorian_date ? new Date(gregorian_date) : new Date();
      if (Number.isNaN(d.getTime())) return text({ error: "تاريخ غير صالح" });
      const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(d);
      const gregorian = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric", weekday: "long" }).format(d);
      return text({ hijri, gregorian });
    }
  );

  return server;
}
