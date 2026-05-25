FROM node:20-bullseye-slim

# Install ffmpeg for audio conversion
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose the WebSocket port
EXPOSE 4001

# Run the compiled JS file
CMD ["node", "dist/index.js"]
