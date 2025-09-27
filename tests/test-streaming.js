#!/usr/bin/env node

import WebSocket from 'ws';

// Test streaming chat functionality
const wsUrl = 'ws://localhost:3001/ws/stt'; // Note: using existing STT endpoint for now

// Create a unique test chat first
async function createTestChat() {
  const chatId = 'test-chat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  const response = await fetch('http://localhost:3001/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Streaming Test Chat',
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0'
    })
  });

  if (response.ok) {
    const chat = await response.json();
    return chat.id;
  } else {
    throw new Error('Failed to create test chat');
  }
}

async function testStreaming() {
  try {
    console.log('🧪 Testing WebSocket streaming chat...');

    // Create a test chat first
    console.log('📝 Creating test chat...');
    const chatId = await createTestChat();
    console.log('✅ Created chat:', chatId);

    const testData = {
      type: 'chat',
      chatId: chatId,
      content: 'Hello, can you help me understand streaming responses?'
    };

    console.log('📤 Sending:', JSON.stringify(testData, null, 2));

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('✅ Connected to WebSocket');
      ws.send(JSON.stringify(testData));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📥 Received:', JSON.stringify(message, null, 2));

        if (message.type === 'error') {
          console.log('❌ Test failed with error:', message.error);
          ws.close();
        } else if (message.type === 'complete') {
          console.log('✅ Test completed successfully!');
          ws.close();
        }
      } catch (e) {
        console.log('📥 Raw message:', data.toString());
      }
    });

    ws.on('error', (error) => {
      console.log('❌ WebSocket error:', error.message);
    });

    ws.on('close', (code, reason) => {
      console.log(`🔌 Connection closed (${code}):`, reason.toString());
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      console.log('⏰ Test timed out');
      ws.close();
    }, 30000);

  } catch (error) {
    console.log('❌ Setup error:', error.message);
  }
}

testStreaming();
