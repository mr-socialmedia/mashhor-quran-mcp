# رفع خادم MCP (HTTP) على Hostinger

هذا الدليل خاص بنشر `mcp-server/` **وحده** كتطبيق Node.js منفصل على استضافتك في Hostinger — **الموقع الرئيسي (quran.mashhor-hub.com) يبقى كما هو تمامًا، موقعًا ثابتًا، بلا أي تغيير أو خطر عليه.** الخادمان مستقلان تمامًا: أحدهما ملفات ثابتة، والآخر عملية Node.js تعمل على نطاق فرعي منفصل.

## قبل أن تبدأ: هل خطتك تدعم هذا؟

ميزة "Node.js web app" في hPanel متاحة على:
- **Business Web Hosting** (استضافة المواقع المشتركة)
- **Cloud Startup / Professional / Enterprise / Enterprise Plus**

إن كانت خطتك أقل من ذلك (Premium أو أقل)، لن تجد "Node.js web app" ضمن خيارات "Add Website" — ستحتاج الترقية، أو استضافة بديلة (Render/Railway/Fly.io، مجانية للاستخدام الخفيف). تحقق من هذا أولًا في hPanel قبل المتابعة.

## الخطوة 1 — اختر نطاقًا فرعيًا منفصلًا

لا تستخدم نفس نطاق الموقع الرئيسي. أنشئ نطاقًا فرعيًا مخصصًا لخادم MCP، مثل:

```
mcp.mashhor-hub.com
```

(من hPanel → Domains → Subdomains، إن لم يُتح إنشاؤه تلقائيًا ضمن الخطوة التالية).

## الخطوة 2 — جهّز حزمة الرفع

من جهازك:

```bash
cd mcp-server
npm run build 2>/dev/null || true   # لا يوجد خطوة بناء فعلية، هذا احتياطي فقط
```

الحزمة الجاهزة أصلًا موجودة في `assets/downloads/mashhor-quran-mcp-server.zip` (تُبنى عبر `npm run build:addons` من جذر المشروع) — تحتوي على كل شيء ما عدا `node_modules/` (يُثبَّتها Hostinger تلقائيًا من `package.json`). استخدمها مباشرة، أو أعد بناءها إن عدّلت الكود:

```bash
cd ..
npm run build:addons
```

## الخطوة 3 — أنشئ التطبيق في hPanel

1. **Websites** ← **Add Website**.
2. اختر **Node.js web app**.
3. اختر طريقة الرفع **Upload your files** (الأبسط هنا، بلا حاجة لربط GitHub).
4. ارفع `mashhor-quran-mcp-server.zip` (أو `.tar.gz` إن فضّلت ضغطه بنفسك — المهم استبعاد `node_modules/` و`.git/`، وهو مستبعد أصلًا في الحزمة الجاهزة).
5. اربط النطاق الفرعي `mcp.mashhor-hub.com` الذي أنشأته بهذا التطبيق (أو أنشئه هنا مباشرة إن أتاحت الواجهة ذلك ضمن نفس الخطوة).

## الخطوة 4 — إعدادات النشر (Deploy Settings)

يستكشف Hostinger الإعدادات تلقائيًا من `package.json`، لكن تأكد من هذه القيم بالتحديد قبل الضغط على **Deploy**:

| الحقل | القيمة |
|---|---|
| **Framework preset** | Other (أو Node.js عام — ليس Next.js/React، فهذا خادم بلا واجهة) |
| **Node.js version** | 20 أو 22 (كلاهما يعمل؛ المشروع اختُبر بحزمة Node الحديثة) |
| **Entry file** | `src/http-server.mjs` |
| **Build command** | اتركه فارغًا/افتراضيًا أولًا؛ إن فشل التشغيل بسبب حزم مفقودة، اضبطه على `npm install` صراحةً |
| **Package manager** | npm (افتراضي، يطابق `package-lock.json` الموجود) |

**متغيرات البيئة (Environment Variables)** — أضف هذه بالضبط (بدّل `mcp.mashhor-hub.com` إن اخترت نطاقًا فرعيًا مختلفًا):

| المتغير | القيمة |
|---|---|
| `ALLOWED_HOSTS` | `mcp.mashhor-hub.com` |
| `ALLOWED_ORIGINS` | `https://claude.ai,https://claude.com,https://chatgpt.com,https://chat.openai.com,https://gemini.google.com` |
| `RATE_LIMIT_PER_MIN` | `60` |
| `TRUST_PROXY` | `1` (القيمة الافتراضية، لا حاجة لضبطها إلا إن كانت البنية خلف أكثر من وكيل عكسي واحد) |

لا تضبط `PORT` يدويًا — يُهيّئه Hostinger تلقائيًا للتطبيق، وملف `http-server.mjs` يقرأه من `process.env.PORT` أصلًا.

اضغط **Deploy**.

## الخطوة 5 — تحقق من النجاح

1. بعد اكتمال النشر، افتح `https://mcp.mashhor-hub.com/` في المتصفح — يجب أن تظهر استجابة JSON بسيطة: `{"name":"mashhor-quran-mcp","version":"1.1.0","endpoint":"/mcp"}`.
2. إن ظهر خطأ 403 أو 502: افتح تبويب **Runtime Logs** في لوحة التطبيق بـhPanel لمعرفة سبب توقف العملية (غالبًا حزمة مفقودة، أو Entry file خطأ) — أعد النشر (Redeploy) بعد التصحيح.
3. اختبار كامل عبر سطر الأوامر (بدّل الرابط إن اخترت نطاقًا مختلفًا):

```bash
curl -s -X POST https://mcp.mashhor-hub.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

نتيجة صحيحة تحتوي `"serverInfo":{"name":"mashhor-quran","version":"1.1.0"}`.

## الخطوة 6 — أضفه كموصل مخصص في تطبيق Claude

من إعدادات Connectors في تطبيق Claude (الجوال أو الويب) → **إضافة موصل مخصص** → أدخل الرابط كاملًا مع المسار:

```
https://mcp.mashhor-hub.com/mcp
```

اترك "يتطلب تسجيل دخول" مغلقًا (كل الأدوات للقراءة العامة فقط، بلا مصادقة).

## بعد أي تعديل على الكود مستقبلًا

1. `npm run build:addons` من جذر المشروع (يعيد بناء الحزمة).
2. في hPanel: افتح تطبيق Node.js نفسه ← ارفع الحزمة الجديدة من جديد (نفس الخطوة 3) أو استخدم زر **Redeploy** إن كانت الواجهة تتيح استبدال الملفات مباشرة.
3. تأكد أن حالته تعود **Running** بعد إعادة النشر (اضغط الشارة/الحالة لإعادة التشغيل يدويًا إن لزم).

## ملاحظة صادقة

لا أملك وصولًا لحساب Hostinger الخاص بك لأنفّذ هذه الخطوات بنفسي أو أتحقق منها بصريًا على واجهتك تحديدًا — الخطوات أعلاه مبنية على التوثيق الرسمي الحالي لـHostinger (وليست تخمينًا)، لكن تفاصيل صغيرة في تسمية الأزرار قد تختلف قليلًا إن حدّثوا الواجهة. إن ظهر أي خيار بمسمّى مختلف عمّا هنا أو واجهت خطأ غير متوقع، أخبرني بالنص الحرفي لما تراه وسأعدّل التعليمات.
