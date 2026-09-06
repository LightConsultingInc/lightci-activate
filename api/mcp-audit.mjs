// throwaway: node mcp-audit.mjs <token> <tool|list|resource|resources> [argsJson]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const [token, tool, argsJson] = process.argv.slice(2);
const client = new Client({ name: 'audit', version: '0.0.1' });
const transport = new StreamableHTTPClientTransport(new URL('http://localhost:4310/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
await client.connect(transport);
if (tool === 'list') {
  const r = await client.listTools();
  console.log(JSON.stringify(r.tools.map((t) => ({ name: t.name, meta: t._meta, annotations: t.annotations, desc: t.description })), null, 2));
} else if (tool === 'resources') {
  console.log(JSON.stringify(await client.listResources(), null, 2));
} else if (tool === 'resource') {
  const r = await client.readResource({ uri: 'ui://activate/app.html' });
  const c = r.contents[0];
  console.log(JSON.stringify({ uri: c.uri, mimeType: c.mimeType, bytes: Buffer.byteLength(c.text ?? '', 'utf8'), meta: c._meta, extScript: (c.text.match(/<script[^>]+src=["']https?:/g) || []).length, extLink: (c.text.match(/<link[^>]+href=["']https?:/g) || []).length, anyHttpSrc: (c.text.match(/src="http/g) || []).length }));
} else {
  const r = await client.callTool({ name: tool, arguments: argsJson ? JSON.parse(argsJson) : {} });
  console.log(JSON.stringify({ isError: r.isError, text: r.content?.map((c) => c.text).join('\n'), structuredContent: r.structuredContent }, null, 2));
}
await client.close();
