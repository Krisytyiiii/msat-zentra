"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BamaChat } from "./components/BamaChat";
import { TeacherEmptyCard } from "../components/TeacherEmptyCard";
import { Skeleton } from "@/components/ui/skeleton";
import chatStyles from "./components/bama-chat.module.css";
import { MessageSquareOff } from "lucide-react";
import { useTeacherOverview } from "@/services/teacher/overview.service";

export default function TeacherChatPage() {
  return (
    <Suspense>
      <TeacherChatGate />
    </Suspense>
  );
}

function TeacherChatGate() {
  const router = useRouter();
  const overview = useTeacherOverview();
  const isAdviser = overview.data?.isAdviser ?? false;

  useEffect(() => {
    if (!overview.isPending && overview.data && !overview.data.isAdviser) {
      router.replace("/teacher/overview");
    }
  }, [overview.isPending, overview.data, router]);

  if (overview.isPending || overview.isError || !overview.data) {
    return (
      <section className={chatStyles.page} aria-busy="true" aria-label="Loading chat">
        <div className={chatStyles.layout}>
          {/* History rail — new-chat button, search field, then the grouped boards */}
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
            <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/40 p-2.5 dark:bg-muted/20">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-4" />
              </div>
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-3 shadow-sm"
                >
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              ))}
            </div>
          </div>

          {/* Thread — welcome hero + the three starter cards, then the composer */}
          <div className={chatStyles.body}>
            <div className="flex flex-1 flex-col items-center justify-center gap-2.5 overflow-hidden px-6 py-8 text-center">
              <Skeleton className="size-24 shrink-0 rounded-full" />
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-3.5 w-80 max-w-full" />
              <div className="mt-3 grid w-full max-w-4xl grid-cols-1 gap-3 text-left md:grid-cols-3">
                {[0, 1, 2].map((card) => (
                  <div
                    key={card}
                    className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/40 p-2.5 dark:bg-muted/20"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Skeleton className="size-3.5 shrink-0 rounded" />
                        <Skeleton className="h-3.5 w-24" />
                      </span>
                      <Skeleton className="h-6 w-12 shrink-0 rounded-md" />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="size-6 shrink-0 rounded-full" />
                      </div>
                      <Skeleton className="h-3.5 w-4/5" />
                      <Skeleton className="h-3 w-3/5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Skeleton className="h-12 w-full shrink-0 rounded-xl" />
          </div>
        </div>
      </section>
    );
  }

  if (!isAdviser) {
    return (
      <TeacherEmptyCard
        centered
        icon={MessageSquareOff}
        title="Chat with Bama is available to class advisers"
        hint="Your account is not linked to an advisory section. Once assigned, adviser chat will appear here."
        label="Chat unavailable"
      />
    );
  }

  return <BamaChat />;
}
