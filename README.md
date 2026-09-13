# خادم MCP لمنصة مشهور قرآن

خادم [Model Context Protocol](https://modelcontextprotocol.io) واحد يعمل مع **Claude وChatGPT وأي عميل آخر يدعم MCP** — لا حاجة لبناء "بلجن" منفصل لكل منصة؛ هذا هو المعيار الحديث المشترك بينها. يوفّر للوكيل الذكي أدوات (tools) للقراءة فقط من بيانات القرآن الكريم العامة نفسها التي يستخدمها موقع [quran.mashhor-hub.com](https://quran.mashhor-hub.com): القراء، السور، البحث النصي في القرآن، مواقيت الصلاة، الإذاعات المباشرة، والتاريخ الهجري.

يعمل بطريقتين حسب حاجتك:
- **محليًا عبر stdio** (`src/server.mjs`) — لا يحتاج حسابًا ولا مفتاح API ولا استضافة، يعمل مباشرة على جهازك مع Claude Desktop أو Claude Code.
- **عن بُعد عبر HTTP** (`src/http-server.mjs`) — لاستخدامه كـ"موصل مخصص" (custom connector) في تطبيق Claude للجوال/الويب أو أي عميل MCP بعيد آخر، يحتاج استضافة تُشغّل عملية Node.js دائمة (انظر «الاستضافة عن بُعد (HTTP)» أدناه).

كلا الوضعين يتصلان بنفس الواجهات العامة (mp3quran.net، aladhan.com، quran-api) دون حاجة لمفتاح API أو قاعدة بيانات.

## الأدوات المتاحة

| الأداة | الوصف |
|---|---|
| `list_surahs` | أسماء سور القرآن الكريم الـ114 مع أرقامها |
| `list_reciters` | قائمة قراء القرآن مع رواياتهم (يمكن التصفية بجزء من الاسم) |
| `get_surah_audio` | رابط تلاوة سورة معيّنة بصوت قارئ محدد |
| `search_quran` | بحث نصي كامل في القرآن الكريم (يتجاهل التشكيل واختلاف الرسم) |
| `get_ayah` | نص آية محددة برقم السورة والآية |
| `list_radio_stations` | إذاعات القرآن الكريم المباشرة |
| `get_prayer_times` | مواقيت الصلاة لمدينة معروفة أو إحداثيات |
| `get_hijri_date` | التاريخ الهجري اليوم (أو لتاريخ ميلادي محدد) |

**غير متاح بعد:** لا توجد أداة للتفسير (tafsir) رغم توفره في الموقع الرئيسي — لم تُبنَ بعد ضمن هذا الإصدار. أخبرني إن أردتها.

## التثبيت

```bash
cd mcp-server
npm install
```

## الربط بـ Claude Desktop

أضف هذا إلى ملف الإعداد (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`، ويندوز: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mashhor-quran": {
      "command": "node",
      "args": ["المسار-الكامل-لهذا-المجلد/mcp-server/src/server.mjs"]
    }
  }
}
```

أعد تشغيل Claude Desktop بعدها.

## الربط بـ Claude Code

في مجلد أي مشروع تريد استخدام الأداة داخله، أنشئ/عدّل `.mcp.json`:

```json
{
  "mcpServers": {
    "mashhor-quran": {
      "command": "node",
      "args": ["المسار-الكامل-لهذا-المجلد/mcp-server/src/server.mjs"]
    }
  }
}
```

أو عبر الأمر المباشر:

```bash
claude mcp add mashhor-quran -- node "المسار-الكامل-لهذا-المجلد/mcp-server/src/server.mjs"
```

## الاستضافة عن بُعد (HTTP)

لاستخدام الخادم كموصل مخصص (custom connector) في تطبيق Claude للجوال/الويب، أو في ChatGPT عبر Connectors، أو أي عميل MCP بعيد آخر — هذه العملاء تتطلب رابط `https://` حيًا وليس عملية محلية. `src/http-server.mjs` يوفّر هذا عبر نقل [Streamable HTTP](https://modelcontextprotocol.io) الرسمي، **بلا حالة (stateless)**: كل طلب مستقل تمامًا، فلا حاجة لقاعدة بيانات أو تخزين جلسات.

**متطلب أساسي:** استضافة تُشغّل عملية Node.js دائمة التشغيل. **Hostinger فعليًا يدعم هذا** عبر ميزة "Node.js web app" في hPanel (على خطط Business Web Hosting أو Cloud Startup/Professional/Enterprise) — دليل خطوة بخطوة كامل ومخصص لهذا المشروع في [`HOSTINGER-DEPLOY.md`](./HOSTINGER-DEPLOY.md)، على **نطاق فرعي منفصل** (مثل `mcp.mashhor-hub.com`) بلا أي تأثير على الموقع الرئيسي الثابت. بدائل أخرى: VPS، أو منصة مثل Render/Railway/Fly.io.

### التشغيل

```bash
cd mcp-server
npm install
npm run start:http
# أو: PORT=3939 ALLOWED_HOSTS=mcp.example.com node src/http-server.mjs
```

متغيرات البيئة (كلها اختيارية بقيم افتراضية معقولة):

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `PORT` | `3939` | منفذ الاستماع |
| `MCP_PATH` | `/mcp` | مسار نقطة الاتصال |
| `ALLOWED_HOSTS` | `quran.mashhor-hub.com,mcp.mashhor-hub.com,localhost` | رؤوس Host المسموحة (حماية من هجمات DNS rebinding) — **عدّلها لتطابق النطاق الفعلي الذي ستستضيف عليه** |
| `ALLOWED_ORIGINS` | `https://claude.ai,https://claude.com,https://chatgpt.com,https://chat.openai.com,https://gemini.google.com` | أصول CORS المسموحة |
| `RATE_LIMIT_PER_MIN` | `60` | أقصى عدد طلبات لكل عنوان IP في الدقيقة |
| `TRUST_PROXY` | `1` | عدد قفزات الوكيل العكسي أمام الخادم (Express `trust proxy`) — بدون هذا يرى الخادم عنوان الوكيل نفسه لكل الزوار فيُبطِل تحديد المعدّل لكل IP. اتركه `1` خلف وكيل واحد (حالة Hostinger المعتادة)، أو عدّله ليطابق بنيتك |

يُفضَّل تشغيله خلف وكيل عكسي (reverse proxy) بـHTTPS حقيقي (Caddy، Nginx، أو ما توفره منصة الاستضافة تلقائيًا) بدل تعريضه مباشرة على منفذ HTTP خام — أضف اسم النطاق الذي سيُستخدم فعليًا إلى `ALLOWED_HOSTS` كي لا تُرفض الطلبات.

### الإضافة في تطبيق Claude (موصل مخصص)

من إعدادات الموصلات (Connectors) في تطبيق Claude للجوال أو الويب → "إضافة موصل مخصص" → أدخل رابط الخادم كاملًا مع المسار، مثال: `https://mcp.example.com/mcp` (بلا حاجة لتفعيل "يتطلب تسجيل دخول"، فكل الأدوات للقراءة العامة فقط بلا مصادقة).

### ملاحظة صادقة

بنيت هذا الملف واختبرته محليًا (مصافحة MCP كاملة + استدعاء أدوات حقيقية عبر HTTP، بما فيها أداة تعتمد على واجهة mp3quran.net الخارجية) وكلها نجحت. لكنني لا أملك وصولًا لأي حساب استضافة لأنشره بنفسي — اتبع [`HOSTINGER-DEPLOY.md`](./HOSTINGER-DEPLOY.md) لنشره فعليًا على Hostinger، وحدّث `ALLOWED_HOSTS` ليطابق النطاق الفرعي الذي تختاره.

## اختبار سريع دون أي عميل خارجي

```bash
npx @modelcontextprotocol/inspector node src/server.mjs
```

يفتح واجهة ويب محلية لتجربة كل أداة يدويًا والتأكد من عملها قبل ربطها بأي عميل.
