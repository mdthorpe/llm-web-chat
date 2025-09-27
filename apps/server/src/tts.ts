import { PollyClient, SynthesizeSpeechCommand, VoiceId } from '@aws-sdk/client-polly';

const polly = new PollyClient({ region: process.env.AWS_REGION });

// Keep short texts (<3–5k chars). Use SSML for prosody if you want.
export async function synthesizeToMp3(text: string, voiceId = 'Ruth') {
  const cmd = new SynthesizeSpeechCommand({
    Text: text,
    TextType: 'text', // or 'ssml'
    OutputFormat: 'mp3',
    VoiceId: voiceId as VoiceId,
    Engine: 'neural', // use 'standard' if neural isn’t enabled for the voice
  });
  const res = await polly.send(cmd);
  const arrayBuffer = await res.AudioStream?.transformToByteArray();
  return arrayBuffer ?? new Uint8Array();
}