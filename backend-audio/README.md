# Backend Audio Service

This is the minimal skeleton for the backend audio service. 
Its current purpose is to receive raw WebSocket audio chunks from the Next.js studio frontend.

**Important:** This service currently only targets **SonicPanel / SHOUTcast**. There is no Icecast implementation planned. Real streaming (encoding/decoding) is not yet implemented in this skeleton.

## How to run backend-audio

1. Open a terminal and navigate to this directory:
   ```bash
   cd "backend-audio"
   ```
2. Make sure dependencies are installed:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

The server will start and listen for WebSocket connections on `ws://localhost:4001/audio`.

## How to test connection manually

You can test the WebSocket connection using an online WebSocket client (like Hoppscotch or Postman), or simply using a web browser console.

1. Open your browser console (F12) on any page.
2. Run the following JavaScript snippet:
   ```javascript
   const ws = new WebSocket("ws://localhost:4001/audio");
   
   ws.onopen = () => {
     console.log("Connected successfully!");
     ws.send("Test chunk 1");
     ws.send("Test chunk 2");
   };
   
   ws.onclose = () => {
     console.log("Disconnected.");
   };
   ```
3. Check the backend terminal to verify it logged the connection and the received chunks.
