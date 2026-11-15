import { describe, expect, it } from 'vitest';
import { hostedSession } from '../../testing/index.js';

// Requests as claude 2.1.325 sent them in stream-json mode (measured live, #1201).
const line = (event: object) => JSON.stringify(event);
const INIT = line({
  type: 'system',
  subtype: 'init',
  session_id: 'c0ffee00-0000-4000-8000-0000000000aa',
});
const WRITE = line({
  type: 'control_request',
  request_id: 'req-w',
  request: {
    subtype: 'can_use_tool',
    tool_name: 'Write',
    input: { file_path: 'made.txt', content: 'tide' },
    permission_suggestions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
    tool_use_id: 'toolu_w',
  },
});
const QUESTION = line({
  type: 'control_request',
  request_id: 'req-q',
  request: {
    subtype: 'can_use_tool',
    tool_name: 'AskUserQuestion',
    input: {
      questions: [
        {
          question: 'Tea or coffee?',
          header: 'Drink',
          options: [
            { label: 'Tea', description: 'Leaves' },
            { label: 'Coffee', description: 'Beans' },
          ],
          multiSelect: false,
        },
      ],
    },
    tool_use_id: 'toolu_q',
  },
});

/** What Mesa wrote back to claude for request `id`. */
const responseTo = (sent: Record<string, unknown>[], id: string) =>
  sent.find(
    (m) =>
      m.type === 'control_response' && (m.response as { request_id?: string }).request_id === id,
  )?.response as { response: Record<string, unknown> } | undefined;

describe("a Structured session's permission request", () => {
  it('is its pending prompt with Allow, Allow always and Deny, and Allow answers it', async () => {
    const w = await hostedSession([INIT, WRITE]);
    expect(await w.mesa.sessions.prompt(w.record.id)).toEqual({
      status: 'pending',
      session: w.record.id,
      id: 'req-w',
      kind: 'permission',
      tool: 'Write',
      summary: 'made.txt',
      options: [
        { id: 'allow', label: 'Allow' },
        { id: 'always', label: 'Allow always' },
        { id: 'deny', label: 'Deny' },
      ],
      freeText: true,
    });
    const { result } = await w.mesa.sessions.answer(w.record.id, {
      option: 'allow',
      prompt: 'req-w',
    });
    expect(result).toMatchObject({
      answered: true,
      option: 'allow',
      answer: 'Allow',
      kind: 'permission',
    });
    expect(responseTo(w.fake.sent, 'req-w')?.response).toEqual({
      behavior: 'allow',
      updatedInput: { file_path: 'made.txt', content: 'tide' },
    });
    // Answered: nothing waits now, and the same answer again is stale.
    await expect(w.mesa.sessions.prompt(w.record.id)).rejects.toThrow(/not waiting on a prompt/);
    await expect(w.mesa.sessions.answer(w.record.id, { option: 'allow' })).rejects.toThrow(/stale/);
    w.host.stop();
    await w.host.done;
  });

  it("allows always with claude's suggested rules", async () => {
    const w = await hostedSession([INIT, WRITE]);
    await w.mesa.sessions.answer(w.record.id, { option: 'always' });
    expect(responseTo(w.fake.sent, 'req-w')?.response).toMatchObject({
      behavior: 'allow',
      updatedPermissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
    });
    w.host.stop();
    await w.host.done;
  });

  it('denies with the typed message, or a plain one', async () => {
    const w = await hostedSession([INIT, WRITE]);
    const { result } = await w.mesa.sessions.answer(w.record.id, { text: 'not in this folder' });
    expect(result).toMatchObject({ answer: 'not in this folder' });
    expect(responseTo(w.fake.sent, 'req-w')?.response).toEqual({
      behavior: 'deny',
      message: 'not in this folder',
    });
    const other = await hostedSession([INIT, WRITE]);
    await other.mesa.sessions.answer(other.record.id, { option: 'deny' });
    expect(responseTo(other.fake.sent, 'req-w')?.response).toEqual({
      behavior: 'deny',
      message: 'The person denied this from Mesa.',
    });
    for (const s of [w, other]) {
      s.host.stop();
      await s.host.done;
    }
  });

  it('refuses an answer meant for another request', async () => {
    const w = await hostedSession([INIT, WRITE]);
    await expect(
      w.mesa.sessions.answer(w.record.id, { option: 'allow', prompt: 'req-old' }),
    ).rejects.toThrow(/stale answer: .* now waits on another prompt/);
    expect(responseTo(w.fake.sent, 'req-w')).toBeUndefined();
    w.host.stop();
    await w.host.done;
  });
});

describe("a Structured session's AskUserQuestion", () => {
  it('offers the answers by number and sends the chosen one as the answer', async () => {
    const w = await hostedSession([INIT, QUESTION]);
    expect(await w.mesa.sessions.prompt(w.record.id)).toMatchObject({
      kind: 'question',
      tool: 'AskUserQuestion',
      summary: 'Tea or coffee?',
      options: [
        { id: '1', label: 'Tea', description: 'Leaves' },
        { id: '2', label: 'Coffee', description: 'Beans' },
      ],
      freeText: true,
    });
    const { result } = await w.mesa.sessions.answer(w.record.id, { option: '2' });
    expect(result).toMatchObject({ option: '2', answer: 'Coffee', kind: 'question' });
    expect(responseTo(w.fake.sent, 'req-q')?.response).toMatchObject({
      behavior: 'allow',
      updatedInput: { answers: { 'Tea or coffee?': 'Coffee' } },
    });
    w.host.stop();
    await w.host.done;
  });

  it('takes a typed answer, and leaves nothing pending once the turn ends', async () => {
    const w = await hostedSession([INIT, QUESTION]);
    await w.mesa.sessions.answer(w.record.id, { text: 'Green tea' });
    expect(responseTo(w.fake.sent, 'req-q')?.response).toMatchObject({
      updatedInput: { answers: { 'Tea or coffee?': 'Green tea' } },
    });
    const ended = await hostedSession([
      INIT,
      QUESTION,
      line({ type: 'result', subtype: 'error_during_execution', is_error: true, result: '' }),
    ]);
    await expect(ended.mesa.sessions.prompt(ended.record.id)).rejects.toThrow(/not waiting/);
    for (const s of [w, ended]) {
      s.host.stop();
      await s.host.done;
    }
  });
});
