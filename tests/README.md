# Streaming Tests

This directory contains test scripts for the streaming chat functionality.

## Available Tests

### `test-streaming-mock.js`
Tests the streaming function directly without WebSocket complexity.
- ✅ **Fast** - No server startup required
- ✅ **Simple** - Tests the core streaming logic
- ✅ **Reliable** - Works even without AWS credentials (uses mock mode)

**Run with:**
```bash
bun run test:streaming-mock
# or
node tests/test-streaming-mock.js
```

### `test-streaming.js`
Tests the full WebSocket integration.
- ✅ **Complete** - Tests WebSocket + streaming end-to-end
- ❌ **Requires server** - Needs the server running on port 3001
- ❌ **Requires WebSocket library** - Needs `ws` package installed

**Run with:**
```bash
bun run test:streaming
# or
node tests/test-streaming.js
```

## Test Output Examples

### Mock Test (Successful)
```
🧪 Testing streaming function directly...

📤 Input conversation:
  1. USER: Hello, can you explain async generators?
  2. ASSISTANT: Sure! Async generators are...
  3. USER: Can you give me an example?

⏳ Starting streaming response...

📦 Chunk 1: "Async "
📦 Chunk 2: "generators "
📦 Chunk 3: "are "
📦 Chunk 4: "functions "
📦 Chunk 5: "that "
📦 Chunk 6: "can "
📦 Chunk 7: "be "
📦 Chunk 8: "paused "
📦 Chunk 9: "and "
📦 Chunk 10: "resumed..."

✅ Received 10 chunks
📄 Total response length: 156 characters
🎯 First 200 characters: "Async generators are functions that can be paused and resumed..."
```

### WebSocket Test (Requires Server)
```
🧪 Testing WebSocket streaming chat...
📤 Sending: {"type":"chat","chatId":"test-chat-123","content":"Hello, can you help me understand streaming responses?"}
✅ Connected to WebSocket
📥 Received: {"type":"start","messageId":"abc-123"}
📥 Received: {"type":"chunk","text":"Sure"}
📥 Received: {"type":"chunk","text":"! "}
📥 Received: {"type":"chunk","text":"I"}
📥 Received: {"type":"chunk","text":"'d "}
📥 Received: {"type":"chunk","text":"be "}
📥 Received: {"type":"complete","messageId":"abc-123","responseId":"def-456","summary":"Here's some information about streaming."}
✅ Test completed successfully!
```

## Running Tests

### Option 1: Using npm/bun scripts (Recommended)
```bash
# Run mock test (fast, no server required)
bun run test

# Run WebSocket test (requires server running)
bun run test:streaming
```

### Option 2: Direct node execution
```bash
# Mock test
node tests/test-streaming-mock.js

# WebSocket test
node tests/test-streaming.js
```

## Prerequisites

### For Mock Test
- ✅ Node.js installed
- ✅ Project dependencies installed

### For WebSocket Test
- ✅ Node.js installed
- ✅ `ws` package installed: `npm install ws`
- ✅ Server running: `bun run dev:server`

## Troubleshooting

### Mock Test Issues
- **"Cannot resolve module"** - Make sure you're in the project root
- **"MOCK_BEDROCK not set"** - Set `MOCK_BEDROCK=true` environment variable

### WebSocket Test Issues
- **"Connection refused"** - Make sure server is running on port 3001
- **"ws module not found"** - Install: `npm install ws`
- **"Invalid JSON" errors** - Check if chat exists in database

## Adding New Tests

1. Create a new `.js` file in this directory
2. Add it to `package.json` scripts section
3. Update this README
4. Follow the existing patterns for error handling and output formatting
