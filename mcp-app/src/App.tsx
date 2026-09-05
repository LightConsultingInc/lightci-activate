import { useCallback, useEffect, useMemo, useState } from 'react';
import type { App as McpApp, McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { useApp, useDocumentTheme, useHostStyles } from '@modelcontextprotocol/ext-apps/react';
import { CardShell } from './components/CardShell';
import { StateBlock } from './components/ui';
import { ERROR_FIXTURE, FIXTURES } from './fixtures';
import { asEnvelope, isToolName, type ToolEnvelope, type ToolName } from './lib/envelope';
import { useActivateApi } from './lib/useActivateApi';
import { GradeCard } from './cards/GradeCard';
import { LadderCard } from './cards/LadderCard';
import { LibraryCard } from './cards/LibraryCard';
import { OrgCard } from './cards/OrgCard';
import { PromotionQueueCard } from './cards/PromotionQueueCard';
import { ScribeCard } from './cards/ScribeCard';
import { SkillDetailCard } from './cards/SkillDetailCard';
import { TeamCard } from './cards/TeamCard';
import type {
  InterviewView, LadderView, LibraryPayload, OrgPayload, PromotionQueuePayload, SkillDetail, SubmitArtifactPayload, SubmitSkillPayload, TeamView,
} from './types';

interface ToolResultLike {
  structuredContent?: Record<string, unknown>;
  content?: { type: string; text?: string }[];
  isError?: boolean;
}

function readMock(): { tool: ToolName | 'error' | 'empty' | 'all' | null; theme: 'light' | 'dark' | null } {
  const q = new URLSearchParams(window.location.search);
  const mock = q.get('mock');
  const theme = q.get('theme');
  return {
    tool: mock === 'error' || mock === 'empty' || mock === 'all' ? mock : isToolName(mock) ? mock : null,
    theme: theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : null,
  };
}

export function ActivateApp() {
  const mock = useMemo(readMock, []);
  const isMock = mock.tool !== null;

  const [toolInput, setToolInput] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<ToolResultLike | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>(undefined);
  const [connectError, setConnectError] = useState<string | null>(null);

  const { app, isConnected, error } = useApp({
    appInfo: { name: 'Activate', version: '0.1.0' },
    capabilities: {},
    onAppCreated: (a: McpApp) => {
      a.ontoolinput = (params) => setToolInput(params.arguments ?? {});
      a.ontoolresult = (params) => setResult(params as ToolResultLike);
      a.onhostcontextchanged = (ctx) => setHostContext((prev) => ({ ...(prev ?? {}), ...ctx }));
      a.onerror = (e) => setConnectError(e instanceof Error ? e.message : String(e));
    },
  });

  useHostStyles(app, app?.getHostContext());
  const theme = useDocumentTheme();

  useEffect(() => {
    if (app && !hostContext) setHostContext(app.getHostContext());
  }, [app, hostContext]);

  useEffect(() => {
    if (mock.theme) document.documentElement.setAttribute('data-theme', mock.theme);
    else if (isMock && window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('data-theme', 'dark');
  }, [mock.theme, isMock]);

  const api = useActivateApi(isMock ? null : app, isMock);

  const displayMode = hostContext?.displayMode ?? 'inline';
  const canFullscreen = Boolean(hostContext?.availableDisplayModes?.includes('fullscreen')) || isMock;
  const [mockFullscreen, setMockFullscreen] = useState(false);
  const fullscreen = isMock ? mockFullscreen : displayMode === 'fullscreen';

  const onToggleFullscreen = useCallback(async () => {
    if (isMock || !app) { setMockFullscreen((f) => !f); return; }
    try {
      await app.requestDisplayMode({ mode: displayMode === 'fullscreen' ? 'inline' : 'fullscreen' });
    } catch { /* host declined; stay inline */ }
  }, [app, displayMode, isMock]);

  const onOpenWeb = useCallback(async (url: string) => {
    if (!url) return;
    if (isMock || !app) { window.open(url, '_blank', 'noopener'); return; }
    try { await app.openLink({ url }); } catch { window.open(url, '_blank', 'noopener'); }
  }, [app, isMock]);

  const sendMessage = useCallback(async (text: string) => {
    if (isMock || !app) return false;
    try {
      await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
      return true;
    } catch { return false; }
  }, [app, isMock]);

  const shell = { onOpenWeb, fullscreen, canFullscreen, onToggleFullscreen };

  // ---- Mock routing -------------------------------------------------------
  if (isMock) {
    if (mock.tool === 'all') {
      return (
        <div className="flex flex-col gap-4 p-3">
          {(Object.keys(FIXTURES) as ToolName[]).map((t) => <CardRouter key={t} envelope={FIXTURES[t]} api={api} shell={shell} sendMessage={sendMessage} />)}
        </div>
      );
    }
    if (mock.tool === 'error') return <div className="p-2"><ErrorCard envelope={ERROR_FIXTURE} shell={shell} /></div>;
    if (mock.tool === 'empty') return <div className="p-2"><EmptyCard shell={shell} reason="Waiting for Claude to call an Activate tool." /></div>;
    return <div className="p-2"><CardRouter envelope={FIXTURES[mock.tool as ToolName]} api={api} shell={shell} sendMessage={sendMessage} /></div>;
  }

  // ---- Host routing -------------------------------------------------------
  if (error || connectError) {
    return <EmptyCard shell={shell} kind="error" title="Couldn't connect to the host" reason={(error?.message ?? connectError) || 'Unknown error'} />;
  }
  if (!isConnected) return <EmptyCard shell={shell} kind="loading" title="Connecting to Activate…" reason="" />;

  const envelope = asEnvelope(result?.structuredContent);
  const toolName = envelope?.tool ?? (isToolName(hostContext?.toolInfo?.tool?.name) ? hostContext!.toolInfo!.tool.name as ToolName : null);

  if (!result) {
    return <EmptyCard shell={shell} kind="loading" title={toolName ? `Loading ${toolName.replace(/_/g, ' ')}…` : 'Loading…'} reason={toolInput ? describeInput(toolInput) : ''} />;
  }

  if (!envelope) {
    const text = result.content?.find((c) => c.type === 'text')?.text;
    return <EmptyCard shell={shell} kind={result.isError ? 'error' : 'empty'} title={result.isError ? 'Activate returned an error' : 'Nothing to show'} reason={text ?? 'The tool result had no structured content this card understands.'} />;
  }

  if (envelope.error || envelope.data === null || envelope.data === undefined) return <ErrorCard envelope={envelope} shell={shell} />;
  return <CardRouter envelope={envelope} api={api} shell={shell} sendMessage={sendMessage} data-theme={theme} />;
}

function describeInput(input: Record<string, unknown>): string {
  const parts = Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  return parts.length ? parts.join(' · ').slice(0, 160) : '';
}

type RouterProps = { envelope: ToolEnvelope; api: ReturnType<typeof useActivateApi>; shell: Parameters<typeof LadderCard>[0]['shell']; sendMessage: (t: string) => Promise<boolean>; 'data-theme'?: string };

function CardRouter({ envelope, api, shell, sendMessage }: RouterProps) {
  const common = { api, shell, sendMessage };
  switch (envelope.tool) {
    case 'my_ladder': return <LadderCard envelope={envelope as ToolEnvelope<LadderView>} {...common} />;
    case 'library': return <LibraryCard envelope={envelope as ToolEnvelope<LibraryPayload>} {...common} />;
    case 'skill_detail': return <SkillDetailCard envelope={envelope as ToolEnvelope<SkillDetail>} {...common} />;
    case 'submit_skill': return <GradeCard envelope={envelope as ToolEnvelope<SubmitSkillPayload>} {...common} />;
    case 'submit_artifact': return <GradeCard envelope={envelope as ToolEnvelope<SubmitArtifactPayload>} {...common} />;
    case 'map_workflow': return <ScribeCard envelope={envelope as ToolEnvelope<InterviewView>} {...common} />;
    case 'team': return <TeamCard envelope={envelope as ToolEnvelope<TeamView>} {...common} />;
    case 'org': return <OrgCard envelope={envelope as ToolEnvelope<OrgPayload>} {...common} />;
    case 'promotion_queue': return <PromotionQueueCard envelope={envelope as ToolEnvelope<PromotionQueuePayload>} {...common} />;
    default: return <EmptyCard shell={shell} reason={`Unknown tool ${String((envelope as { tool: unknown }).tool)}.`} />;
  }
}

function ErrorCard({ envelope, shell }: { envelope: ToolEnvelope; shell: RouterProps['shell'] }) {
  const e = envelope.error;
  const title = e?.status === 401 ? 'Sign in to Activate' : e?.status === 403 ? 'Not available for your role' : e?.status === 404 ? 'Not found' : (e?.title ?? 'Something went wrong');
  const detail = e?.detail ?? 'Activate returned no data for this card.';
  return (
    <CardShell {...shell} eyebrow="Activate" title={title} webUrl={envelope.links?.web} viewer={envelope.viewer} testId="card-error">
      <StateBlock kind="error" title={e ? `${e.status} ${e.title}` : 'No data'} detail={detail} />
    </CardShell>
  );
}

function EmptyCard({ shell, reason, kind = 'empty', title }: { shell: RouterProps['shell']; reason: string; kind?: 'empty' | 'error' | 'loading'; title?: string }) {
  return (
    <CardShell {...shell} eyebrow="Activate" title={title ?? 'Activate'} testId="card-empty">
      <StateBlock kind={kind} title={title ?? 'Nothing to show yet'} detail={reason || undefined} />
    </CardShell>
  );
}
