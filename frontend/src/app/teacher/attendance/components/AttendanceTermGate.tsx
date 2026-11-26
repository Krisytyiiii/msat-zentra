"use client";

import { TeacherGateCard } from "@/app/teacher/components/TeacherGateCard";

export function AttendanceTermGate({ termLabel }: { termLabel: string }) {
  return (
    <section className="flex flex-col">
      <TeacherGateCard
        title="Open this term"
        subtitle="Attendance sheets need the term opened"
        status="Term not entered"
        description={`Attendance is closed for ${termLabel}. Enter your teacher code once on My Classes and this page fills with the term's sheets.`}
        termLabel={termLabel}
        facts={[
          "Nothing needs relinking — only this term has to be opened.",
          "One code covers every term of this school year.",
          "Sheet dates and the advisory section still decide which learners you mark.",
        ]}
        actionLabel="Enter term"
      />
    </section>
  );
}

export function AttendanceLinkGate({ termLabel }: { termLabel: string }) {
  return (
    <section className="flex flex-col">
      <TeacherGateCard
        title="Link your teacher code"
        subtitle="Attendance needs your linked teacher row"
        status="Not linked yet"
        description="Your sheets appear only after you link the teacher code printed beside your name. The link button opens the form on My Classes."
        termLabel={termLabel}
        facts={[
          "The code sits beside your name in the administrator's teacher list.",
          "Linking attaches your subject × section load to this login.",
          "Attendance opens for the selected term once the code is entered.",
        ]}
        actionLabel="Link now"
      />
    </section>
  );
}
