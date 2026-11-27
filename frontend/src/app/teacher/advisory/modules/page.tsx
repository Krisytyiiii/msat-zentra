"use client";

import * as React from "react";
import { BookOpen, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { TeacherEmptyCard } from "../../components/TeacherEmptyCard";
import { Button } from "@/components/ui/button";
import { useDock } from "@/components/dock/dock-store";
import { MessageOverlay } from "@/components/ui/message-overlay";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { AdvisoryModulesSkeleton } from "./components/modules-skeleton";
import { ModulesEmptyKanban } from "./components/modules-empty-kanban";
import { ModulesPanel } from "./components/modules-panel";
import { ModuleDetailsOverlay } from "./components/module-details-overlay";
import { ModuleFormDialog } from "./components/module-form-dialog";
import { SubmissionsDrawer } from "./components/submissions-drawer";
import {
  modulesExtras,
  submissionsExtras,
  useAdvisoryModules,
  useCreateAdvisoryModule,
  useDeleteAdvisoryModule,
  useModuleSubmissions,
  useUpdateAdvisoryModule,
  type AdvisoryModulePayload,
  type AdvisoryModuleRow,
  type AdvisoryModuleKind,
  type ModuleStatusCounts,
} from "@/services/teacher/advisoryModules.service";

function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } })
    ?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const EMPTY_COUNTS: ModuleStatusCounts = { all: 0, submitted: 0, pending: 0, overdue: 0 };

