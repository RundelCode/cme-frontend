import Navbar from "../../../../components/navbar/navbar";
import CompanySearchClient from "./Client";
import styles from './users.module.css'


export default async function Page() {
  return (
    <div className={styles.page}>
      <Navbar/>
      <CompanySearchClient />
    </div>
  );
}
