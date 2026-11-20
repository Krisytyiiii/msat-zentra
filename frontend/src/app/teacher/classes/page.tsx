"use client";

import { MyClasses } from "./components/MyClasses";
import styles from "./components/classes.module.css";

export default function TeacherClassesPage() {
  return (
    <section className={styles.page}>
      <div className={styles.body}>
        <MyClasses />
      </div>
    </section>
  );
}
