import { Bot, Box, Cloud, Database, FolderGit, KeyRound, Plug, Server, User, Workflow, Wrench, type LucideIcon } from "lucide-react";

import { ENTITY_KIND_META, type EntityKind } from "@/lib/domain";
import { cx } from "@/lib/cx";

const ICONS: Record<EntityKind, LucideIcon> = {
  agent: Bot,
  person: User,
  host: Server,
  mcp_server: Plug,
  tool: Wrench,
  credential: KeyRound,
  repository: FolderGit,
  service: Cloud,
  data_store: Database,
  resource: Box,
  job: Workflow,
};

/** The kind's icon, decorative unless `labelled` (then it carries the kind's name for screen readers). */
export function KindIcon({ kind, className, labelled = false }: { kind: EntityKind; className?: string; labelled?: boolean }) {
  const Icon = ICONS[kind];
  const label = ENTITY_KIND_META[kind].label;
  return <Icon aria-hidden={!labelled} aria-label={labelled ? label : undefined} role={labelled ? "img" : undefined} className={cx("size-4 shrink-0", className)} strokeWidth={1.75} />;
}

/** Icon plus kind label, e.g. for a row's first line. */
export function KindLabel({ kind }: { kind: EntityKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
      <KindIcon kind={kind} className="size-3.5" />
      {ENTITY_KIND_META[kind].label}
    </span>
  );
}
