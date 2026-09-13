#!/usr/bin/env node
/* نقطة دخول HTTP — للاتصال عن بُعد عبر رابط https (موصل مخصص في تطبيق
   Claude للجوال/الويب، أو أي عميل MCP آخر يدعم النقل عبر HTTP)، بخلاف
   server.mjs المحلي القائم على stdio. بلا حالة (stateless) عمدًا: كل طلب
   يبني خادمًا ونقلًا transport جديدين مستقلّين، فلا حاجة لتخزين جلسات على
   القرص أو في الذاكرة عبر الطلبات — مناسب لأدوات قراءة فقط بلا مصادقة.

   التشغيل: node src/http-server.mjs
   المتغيرات: PORT (افتراضيًا 3939)، MCP_PATH (افتراضيًا /mcp)،
   ALLOWED_HOSTS (رؤوس Host المسموحة، مفصولة بفواصل)،
   ALLOWED_ORIGINS (أصول CORS المسموحة، مفصولة بفواصل)،
   RATE_LIMIT_PER_MIN (حد الطلبات لكل عنوان IP في الدقيقة)،
   TRUST_PROXY (عدد قفزات الوكيل العكسي، افتراضيًا 1، مطلوب لتحديد المعدّل
   الصحيح لكل IP خلف أي استضافة تستخدم وكيلًا عكسيًا). */

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, SERVER_VERSION } from "./create-server.mjs";

const PORT = Number(process.env.PORT) || 3939;
const MCP_PATH = process.env.MCP_PATH || "/mcp";

const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || "quran.mashhor-hub.com,mcp.mashhor-hub.com,localhost")
  .split(",").map(s => s.trim()).filter(Boolean);
/* claude.ai/claude.com يستدعيان الموصلات البعيدة من خوادمهما لا من متصفح
   الزائر مباشرة غالبًا، لكن نسمح بأصلي الواجهة أيضًا احتياطًا لأي عميل ويب
   يتصل من المتصفح مباشرة. عدّل هذه القائمة عبر ALLOWED_ORIGINS إن احتجت. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://claude.ai,https://claude.com")
  .split(",").map(s => s.trim()).filter(Boolean);
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN) || 60;

const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts: ALLOWED_HOSTS });
app.disable("x-powered-by");
/* بدون هذا، خلف أي وكيل عكسي (Hostinger، Nginx، Cloudflare) يعيد req.ip دائمًا
   عنوان الوكيل نفسه لا عنوان الزائر الفعلي — ما يجعل كل الزوار يتشاركون سلة
   واحدة في محدد المعدّل أدناه بدل سلة لكل IP فعليًا. القيمة الافتراضية (1)
   تناسب قفزة وكيل واحدة (حالة Hostinger)؛ عدّلها إن كانت البنية خلف أكثر. */
const trustProxyRaw = process.env.TRUST_PROXY;
app.set("trust proxy", trustProxyRaw === undefined ? 1 : (Number.isNaN(Number(trustProxyRaw)) ? trustProxyRaw : Number(trustProxyRaw)));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Last-Event-ID");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* حد بسيط لعدد الطلبات لكل عنوان IP (نافذة ثابتة بالدقيقة، في الذاكرة فقط)،
   حماية لواجهة عامة بلا مصادقة من إساءة استخدام تستهلك واجهات
   mp3quran.net/aladhan.com المجانية بالنيابة عنا أو تُثقل هذا الخادم الصغير. */
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const windowStart = Math.floor(Date.now() / 60000);
  const key = `${ip}:${windowStart}`;
  const count = (hits.get(key) || 0) + 1;
  hits.set(key, count);
  if (hits.size > 5000) { for (const k of hits.keys()) { if (!k.endsWith(`:${windowStart}`)) hits.delete(k); } }
  if (count > RATE_LIMIT) return res.status(429).json({ error: "طلبات كثيرة جدًا، حاول لاحقًا" });
  next();
}

app.get("/", (_req, res) => res.json({ name: "mashhor-quran-mcp", version: SERVER_VERSION, endpoint: MCP_PATH }));

app.post(MCP_PATH, rateLimit, async (req, res) => {
  const server = createMcpServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("MCP request error:", e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null });
  }
});

/* الوضع بلا حالة لا يدعم GET (تدفق SSE مفتوح طويل الأمد) ولا DELETE (إنهاء
   جلسة)، إذ لا جلسات محفوظة أصلًا هنا. */
app.get(MCP_PATH, (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "GET غير مدعوم في هذا الوضع بلا حالة" }, id: null }));
app.delete(MCP_PATH, (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "DELETE غير مدعوم في هذا الوضع بلا حالة" }, id: null }));

app.listen(PORT, () => {
  console.log(`مشهور قرآن MCP (HTTP) يعمل على المنفذ ${PORT} — المسار ${MCP_PATH}`);
  console.log(`مضيفات مسموحة: ${ALLOWED_HOSTS.join(", ")}`);
});
