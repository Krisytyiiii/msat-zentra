"use client";

import { InterventionBriefing } from "./components/InterventionBriefing";
import menu from "../heatmaps/components/heatmap.module.css";
import styles from "./interventions.module.css";

export default function PrincipalInterventionsPage() {
  return (
    <div className={menu.shell}>
      <div className={menu.layout}>
        <section className={styles.page}>
          <InterventionBriefing />
        </section>
      </div>
    </div>
  );
}
