import { WebSocketServer } from 'ws';
import http from 'http';
const PORT = 4001;
// Create an HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Audio Backend Running\n');
});
// Create a WebSocket server attached to the HTTP server
const wss = new WebSocketServer({ server, path: '/audio' });
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[+] Client connected from ${clientIp}`);
    let chunkCount = 0;
    ws.on('message', (message) => {
        chunkCount++;
        console.log(`[Data] Received chunk #${chunkCount} from client`);
        // Note: No audio decoding or encoding is happening here yet.
    });
    ws.on('close', () => {
        console.log(`[-] Client disconnected. Total chunks received: ${chunkCount}`);
    });
    ws.on('error', (error) => {
        console.error(`[!] WebSocket error: ${error.message}`);
    });
});
server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`Backend Audio Service Skeleton is running`);
    console.log(`Listening on ws://localhost:${PORT}/audio`);
    console.log(`=========================================`);
});
