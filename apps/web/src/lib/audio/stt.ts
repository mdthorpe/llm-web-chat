// Minimal mic → PCM16 (16kHz) → WebSocket streamer
export type SttHandlers = {
    onPartial?: (t: string) => void;
    onFinal?: (t: string) => void;
  };
  
  export async function startStt(wsUrl: string, handlers: SttHandlers = {}) {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    
    // Wait for WebSocket to open
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('WebSocket failed to connect'));
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
    
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === 'partial') handlers.onPartial?.(msg.text);
        if (msg.type === 'final') handlers.onFinal?.(msg.text);
        if (msg.type === 'error') console.error('STT error:', msg.error);
      } catch {
        // ignore
      }
    };
  
    const media = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext({ sampleRate: 48000 });
    const src = ctx.createMediaStreamSource(media);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
  
    src.connect(proc);
    proc.connect(ctx.destination);
  
    proc.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0); // Float32 @ 48k
      ws.send(downsampleToPcm16(input, 48000, 16000));
    };
  
    function stop() {
      try {
        proc.disconnect();
        src.disconnect();
        ctx.close();
        if (ws.readyState === WebSocket.OPEN) ws.send('END');
        ws.close();
        media.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
    }
  
    return stop;
  }
  
  function downsampleToPcm16(input: Float32Array, inRate: number, outRate: number): Uint8Array {
    const ratio = inRate / outRate;
    const outLen = Math.floor(input.length / ratio);
    const out = new Int16Array(outLen);
    let i = 0, j = 0;
    while (i < outLen) {
      const s = input[Math.floor(j)];
      out[i++] = Math.max(-1, Math.min(1, s)) * 0x7fff;
      j += ratio;
    }
    return new Uint8Array(out.buffer);
  }