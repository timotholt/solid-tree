// supabase-js eagerly builds a RealtimeClient, which needs a global WebSocket.
// Node < 22 has none — provide one. Import this BEFORE creating any supabase client.
import ws from "ws";
if (!globalThis.WebSocket) globalThis.WebSocket = ws;
