#!/usr/bin/env node

// Mock test for streaming functionality without WebSocket
import { generateWithBedrockStream } from '../apps/server/src/bedrock.js';

async function testStreaming() {
  console.log('🧪 Testing streaming function directly...\n');
  
  // Mock conversation
  const mockConversation = [
    { role: 'user', content: 'Hello, can you explain async generators?' },
    { role: 'assistant', content: 'Sure! Async generators are...' },
    { role: 'user', content: 'Can you give me an example?' }
  ];
  
  console.log('📤 Input conversation:');
  mockConversation.forEach((msg, i) => {
    console.log(`  ${i + 1}. ${msg.role.toUpperCase()}: ${msg.content.substring(0, 50)}...`);
  });
  
  console.log('\n⏳ Starting streaming response...\n');
  
  let chunkCount = 0;
  let fullResponse = '';
  
  try {
    const streamGenerator = generateWithBedrockStream(
      'anthropic.claude-3-haiku-20240307-v1:0',
      mockConversation,
      { reqId: 'test-123', chatId: 'test-chat', messageId: 'test-msg' }
    );
    
    for await (const chunk of streamGenerator) {
      chunkCount++;
      fullResponse += chunk;
      console.log(`📦 Chunk ${chunkCount}: "${chunk}"`);
      
      // Stop after a few chunks for demo
      if (chunkCount >= 10) break;
    }
    
    console.log(`\n✅ Received ${chunkCount} chunks`);
    console.log(`📄 Total response length: ${fullResponse.length} characters`);
    console.log(`\n🎯 First 200 characters: "${fullResponse.substring(0, 200)}..."`);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testStreaming();
