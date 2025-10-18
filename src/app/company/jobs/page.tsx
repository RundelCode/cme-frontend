import React from 'react';
import styles from './companyJobs.module.css';
import Client from './client';
import Navbar from '../../../../components/navbar/navbar';

export default function Page() {
  return (
    <div className={styles.page}>
      <Navbar />
      <Client />
    </div>
  );
}
