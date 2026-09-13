#!/usr/bin/env node
/* نقطة دخول stdio — للاستخدام المحلي (Claude Desktop، Claude Code، إلخ) عبر
   تشغيل عملية Node مباشرة كما في claude_desktop_config.json. للاتصال عن بُعد
   عبر رابط https (موصل مخصص في تطبيق الجوال/الويب) استخدم http-server.mjs
   بدلًا من هذا الملف — انظر README.md. */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./create-server.mjs";

const server = createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
