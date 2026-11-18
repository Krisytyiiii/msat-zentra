"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Loader2, TabletSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { markSelfNotified } from "@/lib/realtime/coordinatorChannel";
import { apiErrorMessage } from "@/lib/api/errors";
import { useDock } from "@/components/dock/dock-store";
import type { AdmApprovalRow } from "@/services/coordinator/coordinator.types";
import styles from "./coordinator-devices-issue-dialog.module.css";

const DEVICE_TYPE_OPTIONS = ["Tablet", "Phone", "Laptop", "Chromebook"] as const;

interface CoordinatorDevicesIssueDialogProps {
  open: boolean;

  candidates: AdmApprovalRow[];
  candidatesPending: boolean;
  onClose: () => void;

  onIssued: () => void;
}

export function CoordinatorDevicesIssueDialog({
  open,
  candidates,
  candidatesPending,
  onClose,
  onIssued,
}: CoordinatorDevicesIssueDialogProps) {
  const [profileId, setProfileId] = React.useState("");
  const [deviceType, setDeviceType] = React.useState<string>("Tablet");
  const [deviceSerial, setDeviceSerial] = React.useState("");
  const [conditionNotes, setConditionNotes] = React.useState("");
  const [issueError, setIssueError] = React.useState<string | null>(null);
  const [candidateQuery, setCandidateQuery] = React.useState("");
  const { startTask, completeTask, failTask } = useDock();
  const dockTaskRef = React.useRef<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = candidateQuery.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (r) =>
        r.student.toLowerCase().includes(q) ||
        r.lrn.toLowerCase().includes(q),
    );
  }, [candidates, candidateQuery]);
  const selectedCandidate =
    candidates.find((r) => r.id === profileId) ?? null;

  const close = React.useCallback(() => {
    setProfileId("");
    setDeviceSerial("");
    setConditionNotes("");
    setIssueError(null);
    setCandidateQuery("");
    onClose();
  }, [onClose]);

  const issueMutation = useMutation({
    mutationFn: async (vars: {
      admLearnerProfileId: string;
      deviceType: string;
      deviceSerial: string;
      conditionNotes?: string;
    }) => {
      const { data } = await apiClient.post("/api/adm/devices/issue", vars);
      return data;
    },
    onSuccess: (data, vars) => {
      const newId =
        typeof (data as { id?: unknown })?.id === "string"
          ? (data as { id: string }).id
          : null;
      if (newId) markSelfNotified(newId);
      if (dockTaskRef.current) {
        completeTask(dockTaskRef.current, "Device recorded as issued.");
        dockTaskRef.current = null;
      }
      onIssued();
      toast.success({
        title: "Device issued",
        description: `Serial ${vars.deviceSerial} recorded as issued.`,
      });
    },
    onError: (err) => {
      const message = apiErrorMessage(err);
      if (dockTaskRef.current) {
        failTask(dockTaskRef.current, message);
        dockTaskRef.current = null;
      }
      setIssueError(message);
      toast.error({ title: "Could not issue device", description: message });
    },
  });

  const submit = () => {
    const serial = deviceSerial.trim();
    if (!profileId || !serial) {
      setIssueError(
        "Select an approved learner case and enter the device serial number.",
      );
      return;
    }
    dockTaskRef.current = startTask({
      kind: "generic",
      title: "Issuing learning device",
      description: `${deviceType.trim()} · ${serial}${
        selectedCandidate ? ` · ${selectedCandidate.student}` : ""
      }`,
    });
    issueMutation.mutate({
      admLearnerProfileId: profileId,
      deviceType: deviceType.trim(),
      deviceSerial: serial,
      ...(conditionNotes.trim()
        ? { conditionNotes: conditionNotes.trim() }
        : {}),
    });
    close();
  };

  if (!open) return null;

  return (
    <KanbanOverlay
      open={open}
      onClose={close}
      title="Issue device"
      ariaLabel="Issue device"
      dismissable={!issueMutation.isPending}
      icon={
        <span
          className="text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        >
          <TabletSmartphone size={14} />
        </span>
      }
      description="Records a learning device as issued to a principal-approved ADM learner with no device yet."
      footer={
        <div className="flex items-center justify-end gap-1.5 px-1 pb-1">
          <Button
            size="sm"
            className="h-6 px-2.5 text-xs"
            aria-busy={issueMutation.isPending || undefined}
            disabled={
              issueMutation.isPending ||
              !profileId ||
              !deviceType.trim() ||
              !deviceSerial.trim()
            }
            onClick={submit}
          >
            {issueMutation.isPending ? (
              <Loader2 className={styles.spin} aria-hidden="true" />
            ) : null}
            {issueMutation.isPending ? "Issuing…" : "Issue device"}
          </Button>
        </div>
      }
    >
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <Label className={styles.formLabel} htmlFor="dev-profile">
            Approved learner case
          </Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id="dev-profile"
                variant="outline"
                className={styles.candidateTrigger}
              >
                {selectedCandidate ? (
                  <span className={styles.candidateValue}>
                    <StudentMascot
                      name={selectedCandidate.student}
                      seed={selectedCandidate.lrn}
                      character={selectedCandidate.mascot ?? undefined}
                      size={24}
                    />
                    <span className={styles.candidateText}>
                      <span className={styles.candidateName}>
                        {selectedCandidate.student}
                      </span>
                      <Pill
                        label="LRN"
                        className={styles.candidateLrn}
                      >
                        {selectedCandidate.lrn}
                      </Pill>
                    </span>
                  </span>
                ) : (
                  <span className={styles.pickerLabel}>
                    Select an approved case…
                  </span>
                )}
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className={`z-[70] ${styles.candidateMenu}`}
            >
              <div style={{ padding: "0.375rem" }}>
                <Input
                  placeholder="Search approved cases…"
                  value={candidateQuery}
                  onChange={(e) => setCandidateQuery(e.target.value)}
                  aria-label="Search approved cases without devices"
                  style={{ height: "2rem", fontSize: "0.8125rem" }}
                />
              </div>

              <div style={{ padding: "0 0.625rem 0.375rem" }}>
                {candidatesPending && filtered.length === 0 ? (
                  <DropdownMenuItem disabled>Loading cases…</DropdownMenuItem>
                ) : filtered.length === 0 ? (
                  <DropdownMenuItem disabled>
                    {candidateQuery.trim()
                      ? "No cases match this search."
                      : "Every approved case already has a device"}
                  </DropdownMenuItem>
                ) : (
                  filtered.map((r) => (
                    <DropdownMenuItem
                      key={r.id}
                      onSelect={() => setProfileId(r.id)}
                      className={styles.candidateItem}
                    >
                      <StudentMascot
                        name={r.student}
                        seed={r.lrn}
                        character={r.mascot ?? undefined}
                        size={32}
                      />
                      <span className={styles.candidateText}>
                        <span className={styles.candidateName}>
                          {r.student}
                        </span>
                        <Pill label="LRN" className={styles.candidateLrn}>
                          {r.lrn}
                        </Pill>
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className={styles.formField}>
          <Label className={styles.formLabel} htmlFor="dev-type">
            Device type
          </Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id="dev-type"
                variant="outline"
                style={{ width: "100%", justifyContent: "space-between" }}
              >
                {deviceType || "Select device type…"}
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[70]">
              {DEVICE_TYPE_OPTIONS.map((t) => (
                <DropdownMenuItem key={t} onSelect={() => setDeviceType(t)}>
                  {t}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className={styles.formField}>
          <Label className={styles.formLabel} htmlFor="dev-serial">
            Serial number
          </Label>
          <Input
            id="dev-serial"
            value={deviceSerial}
            onChange={(e) => {
              setDeviceSerial(e.target.value);
              if (issueError) setIssueError(null);
            }}
            placeholder="e.g. SN48213"
            aria-invalid={issueError ? true : undefined}
          />
        </div>

        <div className={styles.formField}>
          <Label className={styles.formLabel} htmlFor="dev-condition">
            Condition at issuance (optional)
          </Label>
          <Input
            id="dev-condition"
            value={conditionNotes}
            onChange={(e) => setConditionNotes(e.target.value)}
            placeholder="e.g. New, with charger and case"
          />
        </div>

        {issueError ? (
          <p role="alert" className={styles.formError}>
            {issueError}
          </p>
        ) : null}
      </div>
    </KanbanOverlay>
  );
}
