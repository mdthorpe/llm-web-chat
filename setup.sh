#!/usr/bin/env bash

# LLM Web Chat Setup Script

echo "🚀 Setting up LLM Web Chat..."

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install from https://bun.sh"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Create .env file if it doesn't exist
if [ ! -f "apps/server/.env" ]; then
    echo "📝 Creating .env file..."
    cat > apps/server/.env << EOF
# Server configuration
PORT=3001

# AWS configuration
AWS_REGION=us-east-1

# Bedrock configuration
DEFAULT_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
SUMMARIZER_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0

# Optional: Bedrock provisioned throughput
# BEDROCK_INFERENCE_PROFILE_ARN=arn:aws:bedrock:us-east-1:123456789012:inference-profile/your-profile-id
EOF
    echo "⚠️  Please edit apps/server/.env with your AWS configuration"
fi

# Initialize database
echo "🗄️  Initializing database..."
cd apps/server
bun run db:push
bun run db:migrate
cd ../..

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit apps/server/.env with your AWS credentials and region"
echo "2. Ensure your AWS account has access to:"
echo "   - Amazon Bedrock (with Claude models enabled)"
echo "   - Amazon Transcribe Streaming" 
echo "   - Amazon Polly"
echo "3. Run 'bun run dev' to start the application"
echo ""
echo "The app will be available at:"
echo "   - Server: http://localhost:3001"
echo "   - Web UI: http://localhost:5173"
