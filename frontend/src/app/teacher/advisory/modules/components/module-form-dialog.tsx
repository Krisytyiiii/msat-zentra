"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  BookOpen,
  CalendarDays,
  CalendarIcon,
  Check,
  FileText,
  Link2,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidePanel } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  formatFileSize,
  isUploadedModuleFile,
  moduleFileName,
  uploadAdvisoryModuleAttachment,
  type AdvisoryModuleKind,
  type AdvisoryModulePayload,
  type AdvisoryModuleRow,
} from "@/services/teacher/advisoryModules.service";

/** Local-midnight ISO for a picked day, matching what the API stores. */
const toIso = (value: Date | undefined) =>
  value ? new Date(`${format(value, "yyyy-MM-dd")}T00:00:00`).toISOString() : null;

const fromIso = (iso: string | null) => {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["pdf", "doc", "docx"];

/** Amber focus edge, matching the teacher search field and the type cards. */
const FIELD_CLASS = "focus-visible:border-amber-500 focus-visible:ring-amber-500/25";

type AttachmentMode = "upload" | "link";

const ATTACHMENT_OPTIONS = [
  { value: "upload" as const, label: "Upload file" },
  { value: "link" as const, label: "Paste link" },
];

interface PickedFile {
  url: string;
  name: string;
  size: number | null;
}

const errorText = (err: unknown, fallback: string) => {
  const data = (
    err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } }
  )?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
};

