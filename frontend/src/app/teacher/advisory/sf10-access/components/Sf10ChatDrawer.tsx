"use client";

import { Suspense } from "react";
import { MessageSquareOff } from "lucide-react";
import { BamaChat } from "@/app/teacher/chat/components/BamaChat";
import { TeacherEmptyCard } from "@/app/teacher/components/TeacherEmptyCard";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { SidePanel } from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeacherOverview } from "@/services/teacher/overview.service";

/**
 * Mini Bama chat in a side drawer, opened from the SF10 desk's "Request SF10
 * access" card so the request is filed in place instead of a new tab. It mounts
 * the same chat workspace the standalone page uses, minus the history rail, and
 * opens straight into the SF10 access request flow.
 */
export function Sf10ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const overview = useTeacherOverview();
  const isAdviser = overview.data?.isAdviser ?? false;

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="Chat with Bama"
      width="2xl"
      showCloseButton
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3 pr-12">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <StudentMascot name="Bama" character="crt" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold leading-tight text-foreground">
              Request SF10 access
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
              Bama files the request for your advisory with the registrar or record keeper.
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden p-3">
          {overview.isPending ? (
            <div className="flex h-full flex-col gap-2" aria-busy="true" aria-label="Loading chat">
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : overview.isError || !overview.data ? (
            <TeacherEmptyCard
              centered
              icon={MessageSquareOff}
              title="Chat is unavailable right now"
              hint="Check your connection and try again — your SF10 desk still works."
              label="Chat unavailable"
            />
          ) : !isAdviser ? (
            <TeacherEmptyCard
              centered
              icon={MessageSquareOff}
              title="Chat with Bama is available to class advisers"
              hint="Your account is not linked to an advisory section. Once assigned, adviser chat will appear here."
              label="Chat unavailable"
            />
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full flex-col gap-2" aria-busy="true" aria-label="Loading chat">
                  <Skeleton className="h-4 w-40 rounded" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              }
            >
              <BamaChat key="sf10-access" compact initialType="sf10-access" />
            </Suspense>
          )}
        </div>
      </div>
    </SidePanel>
  );
}
