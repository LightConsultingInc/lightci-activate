import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ZodType } from 'zod';
import { IntegrationsService } from '../orgs/integrations.service';
import { AgentRun } from '../ops/entities/agent-run.entity';
import { mockResponder } from './mock-responders';

export interface AiCall {
  agent: string; // interviewer | scorer | builder | coach | grader | promoter | auditor
  task: string; // e.g. grader.skill, coach.next-exercise
  orgId?: string | null;
  personId?: string | null;
  system: string;
  messages: Anthropic.MessageParam[];
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxTokens?: number;
  /** Per-request timeout (ms) passed to the SDK; defaults to the client's 10-minute timeout. */
  timeoutMs?: number;
  /** Deterministic input the mock provider can key off (also logged). */
  mockSeed?: Record<string, unknown>;
}

export interface AiTextResult {
  text: string;
  runId: string;
}

/**
 * Single door to Claude. Every call is recorded as an AgentRun. The org's own
 * Anthropic key is used when the client uploaded one; otherwise LightCI's.
 * AI_PROVIDER=mock returns deterministic responders (used by E2E tests).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  readonly provider: 'live' | 'mock' =
    process.env.AI_PROVIDER === 'mock' ? 'mock' : 'live';
  readonly defaultModel = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5';
  readonly fastModel = process.env.ANTHROPIC_FAST_MODEL ?? 'claude-sonnet-5';
  private clients = new Map<string, Anthropic>();

  constructor(
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    private readonly integrations: IntegrationsService,
  ) {}

  private async clientFor(
    orgId?: string | null,
  ): Promise<{ client: Anthropic; source: string }> {
    const resolved = await this.integrations.resolve(
      orgId ?? null,
      'anthropic',
    );
    if (!resolved)
      throw new Error('No Anthropic API key configured (org or platform).');
    const cacheKey = `${resolved.source}:${resolved.secret.slice(-8)}`;
    let client = this.clients.get(cacheKey);
    if (!client) {
      client = new Anthropic({
        apiKey: resolved.secret,
        maxRetries: 3,
        timeout: 10 * 60 * 1000,
      });
      this.clients.set(cacheKey, client);
    }
    return { client, source: resolved.source };
  }

  /** Structured output: Claude fills `schema`; returns parsed value. */
  async structured<T>(call: AiCall, schema: ZodType<T>): Promise<T> {
    const started = Date.now();
    const run = this.runs.create({
      agent: call.agent,
      task: call.task,
      orgId: call.orgId ?? null,
      personId: call.personId ?? null,
      input: this.loggableInput(call),
      status: 'ok',
    });
    if (this.provider === 'mock') {
      const out = mockResponder<T>(call, schema);
      run.status = 'mock';
      run.output = out;
      run.durationMs = Date.now() - started;
      await this.runs.save(run);
      return out;
    }
    try {
      const { client } = await this.clientFor(call.orgId);
      const model = call.model ?? this.defaultModel;
      const response = await client.messages.parse(
        {
          model,
          max_tokens: call.maxTokens ?? 16000,
          system: [
            {
              type: 'text',
              text: call.system,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: call.messages,
          thinking: { type: 'adaptive' },
          output_config: {
            format: zodOutputFormat(schema),
            effort: call.effort ?? 'medium',
          },
        },
        call.timeoutMs ? { timeout: call.timeoutMs } : undefined,
      );
      run.model = model;
      run.inputTokens = response.usage.input_tokens;
      run.outputTokens = response.usage.output_tokens;
      run.durationMs = Date.now() - started;
      if (response.stop_reason === 'refusal') {
        run.status = 'refused';
        run.error = response.stop_details?.explanation ?? 'refused';
        await this.runs.save(run);
        throw new Error(
          `Claude declined this request (${response.stop_details?.category ?? 'refusal'}).`,
        );
      }
      if (!response.parsed_output)
        throw new Error('Claude returned no structured output');
      run.output = response.parsed_output;
      await this.runs.save(run);
      return response.parsed_output;
    } catch (error) {
      run.status = run.status === 'refused' ? 'refused' : 'error';
      run.error = error instanceof Error ? error.message : String(error);
      run.durationMs = Date.now() - started;
      await this.runs.save(run).catch(() => undefined);
      this.logger.error(`${call.task} failed: ${run.error}`);
      throw error;
    }
  }

  /** Free text (streaming under the hood so long outputs never time out). */
  async text(call: AiCall): Promise<AiTextResult> {
    const started = Date.now();
    const run = this.runs.create({
      agent: call.agent,
      task: call.task,
      orgId: call.orgId ?? null,
      personId: call.personId ?? null,
      input: this.loggableInput(call),
      status: 'ok',
    });
    if (this.provider === 'mock') {
      const out = mockResponder<{ text: string }>(
        { ...call, task: `${call.task}#text` },
        undefined,
      );
      run.status = 'mock';
      run.output = out;
      await this.runs.save(run);
      return { text: out.text, runId: run.id };
    }
    try {
      const { client } = await this.clientFor(call.orgId);
      const model = call.model ?? this.defaultModel;
      const stream = client.messages.stream(
        {
          model,
          max_tokens: call.maxTokens ?? 16000,
          system: [
            {
              type: 'text',
              text: call.system,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: call.messages,
          thinking: { type: 'adaptive' },
          output_config: { effort: call.effort ?? 'medium' },
        },
        call.timeoutMs ? { timeout: call.timeoutMs } : undefined,
      );
      const message = await stream.finalMessage();
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      run.model = model;
      run.inputTokens = message.usage.input_tokens;
      run.outputTokens = message.usage.output_tokens;
      run.durationMs = Date.now() - started;
      run.output = { text };
      if (message.stop_reason === 'refusal') {
        run.status = 'refused';
        run.error = message.stop_details?.explanation ?? 'refused';
      }
      await this.runs.save(run);
      return { text, runId: run.id };
    } catch (error) {
      run.status = 'error';
      run.error = error instanceof Error ? error.message : String(error);
      run.durationMs = Date.now() - started;
      await this.runs.save(run).catch(() => undefined);
      throw error;
    }
  }

  /** Verify an Anthropic key by listing models (cheap, no tokens). */
  async verifyKey(apiKey: string): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = new Anthropic({ apiKey, maxRetries: 0 });
      const models = await client.models.list({ limit: 5 });
      return {
        ok: true,
        detail: `Key valid; ${models.data.length}+ models visible.`,
      };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private loggableInput(call: AiCall): Record<string, unknown> {
    const lastUser = [...call.messages]
      .reverse()
      .find((m) => m.role === 'user');
    const preview =
      typeof lastUser?.content === 'string'
        ? lastUser.content.slice(0, 2000)
        : JSON.stringify(lastUser?.content ?? '').slice(0, 2000);
    return {
      systemChars: call.system.length,
      messages: call.messages.length,
      preview,
      mockSeed: call.mockSeed ?? null,
    };
  }
}
