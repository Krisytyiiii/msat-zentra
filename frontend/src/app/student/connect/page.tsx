"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/ui/pill";
import { useRedeemLearnerCode, useStudentMe } from "@/services/student/portal.service";

function messageOf(err: unknown): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } })
    ?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return "Could not link this code. Ask your adviser to check it.";
}

export default function StudentConnectPage() {
  const router = useRouter();
  const me = useStudentMe();
  const redeem = useRedeemLearnerCode();
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const placement = me.data?.placement ?? null;
  const placed = placement?.state === "placed";

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const value = code.trim();
    if (!value) {
      setError("Enter the code from your enrolment slip.");
      return;
    }
    redeem.mutate(value, {
      onSuccess: (result) => {
        router.replace("/student/modules");
        setCode("");
        if (!result.alreadyPlaced) {
          router.refresh();
        }
      },
      onError: (err) => setError(messageOf(err)),
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 py-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-md border border-border bg-card text-primary">
            <GraduationCap size={18} aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-[-0.01em] text-foreground">Link your class</h1>
            <p className="text-xs text-muted-foreground">
              {me.data?.learner?.name ?? "Learner portal"}
              {placement?.lrn ? ` · LRN ${placement.lrn}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={placed ? "green" : "amber"} label={placed ? "Placed" : "Waiting for a code"}>
            {placed ? `In ${placement?.sectionName ?? "class"}` : "Not placed yet"}
          </Pill>
          {me.data?.term?.schoolYearName ? (
            <Pill tone="blue">{me.data.term.schoolYearName}</Pill>
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        {placed ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground">
              You are already in {placement?.sectionName ?? "your class"}.
            </p>
            <Button type="button" onClick={() => router.replace("/student/modules")}>
              Go to my modules
            </Button>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <KeyRound size={13} aria-hidden /> Class code
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the code your adviser gave you (for example <span className="font-semibold">LNK-7K2Q9</span>).
              It links this account to your section and its classes.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="learner-code" className="text-xs">
                Code
              </Label>
              <Input
                id="learner-code"
                name="code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="LNK-XXXXX"
                autoComplete="off"
                spellCheck={false}
                maxLength={20}
                autoFocus
              />
            </div>
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={redeem.isPending}>
              {redeem.isPending ? "Linking…" : "Link my class"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Still waiting? Ask your adviser to enlist you and share your code.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
