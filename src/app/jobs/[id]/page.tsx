import Navbar from "../../../../components/navbar/navbar";
import JobDetailClient from "./client";
import styles from "./jobs.module.css";

type PageProps = { params: { id: string } };

export default function JobDetailPage({ params }: PageProps) {
  const { id } = params;

  return (
    <main className={styles.main}>
      <Navbar />
      <div className={styles.page}>
        <JobDetailClient jobId={id} />
      </div>
    </main>
  );
}
