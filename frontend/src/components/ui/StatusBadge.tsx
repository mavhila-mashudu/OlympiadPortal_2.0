import type { RoundStatus } from "../../lib/mockData";
import styles from "./StatusBadge.module.css";

const labels: Record<RoundStatus, string> = {
  closed: "Closed",
  open: "Open",
  upcoming: "Upcoming",
};

type StatusBadgeProps = {
  status: RoundStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[status]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
