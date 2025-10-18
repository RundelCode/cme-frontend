import Navbar from "../../../../components/navbar/navbar";
import JobDetailClient from "./client";
import styles from "./jobs.module.css";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function JobDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <main className={styles.page}>
      <Navbar />
      <JobDetailClient jobId={id} />
    </main>
  );
}
