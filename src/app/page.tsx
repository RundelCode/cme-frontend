import Image from "next/image";
import styles from "./page.module.css";
import Navbar from "../../components/navbar/navbar";
import JobOffersIcon from "../../public/images/icons/Nav/JobOffers.png";
import JobSearchClient from "../../components/jobs/JobSearchClient";

export default function Page() {
  return (
    <div className={styles.page}>
      <Navbar />
      <div className={styles.main}>
        <div className={styles.blueLine} />
        <div className={styles.title}>
          <Image
            className={styles.jobsOfferIcon}
            src={JobOffersIcon}
            alt="Jobs"
            width={320}
            height={320}
            priority
          />
          <h2>Ofertas Laborales</h2>
        </div>

        <div className={styles.jobListContainer}>
          <JobSearchClient />
        </div>
      </div>
    </div>
  );
}