export default function TeacherAdvisoryModulesPage() {
  const [sectionId, setSectionId] = React.useState<string | undefined>(undefined);
  const [modulePage, setModulePage] = React.useState(1);

  const [selectedModuleId, setSelectedModuleId] = React.useState<string | null>(null);
  const [submissionPage, setSubmissionPage] = React.useState(1);
  const [formOpen, setFormOpen] = React.useState(false);
  const [formKind, setFormKind] = React.useState<AdvisoryModuleKind>("general");
  const [editing, setEditing] = React.useState<AdvisoryModuleRow | null>(null);
  const [deleting, setDeleting] = React.useState<AdvisoryModuleRow | null>(null);
  const [viewing, setViewing] = React.useState<AdvisoryModuleRow | null>(null);

  const modulesQuery = useAdvisoryModules({
    page: modulePage,
    sectionId,
  });
  const extras = modulesExtras(modulesQuery.data);
  // While a new section is fetching, TanStack keeps the previous page's rows as
  // placeholder data. Drop them so the board never shows another section's
  // cards — a cached section still renders instantly, otherwise card skeletons.
  const switching = modulesQuery.isPlaceholderData;
  const rows = switching ? [] : (modulesQuery.data?.data ?? []);
  const sections = extras?.sections ?? [];
  const counts = extras?.counts ?? EMPTY_COUNTS;

  // The submissions live in a drawer, opened per module. Keep the id in local
  // state so a deleted or filtered-out module simply closes it.
  const drawerModule =
    selectedModuleId !== null
      ? (rows.find((r) => r.id === selectedModuleId) ?? null)
      : null;

  const submissionsQuery = useModuleSubmissions({
    moduleId: drawerModule?.id ?? null,
    page: submissionPage,
    enabled: drawerModule?.kind === "adm",
  });
  const submissionsExtrasData = submissionsExtras(submissionsQuery.data);
  const submissionRows = submissionsQuery.data?.data ?? [];
  const submissionCounts = submissionsExtrasData?.counts ?? EMPTY_COUNTS;

  // Keep the open overlay fresh if the module is edited or the page refetches.
  const viewingModule = viewing ? rows.find((r) => r.id === viewing.id) ?? viewing : null;

  const openSubmissions = (moduleId: string) => {
    setViewing(null);
    setSubmissionPage(1);
    setSelectedModuleId(moduleId);
  };

  const createModule = useCreateAdvisoryModule();
  const updateModule = useUpdateAdvisoryModule();
  const deleteModule = useDeleteAdvisoryModule();
  const dock = useDock();

  const saving = createModule.isPending || updateModule.isPending;

  const handleModuleSubmit = (payload: AdvisoryModulePayload) => {
    const wasEditing = editing !== null;
    const label = payload.moduleName ?? editing?.moduleName ?? "Module";

    // Close first, then report the request in the shared Dock (bottom-right).
    setFormOpen(false);
    setEditing(null);
    const taskId = dock.startTask({
      kind: "generic",
      title: wasEditing ? "Updating module" : "Releasing module",
      description: label,
    });

    const onSuccess = () => {
      dock.completeTask(taskId, wasEditing ? `${label} updated.` : `${label} released.`);
      toast.success({
        title: wasEditing ? "Module updated" : "Module released",
        description: label,
      });
    };
    const onError = (err: unknown) => {
      const message = errorMessage(err, "Try again.");
      dock.failTask(taskId, message);
      toast.error({ title: "Could not save module", description: message });
    };

    if (wasEditing && editing) {
      updateModule.mutate({ moduleId: editing.id, payload }, { onSuccess, onError });
    } else {
      createModule.mutate(
        { ...payload, ...(sectionId ? { sectionId } : {}) },
        { onSuccess, onError },
      );
    }
  };

  const handleDelete = () => {
    if (!deleting) return;
    const target = deleting;

    // Close first, then report the request in the shared Dock (bottom-right).
    setDeleting(null);
    const taskId = dock.startTask({
      kind: "generic",
      title: "Removing module",
      description: target.moduleName,
    });

    deleteModule.mutate(target.id, {
      onSuccess: () => {
        dock.completeTask(taskId, `${target.moduleName} removed.`);
        toast.success({ title: "Module removed", description: target.moduleName });
        if (selectedModuleId === target.id) setSelectedModuleId(null);
        if (viewing?.id === target.id) setViewing(null);
      },
      onError: (err) => {
        const message = errorMessage(err, "Try again.");
        dock.failTask(taskId, message);
        toast.error({ title: "Could not remove module", description: message });
      },
    });
  };

  if (modulesQuery.isPending && !modulesQuery.data) {
    return <AdvisoryModulesSkeleton />;
  }

  if (modulesQuery.isError && !modulesQuery.data) {
    return (
      <TeacherEmptyCard
        centered
        icon={BookOpen}
        title="No advisory section assigned"
        hint="Modules are released to your advisory section. Claim your advisory in Settings, then come back."
        label="Modules"
      />
    );
  }

  // Shared by the filled board header and the empty starter board, so the
  // adviser can switch advisory sections either way.
  const sectionPicker =
    sections.length > 1 ? (
      <Select
        value={sectionId ?? sections[0]?.id ?? ""}
        onValueChange={(value) => {
          setSectionId(value);
          setModulePage(1);
          setSelectedModuleId(null);
          setSubmissionPage(1);
        }}
      >
        <SelectTrigger className="h-7 w-40 text-xs" aria-label="Advisory section">
          <SelectValue placeholder="Section" />
        </SelectTrigger>
        <SelectContent>
          {sections.map((section) => (
            <SelectItem key={section.id} value={section.id}>
              {section.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  const startModule = (kind: AdvisoryModuleKind) => {
    setEditing(null);
    setFormKind(kind);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {counts.all === 0 ? (
        <div className="flex min-h-[calc(100dvh-10rem)] w-full items-center justify-center">
          <div className="w-full">
            <ModulesEmptyKanban onAdd={startModule} sectionPicker={sectionPicker} />
          </div>
        </div>
      ) : (
        <>
          <ModulesPanel
            rows={rows}
            counts={counts}
            total={switching ? 0 : (modulesQuery.data?.total ?? 0)}
            page={modulePage}
            selectedId={selectedModuleId ?? viewingModule?.id ?? null}
            loading={switching}
            headerActions={sectionPicker}
            onPageChange={setModulePage}
            onAdd={() => startModule("general")}
            onEdit={(module) => {
              setEditing(module);
              setFormOpen(true);
            }}
            onDelete={setDeleting}
            onSelect={(module) => {
              if (module.kind === "adm") openSubmissions(module.id);
              else setViewing(module);
            }}
            onOpen={setViewing}
          />
        </>
      )}

      {formOpen ? (
        <ModuleFormDialog
          key={editing?.id ?? "new"}
          module={editing}
          initialKind={editing ? undefined : formKind}
          pending={saving}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={handleModuleSubmit}
        />
      ) : null}

      <ModuleDetailsOverlay
        module={viewingModule}
        onClose={() => setViewing(null)}
        onEdit={(module) => {
          setEditing(module);
          setFormOpen(true);
          setViewing(null);
        }}
        onViewSubmissions={(module) => openSubmissions(module.id)}
      />

      <SubmissionsDrawer
        open={drawerModule?.kind === "adm"}
        moduleName={drawerModule?.moduleName ?? ""}
        kind={drawerModule?.kind ?? null}
        counts={submissionCounts}
        rows={submissionRows}
        total={submissionsQuery.data?.total ?? 0}
        page={submissionPage}
        loading={submissionsQuery.isPending && !submissionsQuery.data}
        onPageChange={setSubmissionPage}
        onClose={() => {
          setSelectedModuleId(null);
          setSubmissionPage(1);
        }}
      />

      {deleting ? (
        <MessageOverlay
          title="Remove module"
          description={
            <>
              Delete{" "}
              <span className="font-semibold text-foreground">
                &ldquo;{deleting.moduleName}&rdquo;
              </span>{" "}
              and every recorded submission for it?
            </>
          }
          tone="danger"
          icon={<Trash2 size={16} aria-hidden />}
          role="alertdialog"
          onDismiss={() => {
            if (!deleteModule.isPending) setDeleting(null);
          }}
          dismissable={!deleteModule.isPending}
          footerHint="This can't be undone."
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3 text-[12px]"
                onClick={() => setDeleting(null)}
                disabled={deleteModule.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 bg-red-600 px-3 text-[12px] text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                onClick={handleDelete}
                disabled={deleteModule.isPending}
                aria-busy={deleteModule.isPending || undefined}
              >
                {deleteModule.isPending ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <Trash2 size={14} aria-hidden />
                )}
                Remove module
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-1.5 rounded-md border border-red-500/30 bg-red-500/[0.06] p-2.5">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-700 dark:text-red-400">
              <TriangleAlert size={13} aria-hidden />
              What happens next
            </span>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-[12px] text-muted-foreground">
              <li>Every submission recorded against this module is deleted.</li>
              <li>Advisees lose access to the handout from their desk.</li>
              <li>The audit trail still keeps a record of the removal.</li>
            </ul>
          </div>
        </MessageOverlay>
      ) : null}
    </div>
  );
}
