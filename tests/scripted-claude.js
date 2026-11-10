// A stand-in for the Anthropic client used in tests and local demo mode: it plays a fixed
// tool-use script (query by year+payer → show chart → answer) so the full loop runs without an API key.
export function scriptedClaude() {
  let step = 0;
  let lastRows = [];
  const client = {
    calls: [],
    messages: {
      async create(req) {
        client.calls.push(req);
        const last = req.messages[req.messages.length - 1];
        if (Array.isArray(last.content) && last.content[0]?.type === 'tool_result' && step === 1) {
          lastRows = JSON.parse(last.content[0].content).rows;
        }
        step += 1;
        if (step === 1) {
          return { stop_reason: 'tool_use', usage: {}, content: [{ type: 'tool_use', id: 't1', name: 'query_spending', input: { group_by: ['year', 'payer'] } }] };
        }
        if (step === 2) {
          const years = [...new Set(lastRows.map((r) => r.year))];
          const data = years.map((y) => ({ label: y, ...Object.fromEntries(lastRows.filter((r) => r.year === y).map((r) => [r.payer, r.total])) }));
          return { stop_reason: 'tool_use', usage: {}, content: [{ type: 'tool_use', id: 't2', name: 'show_chart', input: { type: 'stacked_bar', title: 'Spend per year by person', x_key: 'label', series: [{ key: 'Srikanth', label: 'Srikanth' }, { key: 'Neelu', label: 'Neelu' }], data } }] };
        }
        const tot = lastRows.reduce((a, r) => a + r.total, 0);
        return { stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: `**Demo answer (no API key set).** Across all years the sheet adds up to ₹${Math.round(tot).toLocaleString('en-IN')}.\n\n- This reply is scripted; with a real key Claude writes it.\n- The chart above came from real tool calls over your data.` }] };
      },
    },
  };
  return client;
}