export function ModuleFormDialog({
  module,
  initialKind,
  pending,
  onClose,
  onSubmit,
}: {
  /** null = release a new module; otherwise edit this one. */
  module: AdvisoryModuleRow | null;
  /** Preselected type for a new module (the empty-state quick actions). */
  initialKind?: AdvisoryModuleKind;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: AdvisoryModulePayload) => void;
}) {
  const editing = module !== null;
  const existingAttachment =
    module?.moduleUrl && isUploadedModuleFile(module.moduleUrl)
      ? {
          url: module.moduleUrl,
          name: moduleFileName(module.moduleUrl) ?? "Attached module file",
          size: null,
        }
      : null;

  const [moduleName, setModuleName] = React.useState(module?.moduleName ?? "");
  const [kind, setKind] = React.useState<AdvisoryModuleKind>(
    module?.kind ?? initialKind ?? "general",
  );
  const [dueDate, setDueDate] = React.useState<Date | undefined>(fromIso(module?.dueDate ?? null));
  const [dueOpen, setDueOpen] = React.useState(false);
  const [mode, setMode] = React.useState<AttachmentMode>(
    existingAttachment ? "upload" : module?.moduleUrl ? "link" : "upload",
  );
  const [linkUrl, setLinkUrl] = React.useState(
    module?.moduleUrl && !isUploadedModuleFile(module.moduleUrl) ? module.moduleUrl : "",
  );
  const [attachment, setAttachment] = React.useState<PickedFile | null>(existingAttachment);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [description, setDescription] = React.useState(module?.description ?? "");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const releasedOn = fromIso(module?.releaseDate ?? null);
  const canSubmit = moduleName.trim().length > 0 && !pending && !uploading;

  const pickFile = async (file: File | undefined | null) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setUploadError("Only PDF, DOC, or DOCX files are accepted.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("That file is larger than 10 MB. Compress it or share a link instead.");
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const uploaded = await uploadAdvisoryModuleAttachment(file);
      setAttachment({
        url: uploaded.url,
        name: uploaded.fileName || file.name,
        size: uploaded.fileSize ?? file.size,
      });
    } catch (err) {
      setUploadError(errorText(err, "Could not upload that file. Try again."));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const moduleUrl =
      mode === "upload" ? (attachment?.url ?? null) : linkUrl.trim() ? linkUrl.trim() : null;
    onSubmit({
      moduleName: moduleName.trim(),
      ...(editing ? {} : { kind }),
      dueDate: toIso(dueDate),
      moduleUrl,
      description: description.trim() ? description.trim() : null,
    });
  };

  return (
    <SidePanel
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      label={editing ? "Edit module" : "Release a module"}
      width="lg"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
        <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
            aria-hidden
          >
            <BookOpen size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-tight text-foreground">
              {editing ? "Edit module" : "Release a module"}
            </h2>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
              {editing
                ? "Update the module details and what your advisees receive."
                : "Post the module the whole section sees — upload a file or paste a link."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[12px] font-medium text-muted-foreground">
              {kind === "adm" ? "ADM module" : "General post"}
            </span>
            <button
              type="button"
              onClick={() => {
                if (!pending) onClose();
              }}
              disabled={pending}
              aria-label={editing ? "Close edit module" : "Close release a module"}
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {/* Identity */}
        <section
          className="flex flex-col gap-2 rounded-md border bg-background/60 p-3"
          aria-label="Module details"
        >
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="module-name">Module name</Label>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {moduleName.length}/120
            </span>
          </div>
          <div className="relative">
            <BookOpen
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="module-name"
              className={`pl-8 ${FIELD_CLASS}`}
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              placeholder="e.g. Module 1 · Reading Comprehension"
              maxLength={120}
              autoFocus
            />
          </div>
          <p className="m-0 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <CalendarDays size={11} className="shrink-0" aria-hidden />
            {releasedOn
              ? `Released ${format(releasedOn, "MMM d, yyyy")} — set automatically on release.`
              : "Release date is set automatically when the module is released."}
          </p>
        </section>

        {/* Type — pickable only while releasing; fixed after release. */}
        {editing ? null : (
          <section
            className="flex flex-col gap-2 rounded-md border bg-background/60 p-3"
            aria-label="Module type"
          >
            <Label>Module type</Label>
            <div role="radiogroup" aria-label="Module type" className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    value: "general" as const,
                    label: "General post",
                    hint: "Post only — no submissions tracked.",
                  },
                  {
                    value: "adm" as const,
                    label: "ADM module",
                    hint: "Released to ADM learners; submissions tracked.",
                  },
                ]
              ).map((option) => {
                const active = kind === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={pending}
                    onClick={() => setKind(option.value)}
                    className={cn(
                      "relative flex flex-col items-start gap-1 rounded-md border px-2.5 py-2 text-left transition-colors duration-150",
                      active
                        ? "border-amber-500/50 bg-amber-500/[0.08] text-foreground"
                        : "bg-background/60 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold">{option.label}</span>
                      {active ? (
                        <Check size={13} className="shrink-0 text-amber-600" aria-hidden />
                      ) : null}
                    </span>
                    <span className="text-[12px] leading-snug">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Handout — uploaded file or pasted link. */}
        <section
          className="flex flex-col gap-2 rounded-md border bg-background/60 p-3"
          aria-label="Module handout"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Module handout</Label>
            <FilterTabs
              label="Attachment method"
              variant="tags"
              options={ATTACHMENT_OPTIONS}
              value={mode}
              onChange={(next) => {
                setMode(next);
                setUploadError(null);
              }}
            />
          </div>

          {mode === "upload" ? (
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={(event) => {
                  void pickFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              {attachment ? (
                <div className="flex min-w-0 items-center gap-2.5 rounded-md border border-border/70 bg-background/70 px-2.5 py-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <FileText size={15} aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className="truncate text-[13px] font-semibold text-foreground"
                      title={attachment.name}
                    >
                      {attachment.name}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      PDF/Word handout
                      {attachment.size ? ` · ${formatFileSize(attachment.size)}` : ""}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 shrink-0 px-2 text-[12px]"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                    aria-label="Remove attached file"
                    onClick={() => setAttachment(null)}
                    disabled={uploading}
                  >
                    <X size={13} aria-hidden />
                  </Button>
                </div>
              ) : (
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    if (uploading) return;
                    void pickFile(event.dataTransfer.files?.[0]);
                  }}
                  onClick={() => {
                    if (!uploading) fileInputRef.current?.click();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload a module file"
                  aria-busy={uploading || undefined}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-4 text-center transition-colors",
                    dragging
                      ? "border-amber-500/60 bg-amber-500/[0.08]"
                      : "border-border/80 bg-background/50 hover:border-amber-500/50 hover:bg-muted/30",
                    uploading ? "cursor-progress opacity-80" : "",
                  )}
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    {uploading ? (
                      <Loader2 size={15} className="animate-spin" aria-hidden />
                    ) : (
                      <UploadCloud size={15} aria-hidden />
                    )}
                  </span>
                  <span className="text-[13px] font-semibold text-foreground">
                    {uploading ? "Uploading…" : "Drop a PDF or Word file here"}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    or click to browse · up to 10 MB
                  </span>
                </div>
              )}
              {uploadError ? (
                <p className="m-0 text-[12px] font-medium text-red-600 dark:text-red-400" role="alert">
                  {uploadError}
                </p>
              ) : (
                <p className="m-0 text-[12px] text-muted-foreground">
                  Uploading a file releases the module today.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <Link2
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="module-url"
                  className={`pl-8 ${FIELD_CLASS}`}
                  type="url"
                  inputMode="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://drive.google.com/…"
                />
              </div>
              <p className="m-0 text-[12px] text-muted-foreground">
                Google Drive, Docs, or any https link. Saving the link releases the module today.
              </p>
            </div>
          )}
        </section>

        {/* Schedule & instructions */}
        <section
          className="grid gap-3 rounded-md border bg-background/60 p-3 sm:grid-cols-2"
          aria-label="Schedule and instructions"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-due">Due date (optional)</Label>
            <Popover open={dueOpen} onOpenChange={setDueOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  id="module-due"
                  variant="outline"
                  aria-label="Module due date"
                  className={cn(
                    "w-full justify-start gap-2 text-left font-normal",
                    !dueDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon size={14} aria-hidden />
                  {dueDate ? format(dueDate, "MMM d, yyyy") : "No due date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  defaultMonth={dueDate}
                  onSelect={(day) => {
                    setDueDate(day);
                    setDueOpen(false);
                  }}
                />
                {dueDate ? (
                  <div className="border-t p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-center text-xs"
                      onClick={() => {
                        setDueDate(undefined);
                        setDueOpen(false);
                      }}
                    >
                      Clear due date
                    </Button>
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>
            <p className="m-0 text-[12px] text-muted-foreground">
              Leave empty when the module has no deadline.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-description">Instructions (optional)</Label>
            <Textarea
              id="module-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the learner must do"
              maxLength={1000}
              rows={4}
              className={`min-h-[88px] resize-y ${FIELD_CLASS}`}
            />
          </div>
        </section>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="m-0 text-[12px] text-muted-foreground">
            {editing
              ? "Changes apply to every advisee in this section."
              : "The release date is set when you save."}
          </p>
          <Button
            type="button"
            className="ml-auto gap-1.5"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-busy={pending || uploading || undefined}
          >
            {pending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Check size={14} aria-hidden />
            )}
            {editing ? "Save changes" : "Release module"}
          </Button>
        </div>
      </div>
    </SidePanel>
  );
}
