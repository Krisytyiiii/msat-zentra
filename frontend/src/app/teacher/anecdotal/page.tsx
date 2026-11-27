"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "@/lib/api/live";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchMyRecords, type MyAnecdotalRecord } from "@/components/ocform01/folders";
import { useTerm } from "@/lib/term/TermContext";
import { AnecdotalEmptyKanban } from "./components/AnecdotalEmptyKanban";
import { AnecdotalChatDrawer } from "./components/AnecdotalChatDrawer";
import { AnecdotalArchiveDialog } from "./components/AnecdotalArchiveDialog";
import { AnecdotalRepoFolders } from "./components/AnecdotalRepoFolders";
import { AnecdotalRepoFoldersSkeleton } from "./components/AnecdotalRepoFoldersSkeleton";
import { AnecdotalToolbarActions } from "./components/AnecdotalSideRail";
import styles from "./components/anecdotal-repo.module.css";

function TeacherAnecdotalPageView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const chatDeepLink = searchParams.get("chat") === "1";
  const { activeTerm } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const recordsQuery = useLiveQuery<MyAnecdotalRecord[]>({
    queryKey: ["anecdotal-mine", termKey],
    queryFn: fetchMyRecords,
    retry: false,
    staleTime: 60_000,
  });
  const records = React.useMemo(
    () => (Array.isArray(recordsQuery.data) ? recordsQuery.data : []),
    [recordsQuery.data]
  );
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [editRecordId, setEditRecordId] = React.useState<string | null>(null);

  function openChat() {
    setEditRecordId(null);
    setChatOpen(true);
  }

  function openEdit(id: string) {
    setEditRecordId(id);
    setChatOpen(true);
  }

  // Other desks deep-link here with `?chat=1` ("Chat now" on the referral
  // starter board) so the Bama drawer opens in place instead of a new tab.
  // The param is stripped once consumed, so a refresh/back does not re-open it.
  React.useEffect(() => {
    if (!chatDeepLink) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot deep link
    setChatOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("chat");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [chatDeepLink, searchParams, router, pathname]);

  if (recordsQuery.isPending) {
    return <AnecdotalRepoFoldersSkeleton />;
  }

  if (recordsQuery.isError) {
    return (
      <section className={styles.page}>
        <p className={styles.error}>
          Your filed records could not be loaded. Check your connection and try again.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button
            size="sm"
            variant="outline"
            disabled={recordsQuery.isRefetching}
            onClick={() => recordsQuery.refetch()}
          >
            {recordsQuery.isRefetching ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            {recordsQuery.isRefetching ? "Retrying…" : "Try again"}
          </Button>
        </div>
      </section>
    );
  }

  if (records.length === 0) {
    return (
      <section className={styles.page} aria-label="Anecdotal records">
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="w-full">
            <AnecdotalEmptyKanban
              onOpenArchive={() => setArchiveOpen(true)}
              onOpenChat={openChat}
            />
          </div>
        </div>
        <AnecdotalChatDrawer
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          editRecordId={editRecordId}
        />
        <AnecdotalArchiveDialog open={archiveOpen} onClose={() => setArchiveOpen(false)} />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={`${styles.main} flex min-w-0 flex-col`}>
        <AnecdotalRepoFolders
          records={records}
          toolbarActions={<AnecdotalToolbarActions onOpenChat={openChat} />}
          onEditRecord={openEdit}
        />
      </div>
      <AnecdotalChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        editRecordId={editRecordId}
      />
    </section>
  );
}

export default function TeacherAnecdotalPage() {
  // `useSearchParams` (the `?chat=1` deep link) needs a Suspense boundary in
  // the app router; the desk already paints this skeleton while records load.
  return (
    <React.Suspense fallback={<AnecdotalRepoFoldersSkeleton />}>
      <TeacherAnecdotalPageView />
    </React.Suspense>
  );
}
