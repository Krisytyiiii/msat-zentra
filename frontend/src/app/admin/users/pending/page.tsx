"use client";

import { AccountApprovals } from "../components/AccountApprovals";
import styles from "../users.module.css";

/**
 * Administrator approval desk. Every self-registered student, parent and
 * teacher lands here; the registry desks no longer review sign-ups.
 */
export default function PendingApprovalsPage() {
  return (
    <section className={styles.page}>
      <AccountApprovals />
    </section>
  );
}
