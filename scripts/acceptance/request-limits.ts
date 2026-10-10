export default function observe(pi: {
  on(event: string, handler: (event: { payload?: Record<string, unknown> }) => void): void;
}) {
  pi.on('before_provider_request', (event: { payload?: Record<string, unknown> }) => {
    const payload = event.payload ?? {};
    process.stderr.write(
      JSON.stringify({
        diagnostic: 'request-limits',
        maxTokens: payload.max_tokens ?? payload.max_output_tokens,
        tools: Array.isArray(payload.tools) ? payload.tools.length : undefined,
        toolChoice: payload.tool_choice,
      }) + '\n',
    );
  });
}
