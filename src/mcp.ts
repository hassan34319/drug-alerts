import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { createServer } from "./tools";
const server = createServer();
await server.connect(new StdioServerTransport());
