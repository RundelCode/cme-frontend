import styles from './finance.module.css';
import Navbar from '../../../components/navbar/navbar';
import Client from './client';


export default function FinancePage() {
    
    return (
        <div className={styles.page}>
            <Navbar />
            <Client></Client>
        </div>
    );
}
